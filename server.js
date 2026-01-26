import express from "express";
import http from "http";
import { WebSocketServer } from "ws";

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const PORT = process.env.PORT || 3000;

app.use(express.static("public"));

/* ===== GAME STATE ===== */
let numbers = Array.from({ length: 75 }, (_, i) => i + 1);
let drawn = [];
let running = false;

/* ===== CLIENTS ===== */
const clients = new Set();

/* ===== WEBSOCKET ===== */
wss.on("connection", (ws) => {
  clients.add(ws);

  // send current state on connect
  ws.send(
    JSON.stringify({
      type: "state",
      drawn,
      running
    })
  );

  ws.on("message", (msg) => {
    const data = JSON.parse(msg);

    if (data.type === "draw" && !running) {
      drawNumber();
    }

    if (data.type === "reset") {
      resetGame();
    }
  });

  ws.on("close", () => clients.delete(ws));
});

/* ===== GAME LOGIC ===== */
function drawNumber() {
  if (numbers.length === 0) return;

  running = true;

  const index = Math.floor(Math.random() * numbers.length);
  const number = numbers.splice(index, 1)[0];
  drawn.push(number);

  broadcast({
    type: "number",
    number,
    drawn
  });

  running = false;
}

function resetGame() {
  numbers = Array.from({ length: 75 }, (_, i) => i + 1);
  drawn = [];
  running = false;

  broadcast({
    type: "reset"
  });
}

function broadcast(obj) {
  const msg = JSON.stringify(obj);
  for (const ws of clients) {
    if (ws.readyState === 1) ws.send(msg);
  }
}

server.listen(PORT, () => {
  console.log("✅ Bingo LIVE server running on", PORT);
});
