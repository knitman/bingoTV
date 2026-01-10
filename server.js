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

// tickets: { [id]: { id, name, nums[], winner, ready } }
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

function getPlayersProgress() {
  return Object.values(tickets)
    .map(t => {
      const hits = t.nums.filter(n => drawn.includes(n)).length;
      const total = t.nums.length;
      const progress = Math.round((hits / total) * 100);
      return {
        id: t.id,
        name: t.name || ("Παίκτης " + t.id),
        hits,
        total,
        progress,
        winner: !!t.winner,
        ready: !!t.ready
      };
    })
    .sort((a, b) => b.progress - a.progress);
}

function areAllExpectedPlayersReady() {
  if (!expectedPlayersCount) return false;
  const allTickets = Object.values(tickets);
  if (allTickets.length < expectedPlayersCount) return false;
  const readyCount = allTickets.filter(t => t.ready).length;
  return readyCount >= expectedPlayersCount;
}

/* ===== HTTP API ===== */
app.get("/api/draw", (req, res) => {
  if (gameOver) return res.json({ done: true, gameOver: true });
  if (!running) return res.json({ error: "Game not running" });

  if (numbers.length === 0) {
    running = false;
    broadcast({ type: "done" });
    return res.json({ done: true });
  }

  const i = Math.floor(Math.random() * numbers.length);
  const num = numbers.splice(i, 1)[0];
  drawn.push(num);

  const players = getPlayersProgress();

  broadcast({
    type: "number",
    number: num,
    drawn,
    players
  });

  res.json({ number: num, drawn, players });
});

app.post("/api/start", (req, res) => {
  if (gameOver) return res.json({ ok: false, gameOver: true });

  if (expectedPlayersCount > 0 && !areAllExpectedPlayersReady()) {
    return res.json({ ok: false, reason: "not_all_ready" });
  }

  running = true;
  res.json({ ok: true });
});

app.post("/api/stop", (req, res) => {
  running = false;
  res.json({ ok: true });
});

app.post("/api/reset", (req, res) => {
  numbers = Array.from({ length: 75 }, (_, i) => i + 1);
  drawn = [];
  running = false;
  gameOver = false;

  Object.values(tickets).forEach(t => {
    t.winner = false;
    t.ready = false;
  });

  broadcast({ type: "reset" });
  broadcast({ type: "players", players: getPlayersProgress() });

  res.json({ ok: true });
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
app.post("/api/ticket", (req, res) => {
  const { name } = req.body || {};

  const ticketId = generateTicketId();

  let nums = [];
  while (nums.length < 15) {
    let n = Math.floor(Math.random() * 75) + 1;
    if (!nums.includes(n)) nums.push(n);
  }

  tickets[ticketId] = {
    id: ticketId,
    name,
    nums,
    winner: false,
    ready: false
  };

  broadcast({ type: "players", players: getPlayersProgress() });

  res.json({ ticketId });
});

app.post("/api/tickets/bulk", (req, res) => {
  const { names } = req.body || {};
  if (!Array.isArray(names) || names.length === 0) {
    return res.status(400).json({ error: "names must be non-empty array" });
  }

  tickets = {};
  expectedPlayersCount = names.length;

  const created = [];

  names.forEach(rawName => {
    const name = (rawName || "").toString().trim();
    if (!name) return;

    const ticketId = generateTicketId();
    let nums = [];
    while (nums.length < 15) {
      let n = Math.floor(Math.random() * 75) + 1;
      if (!nums.includes(n)) nums.push(n);
    }

    tickets[ticketId] = {
      id: ticketId,
      name,
      nums,
      winner: false,
      ready: false
    };

    created.push({ name, ticketId });
  });

  broadcast({ type: "players", players: getPlayersProgress() });

  res.json(created);
});

app.get("/api/ticket/:id", (req, res) => {
  const ticket = tickets[req.params.id];
  if (!ticket) return res.status(404).json({ error: "Not found" });
  res.json(ticket);
});

app.post("/api/ready/:id", (req, res) => {
  const ticket = tickets[req.params.id];
  if (!ticket) return res.status(404).json({ error: "Ticket not found" });

  ticket.ready = true;

  const allReady = areAllExpectedPlayersReady();

  broadcast({ type: "players", players: getPlayersProgress() });

  if (allReady) {
    broadcast({
      type: "all_ready",
      expectedPlayers: expectedPlayersCount
    });
  }

  res.json({ ok: true, allReady });
});

app.post("/api/bingo/:id", (req, res) => {
  const ticket = tickets[req.params.id];
  if (!ticket) return res.json({ winner: false });

  // Ελέγχουμε μόνο αν όλοι οι αριθμοί έχουν βγει
  const winner = ticket.nums.every(n => drawn.includes(n));

  if (winner) {
    ticket.winner = true;
    running = false;
    gameOver = true;
  }

  broadcast({
    type: "bingo",
    id: ticket.id,
    name: ticket.name || ("Παίκτης " + ticket.id),
    winner
  });

  broadcast({ type: "players", players: getPlayersProgress() });

  if (winner) broadcast({ type: "gameover" });

  res.json({ winner });
});

/* ===== WEBSOCKETS ===== */
const server = http.createServer(app);
const wss = new WebSocketServer({ server });
const clients = new Set();

wss.on("connection", ws => {
  clients.add(ws);

  ws.send(
    JSON.stringify({
      type: "state",
      drawn,
      players: getPlayersProgress(),
      gameOver,
      expectedPlayersCount
    })
  );

  ws.on("close", () => clients.delete(ws));
});

function broadcast(obj) {
  const msg = JSON.stringify(obj);
  for (const ws of clients) {
    if (ws.readyState === 1) ws.send(msg);
  }
}

server.listen(PORT, () => {
  console.log("✅ Bingo server running on port", PORT);
});
