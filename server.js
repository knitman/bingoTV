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
  if (allTick
