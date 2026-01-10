import express from "express";
import http from "http";
import { WebSocketServer } from "ws";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static("public"));

/* ===== GAME STATE ===== */

let numbers = Array.from({ length: 75 }, (_, i) => i + 1);
let drawn = [];
let running = false;
let gameOver = false;

// tickets[id] = { id, name, nums, ready, winner }
let tickets = {};
let expectedPlayersCount = 0;

/* ===== HELPERS ===== */

function generateTicketId() {
  let id;
  do {
    id = Math.floor(10000 + Math.random() * 90000);
  } while (tickets[id]);
  return id;
}

function generateNumbers() {
  const nums = [];
  while (nums.length < 15) {
    const n = Math.floor(Math.random() * 75) + 1;
    if (!nums.includes(n)) nums.push(n);
  }
  return nums;
}

function getPlayersProgress() {
  return Object.values(tickets).map(t => {
    const hits = t.nums.filter(n => drawn.includes(n)).length;
    return {
      id: t.id,
      name: t.name || `Παίκτης ${t.id}`,
      hits,
      total: t.nums.length,
      progress: Math.round((hits / t.nums.length) * 100),
      ready: !!t.ready,
      winner: !!t.winner
    };
  });
}

function areAllExpectedPlayersReady() {
  if (!expectedPlayersCount) return false;
  const list = Object.values(tickets);
  if (list.length < expectedPlayersCount) return false;
  return list.every(t => t.ready);
}

/* ===== GAME API ===== */

app.post("/api/start", (req, res) => {
  if (expectedPlayersCount && !areAllExpectedPlayersReady()) {
    return res.json({ ok: false, reason: "not_all_ready" });
  }
  running = true;
  res.json({ ok: true });
});

app.get("/api/draw", (req, res) => {
  if (!running || gameOver) return res.json({ ok: false });

  const i = Math.floor(Math.random() * numbers.length);
  const num = numbers.splice(i, 1)[0];
  drawn.push(num);

  broadcast({
    type: "number",
    number: num,
    drawn,
    players: getPlayersProgress()
  });

  res.json({ number: num });
});

app.post("/api/newgame", (req, res) => {
  numbers = Array.from({ length: 75 }, (_, i) => i + 1);
  drawn = [];
  running = false;
  gameOver = false;
  tickets = {};
  expectedPlayersCount = 0;

  broadcast({ type: "newgame" });
  res.json({ ok: true });
});

/* ===== TICKETS ===== */

// Δημιουργία 1 κουπονιού
app.post("/api/ticket", (req, res) => {
  const { name } = req.body || {};

  const id = generateTicketId();
  tickets[id] = {
    id,
    name,
    nums: generateNumbers(),
    ready: false,
    winner: false
  };

  broadcast({ type: "players", players: getPlayersProgress() });
  res.json({ ticketId: id });
});

// Bulk κουπόνια
app.post("/api/tickets/bulk", (req, res) => {
  const { names } = req.body || {};
  if (!Array.isArray(names) || names.length === 0) {
    return res.status(400).json({ error: "names array required" });
  }

  tickets = {};
  expectedPlayersCount = names.length;

  const created = [];

  names.forEach(raw => {
    const name = String(raw || "").trim();
    if (!name) return;

    const id = generateTicketId();
    tickets[id] = {
      id,
      name,
      nums: generateNumbers(),
      ready: false,
      winner: false
    };
    created.push({ id, name });
  });

  broadcast({ type: "players", players: getPlayersProgress() });
  res.json(created);
});

// Φόρτωση κουπονιού
app.get("/api/ticket/:id", (req, res) => {
  const ticket = tickets[req.params.id];
  if (!ticket) return res.status(404).json({ error: "Not found" });
  res.json(ticket);
});

// Ready
app.post("/api/ready/:id", (req, res) => {
  const ticket = tickets[req.params.id];
  if (!ticket) return res.status(404).json({ error: "Not found" });

  ticket.ready = true;

  const allReady = areAllExpectedPlayersReady();
  broadcast({ type: "players", players: getPlayersProgress() });

  if (allReady) broadcast({ type: "all_ready" });

  res.json({ ok: true, allReady });
});

// Bingo
app.post("/api/bingo/:id", (req, res) => {
  const ticket = tickets[req.params.id];
  if (!ticket) return res.json({ winner: false });

  const winner = ticket.nums.every(n => drawn.includes(n));

  if (winner) {
    ticket.winner = true;
    running = false;
    gameOver = true;
    broadcast({ type: "gameover" });
  }

  broadcast({
    type: "bingo",
    id: ticket.id,
    name: ticket.name,
    winner
  });

  res.json({ winner });
});

/* ===== WEBSOCKETS ===== */

const server = http.createServer(app);
const wss = new WebSocketServer({ server });
const clients = new Set();

wss.on("connection", ws => {
  clients.add(ws);
  ws.send(JSON.stringify({
    type: "state",
    drawn,
    players: getPlayersProgress(),
    gameOver
  }));
  ws.on("close", () => clients.delete(ws));
});

function broadcast(data) {
  const msg = JSON.stringify(data);
  clients.forEach(ws => {
    if (ws.readyState === 1) ws.send(msg);
  });
}

server.listen(PORT, () => {
  console.log("✅ Bingo server running on port", PORT);
});
