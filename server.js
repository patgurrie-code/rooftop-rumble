'use strict';
// Rooftop Rumble server: serves the game page and relays player state between people in the same room.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 3000;
// The game page can sit in a public/ folder or right next to server.js.
const INDEX_PATHS = [path.join(__dirname, 'public', 'index.html'), path.join(__dirname, 'index.html')];
const MAX_PER_ROOM = 16;
const MAX_ROOMS = 500;
const ROOM_RE = /^[a-z0-9][a-z0-9_.-]{0,47}$/;
const ID_RE = /^[a-z0-9]{8,32}$/;

const server = http.createServer((req, res) => {
  const url = (req.url || '/').split('?')[0];
  if (url === '/healthz') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('ok');
    return;
  }
  if (url === '/' || url === '/index.html') {
    const tryRead = i => {
      if (i >= INDEX_PATHS.length) { res.writeHead(500, { 'Content-Type': 'text/plain' }); res.end('Game file missing: upload index.html'); return; }
      fs.readFile(INDEX_PATHS[i], (err, data) => {
        if (err) { tryRead(i + 1); return; }
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
        res.end(data);
      });
    };
    tryRead(0);
    return;
  }
  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not found');
});

const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 16 * 1024 });
const rooms = new Map(); // room code -> Map(player id -> client)

function send(ws, obj) {
  if (ws.readyState === 1) ws.send(JSON.stringify(obj));
}
function broadcast(room, obj, exceptId) {
  const msg = JSON.stringify(obj);
  for (const [id, c] of room) if (id !== exceptId && c.ws.readyState === 1) c.ws.send(msg);
}
function leave(client) {
  if (!client.room) return;
  const room = rooms.get(client.room);
  if (room && room.get(client.id) === client) {
    room.delete(client.id);
    broadcast(room, { t: 'left', id: client.id });
    if (room.size === 0) rooms.delete(client.room);
  }
  client.room = null;
}

wss.on('connection', ws => {
  const client = { ws, id: null, room: null, presence: {}, budget: 120, last: Date.now() };
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });

  ws.on('message', (data, isBinary) => {
    // Simple rate limit: about 90 messages a second per player, with some burst room.
    const now = Date.now();
    client.budget = Math.min(180, client.budget + (now - client.last) * 0.09);
    client.last = now;
    if (client.budget < 1) return;
    client.budget -= 1;
    if (isBinary) return;

    let m;
    try { m = JSON.parse(data.toString()); } catch (e) { return; }
    if (!m || typeof m !== 'object') return;

    if (m.t === 'join') {
      if (typeof m.room !== 'string' || !ROOM_RE.test(m.room) || typeof m.id !== 'string' || !ID_RE.test(m.id)) {
        send(ws, { t: 'error', code: 'invalid' });
        return;
      }
      leave(client);
      let room = rooms.get(m.room);
      if (!room) {
        if (rooms.size >= MAX_ROOMS) { send(ws, { t: 'error', code: 'full' }); return; }
        room = new Map();
        rooms.set(m.room, room);
      }
      // Same player reconnecting: drop the stale connection quietly.
      const stale = room.get(m.id);
      if (stale && stale !== client) {
        room.delete(m.id);
        stale.room = null;
        try { stale.ws.terminate(); } catch (e) {}
      }
      if (room.size >= MAX_PER_ROOM) {
        send(ws, { t: 'error', code: 'full' });
        if (room.size === 0) rooms.delete(m.room);
        return;
      }
      client.id = m.id;
      client.room = m.room;
      client.presence = m.pr && typeof m.pr === 'object' && !Array.isArray(m.pr) ? m.pr : {};
      room.set(client.id, client);
      const peers = [];
      for (const c of room.values()) if (c !== client) peers.push({ id: c.id, pr: c.presence });
      send(ws, { t: 'joined', room: m.room, peers });
      broadcast(room, { t: 'p', id: client.id, pr: client.presence }, client.id);
      return;
    }

    if (m.t === 'p') {
      if (!client.room || !m.pr || typeof m.pr !== 'object' || Array.isArray(m.pr)) return;
      client.presence = m.pr;
      const room = rooms.get(client.room);
      if (room) broadcast(room, { t: 'p', id: client.id, pr: m.pr }, client.id);
      return;
    }

    if (m.t === 'leave') leave(client);
  });

  ws.on('close', () => leave(client));
  ws.on('error', () => {});
});

// Drop connections that stop answering (closed laptops, dead Wi-Fi).
const heartbeat = setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) { ws.terminate(); continue; }
    ws.isAlive = false;
    try { ws.ping(); } catch (e) {}
  }
}, 25000);
wss.on('close', () => clearInterval(heartbeat));

server.listen(PORT, () => {
  console.log('Rooftop Rumble running on port ' + PORT);
});
