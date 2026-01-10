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
  return Object.values(tickets).map(t => {
    const hits = t.nums.filter(n => drawn.includes(n)).length;
    return {
      id: t.id,
      name: t.name || `Παίκτης ${t.id}`,
      hits,
      total: t.nums.length,
      progress: Math.round((hits / t.nums.length) * 100),
      winner: !!t.winner,
      ready: !!t.ready
    };
  });
}

function areAllExpectedPlayersReady() {
  if (!expectedPlayersCount) return false;
  const list = Object.values(tickets);
  if (list.length < expectedPlayersCount) return false;
  return list.every(t => t.ready);
}

/* ===== API ===== */

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

app.post("/api/start", (req, res) => {
  if (expectedPlayersCount && !areAllExpectedPlayersReady()) {
    return res.json({ ok: false });
  }
  running = true;
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
  const id = generateTicketId();
  let nums = [];
  while (nums.length < 15) {
    const n = Math.floor(Math.random() * 75) + 1;
    if (!nums.includes(n)) nums.push(n);
  }

  tickets[id] = {
    id,
    name: req.body?.name,
    nums,
    winner: false,
    ready: false
  };

  broadcast({ type: "players", players: getPlayersProgress() });
  res.json({ ticketId: id });
});

app.post("/api/bingo/:id", (req, res) => {
  const t = tickets[req.params.id];
  if (!t) return res.json({ winner: false });

  const winner = t.nums.every(n => drawn.includes(n));

  if (winner) {
    t.winner = true;
    running = false;
    gameOver = true;
    broadcast({ type: "gameover" });
  }

  broadcast({
    type: "bingo",
    id: t.id,
    name: t.name,
    winner
  });

  res.json({ winner });
});

/* ===== WEBSOCKET ===== */

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
