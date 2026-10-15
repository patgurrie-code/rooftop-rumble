'use strict';
// Rooftop Rumble server: serves the game, runs matches, relays player updates.
// ===== SHARED MATCH CORE: used by the server (online) and by practice mode (offline) =====
const RR_MODES = {
  tko: { name: 'Team Knockout', target: 25, time: 480, desc: 'First team to 25 knockouts wins.' },
  ctf: { name: 'Capture the Flag', target: 3, time: 600, desc: 'Steal their flag and bring it home. First to 3.' },
  zone: { name: 'Hot Zone', target: 100, time: 480, desc: 'Hold the zone with no enemies in it to score. First to 100.' }
};
const RR_MODE_KEYS = ['tko', 'ctf', 'zone'];
const RR_MAPS = [
  { id: 'rooftop', name: 'Rooftop', hill: [900, 550, 190], flags: [[330, 550], [1470, 550]] },
  { id: 'docks', name: 'Harbour Docks', hill: [900, 550, 150], flags: [[330, 550], [1470, 550]] },
  { id: 'skybridge', name: 'Skybridge', hill: [900, 550, 150], flags: [[300, 550], [1500, 550]] },
  { id: 'market', name: 'Neon Market', hill: [900, 550, 190], flags: [[300, 550], [1500, 550]] },
  { id: 'foundry', name: 'Foundry', hill: [900, 550, 170], flags: [[300, 550], [1500, 550]] },
  { id: 'frostpeak', name: 'Frostpeak', hill: [900, 260, 140], flags: [[290, 550], [1510, 550]] },
  { id: 'temple', name: 'Jungle Temple', hill: [900, 550, 170], flags: [[300, 550], [1500, 550]] },
  { id: 'mainframe', name: 'Mainframe', hill: [900, 550, 180], flags: [[300, 550], [1500, 550]] }
];
const RR_MAX_PADS = 12;

class RRCore {
  constructor(o) {
    this.emit = o.emit;
    this.now = o.now || (() => Date.now());
    this.practice = !!o.practice;
    this.players = new Map();
    this.matchId = 0;
    this.phase = 'vote';
    this.score = [0, 0];
    this.map = 0; this.mode = 'tko';
    this.votes = new Map();
    this.opts = [];
    this.flags = null;
    this.hill = { own: -1, cont: false, in: [0, 0] };
    this.pads = [];
    this.win = -1; this.mvp = null;
    this.endsAt = 0;
    this.lastTick = this.now();
    this.lastSend = 0;
    this.dirty = true;
    this.makeOptions();
    this.phaseEnd = this.now() + (o.firstVote || 12000);
  }
  clampN(v, a, b) { v = typeof v === 'number' && isFinite(v) ? v : 0; return v < a ? a : v > b ? b : v; }
  teamCount(t, except) { let n = 0; for (const p of this.players.values()) if (p.team === t && p.id !== except) n++; return n; }
  addPlayer(id, info) {
    if (this.players.has(id)) return this.players.get(id);
    let team = this.teamCount(0) <= this.teamCount(1) ? 0 : 1;
    if (info && (info.team === 0 || info.team === 1)) team = info.team;
    const p = { id, name: (info && info.name) || 'Player', team, x: 0, y: 0, alive: false, seen: 0, hero: 0, k: 0, d: 0, a: 0, caps: 0, rets: 0, hillT: 0, bot: !!(info && info.bot) };
    this.players.set(id, p);
    this.dirty = true;
    return p;
  }
  removePlayer(id) {
    const p = this.players.get(id); if (!p) return;
    this.dropFlagsOf(id, p.x, p.y);
    this.players.delete(id); this.votes.delete(id);
    this.dirty = true;
  }
  setInfo(id, info) { const p = this.players.get(id); if (!p || !info) return; if (typeof info.n === 'string') p.name = info.n.slice(0, 14); }
  setPos(id, x, y, alive) {
    const p = this.players.get(id); if (!p) return;
    p.x = this.clampN(x, 0, 1800); p.y = this.clampN(y, 0, 1100); p.alive = !!alive; p.seen = this.now();
  }
  requestTeam(id, team) {
    const p = this.players.get(id); if (!p || (team !== 0 && team !== 1) || p.team === team) return;
    if (!this.practice && this.teamCount(team) > this.teamCount(1 - team, id)) return;
    this.dropFlagsOf(id, p.x, p.y);
    p.team = team; this.dirty = true;
  }
  vote(id, idx) {
    if (this.phase !== 'vote' || !this.players.has(id)) return;
    idx = idx | 0; if (idx < 0 || idx >= this.opts.length) return;
    this.votes.set(id, idx); this.dirty = true;
    const humans = [...this.players.values()].filter(p => !p.bot).length;
    if (this.votes.size >= humans) this.phaseEnd = Math.min(this.phaseEnd, this.now() + (this.practice ? 300 : 2500));
  }
  makeOptions() {
    const maps = RR_MAPS.map((m, i) => i).filter(i => i !== this.map).sort(() => Math.random() - 0.5);
    const modes = RR_MODE_KEYS.slice().sort(() => Math.random() - 0.5);
    this.opts = [0, 1, 2].map(i => ({ map: maps[i % maps.length], mode: modes[i % modes.length] }));
    this.votes = new Map();
  }
  startMatch(map, mode) {
    if (map === undefined) {
      const counts = this.opts.map(() => 0);
      for (const v of this.votes.values()) counts[v]++;
      const best = Math.max(...counts);
      const top = counts.map((c, i) => (c === best ? i : -1)).filter(i => i >= 0);
      const pick = this.opts[top[(Math.random() * top.length) | 0]];
      map = pick.map; mode = pick.mode;
    }
    this.map = map; this.mode = mode;
    this.matchId++;
    this.phase = 'play';
    this.score = [0, 0];
    this.win = -1; this.mvp = null;
    const M = RR_MAPS[map];
    this.flags = [0, 1].map(t => ({ st: 'h', by: '', x: M.flags[t][0], y: M.flags[t][1], until: 0 }));
    this.hill = { own: -1, cont: false, in: [0, 0] };
    this.pads = [];
    for (const p of this.players.values()) { p.k = 0; p.d = 0; p.a = 0; p.caps = 0; p.rets = 0; p.hillT = 0; }
    this.balance();
    this.endsAt = this.now() + RR_MODES[mode].time * 1000;
    this.phaseEnd = this.endsAt;
    this.dirty = true;
  }
  balance() {
    if (this.practice) return;
    for (let guard = 0; guard < 16; guard++) {
      const c0 = this.teamCount(0), c1 = this.teamCount(1);
      if (Math.abs(c0 - c1) <= 1) break;
      const from = c0 > c1 ? 0 : 1;
      const list = [...this.players.values()].filter(p => p.team === from);
      list[list.length - 1].team = 1 - from;
    }
  }
  endMatch(winner) {
    this.phase = 'end';
    this.win = winner;
    let best = null;
    for (const p of this.players.values()) {
      const sc = p.k * 100 + p.a * 40 + p.caps * 300 + p.rets * 60 + Math.floor(p.hillT) * 3 - p.d * 20;
      if (!best || sc > best.sc) best = { id: p.id, name: p.name, k: p.k, sc };
    }
    this.mvp = best ? { id: best.id, name: best.name, k: best.k } : null;
    this.phaseEnd = this.now() + 10000;
    this.dirty = true;
  }
  toVote() {
    this.phase = 'vote';
    this.makeOptions();
    this.phaseEnd = this.now() + (this.practice ? 20000 : 15000);
    this.dirty = true;
  }
  dropFlagsOf(id, x, y) {
    if (!this.flags) return;
    for (let t = 0; t < 2; t++) {
      const F = this.flags[t];
      if (F.st === 'c' && F.by === id) {
        F.st = 'd'; F.by = ''; F.x = this.clampN(x, 20, 1780); F.y = this.clampN(y, 20, 1080); F.until = this.now() + 15000;
        this.emit({ t: 'fe', act: 'drop', f: t, by: id });
        this.dirty = true;
      }
    }
  }
  carrying(id) { return !!(this.flags && this.flags.some(F => F.st === 'c' && F.by === id)); }
  gameEvent(id, g) {
    const p = this.players.get(id);
    if (!p || !g || typeof g !== 'object') return;
    if (g.k === 'ko') {
      p.d++;
      const killer = typeof g.by === 'string' ? this.players.get(g.by) : null;
      const validKiller = killer && killer.team !== p.team ? killer : null;
      if (validKiller) validKiller.k++;
      const as = [];
      if (Array.isArray(g.as)) for (const aid of g.as.slice(0, 5)) {
        const ap = typeof aid === 'string' ? this.players.get(aid) : null;
        if (ap && ap !== validKiller && ap.team !== p.team && !as.includes(ap.id)) { ap.a++; as.push(ap.id); }
      }
      this.dropFlagsOf(id, this.clampN(g.x, 0, 1800) || p.x, this.clampN(g.y, 0, 1100) || p.y);
      if (this.phase === 'play' && this.mode === 'tko') {
        this.score[1 - p.team]++;
        if (this.score[1 - p.team] >= RR_MODES.tko.target) this.endMatch(1 - p.team);
      }
      this.emit({ t: 'ko', v: id, by: validKiller ? validKiller.id : '', as, how: g.how === 'fell' ? 1 : 0, vt: p.team });
      this.dirty = true;
      return;
    }
    if (g.k === 'flag') {
      if (this.phase !== 'play' || this.mode !== 'ctf' || !this.flags) return;
      const ft = g.f === 1 ? 1 : 0, F = this.flags[ft];
      if (g.act === 'take') {
        if (p.team === ft || F.st === 'c' || this.carrying(id)) return;
        F.st = 'c'; F.by = id;
        this.emit({ t: 'fe', act: 'take', f: ft, by: id });
      } else if (g.act === 'ret') {
        if (p.team !== ft || F.st !== 'd') return;
        const M = RR_MAPS[this.map];
        F.st = 'h'; F.by = ''; F.x = M.flags[ft][0]; F.y = M.flags[ft][1];
        p.rets++;
        this.emit({ t: 'fe', act: 'ret', f: ft, by: id });
      } else if (g.act === 'cap') {
        if (F.st !== 'c' || F.by !== id || p.team === ft) return;
        if (this.flags[p.team].st !== 'h') return;
        const M = RR_MAPS[this.map];
        F.st = 'h'; F.by = ''; F.x = M.flags[ft][0]; F.y = M.flags[ft][1];
        p.caps++;
        this.score[p.team]++;
        this.emit({ t: 'fe', act: 'cap', f: ft, by: id });
        if (this.score[p.team] >= RR_MODES.ctf.target) this.endMatch(p.team);
      }
      this.dirty = true;
      return;
    }
    if (g.k === 'pad') {
      const i = g.i | 0; if (i < 0 || i >= RR_MAX_PADS) return;
      const now = this.now();
      if ((this.pads[i] || 0) > now + 500) return;
      const r = this.clampN(g.r, 5, 60);
      this.pads[i] = now + r * 1000;
      this.emit({ t: 'pad', i, r, by: id });
    }
  }
  tick() {
    const now = this.now();
    const dt = Math.min(1, (now - this.lastTick) / 1000);
    this.lastTick = now;
    if (this.phase === 'play') {
      if (this.flags) for (let t = 0; t < 2; t++) {
        const F = this.flags[t];
        if (F.st === 'd' && now >= F.until) {
          const M = RR_MAPS[this.map];
          F.st = 'h'; F.x = M.flags[t][0]; F.y = M.flags[t][1];
          this.emit({ t: 'fe', act: 'auto', f: t, by: '' });
          this.dirty = true;
        }
        if (F.st === 'c' && !this.players.has(F.by)) { F.st = 'd'; F.by = ''; F.until = now + 15000; this.dirty = true; }
      }
      if (this.mode === 'zone') {
        const [hx, hy, hr] = RR_MAPS[this.map].hill;
        const inn = [0, 0], who = [[], []];
        for (const p of this.players.values()) {
          if (!p.alive || now - p.seen > 2500) continue;
          if (Math.hypot(p.x - hx, p.y - hy) < hr) { inn[p.team]++; who[p.team].push(p); }
        }
        const cont = inn[0] > 0 && inn[1] > 0;
        let own = -1;
        if (!cont) { if (inn[0] > 0) own = 0; else if (inn[1] > 0) own = 1; }
        if (own >= 0) {
          this.score[own] = Math.min(100, this.score[own] + dt * (1 + 0.15 * (inn[own] - 1)));
          for (const p of who[own]) p.hillT += dt;
          if (this.score[own] >= 100) this.endMatch(own);
        }
        if (own !== this.hill.own || cont !== this.hill.cont || inn[0] !== this.hill.in[0] || inn[1] !== this.hill.in[1]) this.dirty = true;
        this.hill = { own, cont, in: inn };
      }
      if (this.phase === 'play' && now >= this.endsAt) {
        const s0 = Math.floor(this.score[0]), s1 = Math.floor(this.score[1]);
        this.endMatch(s0 > s1 ? 0 : s1 > s0 ? 1 : -1);
      }
    } else if (this.phase === 'end') {
      if (now >= this.phaseEnd) this.toVote();
    } else if (this.phase === 'vote') {
      if (now >= this.phaseEnd) this.startMatch();
    }
    const interval = this.phase === 'play' && this.mode === 'zone' ? 250 : 1000;
    if (this.dirty ? now - this.lastSend > 60 : now - this.lastSend > interval) this.send();
  }
  state() {
    const vc = this.opts.map(() => 0);
    for (const v of this.votes.values()) vc[v]++;
    const now = this.now();
    return {
      t: 'm', ph: this.phase, id: this.matchId, map: this.map, mode: this.mode,
      sc: [Math.round(this.score[0] * 10) / 10, Math.round(this.score[1] * 10) / 10],
      end: this.phaseEnd, now, opts: this.opts, vc,
      fl: this.flags ? this.flags.map(F => [F.st, F.by, Math.round(F.x), Math.round(F.y), F.st === 'd' ? Math.max(0, F.until - now) : 0]) : null,
      hl: [this.hill.own, this.hill.cont ? 1 : 0, this.hill.in[0], this.hill.in[1]],
      pd: this.pads.map(t => Math.max(0, (t || 0) - now)),
      pl: [...this.players.values()].map(p => [p.id, p.team, p.k, p.d, p.a, p.caps, Math.round(p.hillT), p.rets]),
      win: this.win, mvp: this.mvp
    };
  }
  send() { this.dirty = false; this.lastSend = this.now(); this.emit(this.state()); }
}

// ===== SERVER =====
const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 3000;
const INDEX_PATHS = [path.join(__dirname, 'public', 'index.html'), path.join(__dirname, 'index.html')];
const MAX_PER_ROOM = 16;
const MAX_ROOMS = 300;
const ROOM_RE = /^[a-z0-9][a-z0-9_.-]{0,47}$/;
const ID_RE = /^[a-z0-9]{8,32}$/;

const server = http.createServer((req, res) => {
  const url = (req.url || '/').split('?')[0];
  if (url === '/healthz') { res.writeHead(200, { 'Content-Type': 'text/plain' }); res.end('ok'); return; }
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
  res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('Not found');
});

const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 32 * 1024 });
const rooms = new Map(); // code -> { code, clients: Map(id -> client), core }

function sendRaw(ws, str) { if (ws.readyState === 1) ws.send(str); }
function roomBroadcast(room, obj, exceptId) {
  const s = typeof obj === 'string' ? obj : JSON.stringify(obj);
  for (const [id, c] of room.clients) if (id !== exceptId) sendRaw(c.ws, s);
}
function getRoom(code) {
  let room = rooms.get(code);
  if (!room) {
    room = { code, clients: new Map(), core: null };
    room.core = new RRCore({ emit: msg => roomBroadcast(room, msg) });
    rooms.set(code, room);
  }
  return room;
}
function leaveRoom(client) {
  if (!client.room) return;
  const room = rooms.get(client.room);
  client.room = null;
  if (!room || room.clients.get(client.id) !== client) return;
  room.clients.delete(client.id);
  room.core.removePlayer(client.id);
  roomBroadcast(room, { t: 'pl', id: client.id });
  if (room.clients.size === 0) rooms.delete(room.code);
}
const cleanStr = (v, n) => (typeof v === 'string' ? v.slice(0, n) : '');
function cleanInfo(i) {
  if (!i || typeof i !== 'object') return {};
  return { n: cleanStr(i.n, 14), h: cleanStr(i.h, 12), lv: Math.max(1, Math.min(999, i.lv | 0)), ti: cleanStr(i.ti, 24), sk: cleanStr(i.sk, 12), nc: cleanStr(i.nc, 12), ko: cleanStr(i.ko, 12) };
}

wss.on('connection', ws => {
  const client = { ws, id: null, room: null, info: {}, s: null, budget: 200, last: Date.now() };
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
  ws.on('message', (data, isBinary) => {
    if (isBinary) return;
    const now = Date.now();
    client.budget = Math.min(300, client.budget + (now - client.last) * 0.14);
    client.gBudget = Math.min(60, (client.gBudget === undefined ? 60 : client.gBudget) + (now - client.last) * 0.03);
    client.last = now;
    let m;
    try { m = JSON.parse(data.toString()); } catch (e) { return; }
    if (!m || typeof m !== 'object') return;
    if (m.t === 'u') { if (client.budget < 1) return; client.budget -= 1; }
    else { if (client.gBudget < 1) return; client.gBudget -= 1; }
    if (m.t === 'ping') { sendRaw(ws, JSON.stringify({ t: 'pong', c: m.c })); return; }
    if (m.t === 'join') {
      if (typeof m.room !== 'string' || !ROOM_RE.test(m.room) || typeof m.id !== 'string' || !ID_RE.test(m.id)) { sendRaw(ws, JSON.stringify({ t: 'error', code: 'invalid' })); return; }
      leaveRoom(client);
      if (!rooms.has(m.room) && rooms.size >= MAX_ROOMS) { sendRaw(ws, JSON.stringify({ t: 'error', code: 'full' })); return; }
      const room = getRoom(m.room);
      const stale = room.clients.get(m.id);
      if (stale && stale !== client) { stale.room = null; room.clients.delete(m.id); try { stale.ws.terminate(); } catch (e) {} }
      if (room.clients.size >= MAX_PER_ROOM) { sendRaw(ws, JSON.stringify({ t: 'error', code: 'full' })); if (room.clients.size === 0) rooms.delete(room.code); return; }
      client.id = m.id; client.room = m.room; client.info = cleanInfo(m.i);
      room.clients.set(client.id, client);
      const existing = room.core.players.get(client.id);
      room.core.addPlayer(client.id, { name: client.info.n, team: existing ? existing.team : undefined });
      const peers = [];
      for (const c of room.clients.values()) if (c !== client) peers.push({ id: c.id, i: c.info, s: c.s });
      sendRaw(ws, JSON.stringify({ t: 'joined', id: client.id, peers, m: room.core.state() }));
      roomBroadcast(room, { t: 'i', id: client.id, i: client.info }, client.id);
      room.core.dirty = true;
      return;
    }
    if (!client.room) return;
    const room = rooms.get(client.room);
    if (!room) return;
    if (m.t === 'u') {
      if (!Array.isArray(m.s) || m.s.length > 24) return;
      for (let i = 0; i < m.s.length; i++) if (typeof m.s[i] !== 'number' || !isFinite(m.s[i])) return;
      client.s = m.s;
      room.core.setPos(client.id, m.s[0], m.s[1], (m.s[7] | 0) & 1);
      const ev = Array.isArray(m.e) && m.e.length ? m.e.slice(0, 40) : null;
      roomBroadcast(room, '{"t":"u","id":"' + client.id + '","s":' + JSON.stringify(m.s) + (ev ? ',"e":' + JSON.stringify(ev) : '') + '}', client.id);
      return;
    }
    if (m.t === 'i') {
      client.info = cleanInfo(m.i);
      room.core.setInfo(client.id, client.info);
      roomBroadcast(room, { t: 'i', id: client.id, i: client.info }, client.id);
      return;
    }
    if (m.t === 'g') { room.core.gameEvent(client.id, m.g); return; }
    if (m.t === 'v') { room.core.vote(client.id, m.o); return; }
    if (m.t === 'tm') { room.core.requestTeam(client.id, m.team); return; }
    if (m.t === 'leave') leaveRoom(client);
  });
  ws.on('close', () => leaveRoom(client));
  ws.on('error', () => {});
});

setInterval(() => { for (const room of rooms.values()) { try { room.core.tick(); } catch (e) { console.error(e); } } }, 100);
const heartbeat = setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) { ws.terminate(); continue; }
    ws.isAlive = false;
    try { ws.ping(); } catch (e) {}
  }
}, 25000);
wss.on('close', () => clearInterval(heartbeat));
server.listen(PORT, () => console.log('Rooftop Rumble running on port ' + PORT));
