'use strict';
// Rooftop Rumble server: serves the game, runs matches and bots, relays player updates.
// ===== SHARED MATCH CORE: used by the server (online) and by practice mode (offline) =====
const RR_MODES = {
  tko: { name: 'Team Knockout', target: 25, time: 480, desc: 'First team to 25 knockouts wins.' },
  ctf: { name: 'Capture the Flag', target: 3, time: 600, desc: 'Steal their flag and bring it home. First to 3.' },
  zone: { name: 'Hot Zone', target: 100, time: 480, desc: 'Hold the zone with no enemies in it to score. First to 100.' },
  push: { name: 'Push', target: 100, time: 480, desc: 'Stand by the robot to walk it into the enemy base. Furthest push wins.' },
  elim: { name: 'Elimination', target: 4, time: 900, desc: 'No respawns. Wipe out the other team to win the round. First to 4 rounds.' },
  train: { name: 'Training range', target: 99999, time: 36000, desc: 'Practise on target dummies.' }
};
const RR_MODE_KEYS = ['tko', 'ctf', 'zone', 'push', 'elim'];
const RR_MAPS = [
  { id: 'rooftop', name: 'Rooftop', hill: [900, 550, 190], flags: [[330, 550], [1470, 550]], path: [[330, 550], [520, 550], [520, 380], [1280, 380], [1280, 550], [1470, 550]], cover: [[447,117,46,46],[1307,117,46,46],[677,677,46,46],[1077,677,46,46]] },
  { id: 'docks', name: 'Harbour Docks', hill: [900, 550, 150], flags: [[330, 550], [1470, 550]], path: [[330, 550], [1470, 550]], cover: [[427,427,46,46],[1327,427,46,46],[427,627,46,46],[1327,627,46,46]] },
  { id: 'skybridge', name: 'Skybridge', hill: [900, 550, 150], flags: [[300, 550], [1500, 550]], path: [[300, 550], [460, 550], [460, 400], [610, 400], [610, 550], [1190, 550], [1190, 400], [1340, 400], [1340, 550], [1500, 550]], cover: [[357,277,46,46],[1397,277,46,46],[397,777,46,46],[1357,777,46,46]] },
  { id: 'market', name: 'Neon Market', hill: [900, 550, 190], flags: [[300, 550], [1500, 550]], path: [[300, 550], [640, 550], [640, 450], [1160, 450], [1160, 550], [1500, 550]], cover: [[407,377,46,46],[1347,377,46,46],[407,677,46,46],[1347,677,46,46]] },
  { id: 'foundry', name: 'Foundry', hill: [900, 550, 170], flags: [[300, 550], [1500, 550]], path: [[300, 550], [440, 550], [440, 420], [1360, 420], [1360, 550], [1500, 550]], cover: [[537,227,46,46],[1217,227,46,46],[537,827,46,46],[1217,827,46,46]] },
  { id: 'frostpeak', name: 'Frostpeak', hill: [900, 260, 140], flags: [[290, 550], [1510, 550]], path: [[290, 550], [760, 550], [760, 380], [1040, 380], [1040, 550], [1510, 550]], cover: [[537,157,46,46],[1217,157,46,46],[537,897,46,46],[1217,897,46,46]] },
  { id: 'temple', name: 'Jungle Temple', hill: [900, 550, 170], flags: [[300, 550], [1500, 550]], path: [[300, 550], [460, 550], [460, 420], [1340, 420], [1340, 550], [1500, 550]], cover: [[677,157,46,46],[1077,157,46,46],[677,897,46,46],[1077,897,46,46]] },
  { id: 'mainframe', name: 'Mainframe', hill: [900, 550, 180], flags: [[300, 550], [1500, 550]], path: [[300, 550], [780, 550], [780, 460], [1020, 460], [1020, 550], [1500, 550]], cover: [[427,397,46,46],[1327,397,46,46],[427,657,46,46],[1327,657,46,46]] },
  { id: 'range', name: 'Training Range', train: true, hill: [1100, 550, 150], flags: [[300, 550], [1500, 550]], path: [[300, 550], [1500, 550]], cover: [[777,327,46,46],[777,727,46,46]] }
];
const RR_HEROES = { anchor: 'Tank', tusk: 'Tank', lodestone: 'Tank', mortar: 'Tank', volt: 'Damage', kettle: 'Damage', wren: 'Damage', shade: 'Damage', cinder: 'Damage', ricochet: 'Damage', gale: 'Damage', sapper: 'Damage', tinker: 'Damage', fang: 'Damage', glitch: 'Damage', bloom: 'Support', patch: 'Support', lumen: 'Support', tempo: 'Support' };
const RR_BOT_NAMES = ['Rook', 'Pixel', 'Dozer', 'Sprocket', 'Juno', 'Mako', 'Biscuit', 'Taz', 'Ziggy', 'Nova', 'Bolt', 'Echo', 'Fizz', 'Gizmo', 'Kipper', 'Moss', 'Nitro', 'Pebble', 'Quill', 'Rusty', 'Scout', 'Tango', 'Whisk', 'Yeti'];
const RR_MAX_PADS = 12;
const RR_CART_R = 130;
const RR_COVER_HP = 250;
const RR_PLAY_MAPS = RR_MAPS.map((m, i) => i).filter(i => !RR_MAPS[i].train);
function rrNormSettings(s) {
  s = s && typeof s === 'object' ? s : {};
  const r = s.rules && typeof s.rules === 'object' ? s.rules : {};
  return {
    name: (typeof s.name === 'string' ? s.name : '').replace(/[^\w .!?'-]/g, '').trim().slice(0, 24) || 'Rooftop Rumble server',
    pub: s.pub !== false,
    size: [3, 4, 5].includes(s.size) ? s.size : 5,
    bots: s.bots !== false,
    botLevel: [0, 1, 2].includes(s.botLevel) ? s.botLevel : 1,
    modes: s.modes === 'vote' || RR_MODES[s.modes] ? s.modes : 'vote',
    timer: [0, 30, 60, 120].includes(s.timer) ? s.timer : 0,
    rules: { turbo: !!r.turbo, frenzy: !!r.frenzy, oneshot: !!r.oneshot, ff: !!r.ff, dblhp: !!r.dblhp, lock: typeof r.lock === 'string' && RR_HEROES[r.lock] ? r.lock : '' }
  };
}
function rrPathLen(path) { let L = 0; for (let i = 1; i < path.length; i++) L += Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]); return L; }
function rrPathPoint(path, d) {
  for (let i = 1; i < path.length; i++) {
    const seg = Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]);
    if (d <= seg || i === path.length - 1) { const t = seg ? Math.max(0, Math.min(1, d / seg)) : 0; return [path[i - 1][0] + (path[i][0] - path[i - 1][0]) * t, path[i - 1][1] + (path[i][1] - path[i - 1][1]) * t]; }
    d -= seg;
  }
  return path[path.length - 1].slice();
}

class RRCore {
  constructor(o) {
    this.emit = o.emit;
    this.now = o.now || (() => Date.now());
    this.practice = !!o.practice;
    this.set = rrNormSettings(o.settings);
    this.players = new Map();
    this.host = '';
    this.matchId = 0;
    this.score = [0, 0];
    this.map = RR_PLAY_MAPS[(Math.random() * RR_PLAY_MAPS.length) | 0];
    this.cover = [];
    this.mode = this.set.modes === 'vote' ? 'tko' : this.set.modes;
    this.votes = new Map();
    this.opts = [];
    this.flags = null; this.hill = { own: -1, cont: false, in: [0, 0] }; this.push = null; this.el = null;
    this.pads = [];
    this.win = -1; this.mvp = null;
    this.endsAt = 0; this.botSeq = 0;
    this.lastTick = this.now(); this.lastSend = 0; this.dirty = true;
    this.makeOptions();
    if (this.set.timer > 0) { this.phase = 'lobby'; this.phaseEnd = this.now() + this.set.timer * 1000; }
    else if (this.set.modes === 'vote') { this.phase = 'vote'; this.phaseEnd = this.now() + (o.firstVote || 15000); }
    else { this.phase = 'lobby'; this.phaseEnd = this.now() + 1500; }
  }
  clampN(v, a, b) { v = typeof v === 'number' && isFinite(v) ? v : 0; return v < a ? a : v > b ? b : v; }
  list() { return [...this.players.values()]; }
  humanCount(t, except) { let n = 0; for (const p of this.players.values()) if (!p.bot && (t === undefined || p.team === t) && p.id !== except) n++; return n; }
  mkPlayer(id, name, team, bot, hero) {
    return { id, name: name || 'Player', team, bot, hero: hero || '', x: 0, y: 0, alive: false, seen: 0, k: 0, d: 0, a: 0, caps: 0, rets: 0, hillT: 0, dead: false };
  }
  pickHost() {
    const h = this.players.get(this.host);
    if (h && !h.bot) return;
    this.host = '';
    for (const p of this.players.values()) if (!p.bot) { this.host = p.id; break; }
    this.dirty = true;
  }
  botName() {
    const used = new Set(this.list().map(p => p.name));
    const free = RR_BOT_NAMES.filter(n => !used.has(n));
    return free.length ? free[(Math.random() * free.length) | 0] : 'Bot ' + this.botSeq;
  }
  botHero(t) {
    if (this.set.rules.lock) return this.set.rules.lock;
    const roles = this.list().filter(p => p.team === t && p.hero).map(p => RR_HEROES[p.hero]);
    const keys = Object.keys(RR_HEROES);
    const pick = role => { const ks = keys.filter(k => RR_HEROES[k] === role); return ks[(Math.random() * ks.length) | 0]; };
    if (!roles.includes('Tank')) return pick('Tank');
    if (!roles.includes('Support')) return pick('Support');
    return Math.random() < 0.75 ? pick('Damage') : pick(Math.random() < 0.5 ? 'Tank' : 'Support');
  }
  fillBots() {
    for (let t = 0; t < 2; t++) {
      const humans = this.humanCount(t);
      const bots = this.list().filter(p => p.bot && p.team === t);
      const need = this.set.bots ? Math.max(0, this.set.size - humans) : 0;
      while (bots.length > need) {
        let i = bots.findIndex(b => b.dead || !b.alive);
        if (i < 0) i = bots.length - 1;
        const b = bots.splice(i, 1)[0];
        this.dropFlagsOf(b.id, b.x, b.y);
        this.players.delete(b.id);
        this.dirty = true;
      }
      while (bots.length < need) {
        const b = this.mkPlayer('bot' + (++this.botSeq), this.botName(), t, true, this.botHero(t));
        if (this.phase === 'play' && this.mode === 'elim') b.dead = true;
        this.players.set(b.id, b);
        bots.push(b);
        this.dirty = true;
      }
    }
  }
  addPlayer(id, info) {
    info = info || {};
    if (this.players.has(id)) return this.players.get(id);
    const size = this.set.size;
    const h0 = this.humanCount(0), h1 = this.humanCount(1);
    let team = -1;
    if ((info.team === 0 || info.team === 1) && this.humanCount(info.team) < size) team = info.team;
    else if (h0 <= h1 && h0 < size) team = 0;
    else if (h1 < size) team = 1;
    else if (h0 < size) team = 0;
    if (team < 0) return null;
    const p = this.mkPlayer(id, info.name, team, !!info.bot, info.hero);
    if (this.phase === 'play' && this.mode === 'elim') p.dead = true;
    this.players.set(id, p);
    this.pickHost();
    this.fillBots();
    this.dirty = true;
    return p;
  }
  removePlayer(id) {
    const p = this.players.get(id); if (!p) return;
    this.dropFlagsOf(id, p.x, p.y);
    this.players.delete(id); this.votes.delete(id);
    this.pickHost();
    this.fillBots();
    this.checkElim();
    this.dirty = true;
  }
  setInfo(id, info) {
    const p = this.players.get(id); if (!p || !info) return;
    if (typeof info.n === 'string') p.name = info.n.slice(0, 14);
    if (typeof info.h === 'string' && RR_HEROES[info.h]) p.hero = info.h;
  }
  setPos(id, x, y, alive) {
    const p = this.players.get(id); if (!p) return;
    p.x = this.clampN(x, 0, 1800); p.y = this.clampN(y, 0, 1100); p.alive = !!alive; p.seen = this.now();
  }
  requestTeam(id, team) {
    const p = this.players.get(id); if (!p || p.bot || (team !== 0 && team !== 1) || p.team === team) return;
    if (this.humanCount(team) >= this.set.size) return;
    this.dropFlagsOf(id, p.x, p.y);
    p.team = team;
    if (this.phase === 'play' && this.mode === 'elim') p.dead = true;
    this.fillBots();
    this.checkElim();
    this.dirty = true;
  }
  forceStart(id) { if (id === this.host && this.phase === 'lobby') { this.phaseEnd = this.now(); this.dirty = true; } }
  vote(id, idx) {
    const p = this.players.get(id);
    if (this.phase !== 'vote' || !p || p.bot) return;
    idx = idx | 0; if (idx < 0 || idx >= this.opts.length) return;
    this.votes.set(id, idx); this.dirty = true;
    if (this.votes.size >= this.humanCount()) this.phaseEnd = Math.min(this.phaseEnd, this.now() + (this.practice ? 300 : 2500));
  }
  makeOptions() {
    const maps = RR_PLAY_MAPS.filter(i => i !== this.map).sort(() => Math.random() - 0.5);
    const modes = RR_MODE_KEYS.slice().sort(() => Math.random() - 0.5);
    this.opts = [0, 1, 2].map(i => ({ map: maps[i % maps.length], mode: modes[i % modes.length] }));
    this.votes = new Map();
  }
  startMatch(map, mode) {
    if (map === undefined) {
      if (this.set.modes === 'vote') {
        const counts = this.opts.map(() => 0);
        for (const v of this.votes.values()) counts[v]++;
        const best = Math.max(...counts);
        const top = counts.map((c, i) => (c === best ? i : -1)).filter(i => i >= 0);
        const pick = this.opts[top[(Math.random() * top.length) | 0]];
        map = pick.map; mode = pick.mode;
      } else {
        const others = RR_PLAY_MAPS.filter(i => i !== this.map);
        map = others[(Math.random() * others.length) | 0]; mode = this.set.modes;
      }
    }
    this.map = map; this.mode = mode;
    this.matchId++;
    this.phase = 'play';
    this.score = [0, 0];
    this.win = -1; this.mvp = null;
    const M = RR_MAPS[map];
    this.flags = [0, 1].map(t => ({ st: 'h', by: '', x: M.flags[t][0], y: M.flags[t][1], until: 0 }));
    this.hill = { own: -1, cont: false, in: [0, 0] };
    const L = rrPathLen(M.path);
    this.push = { d: L / 2, L, dmin: L / 2, dmax: L / 2, own: -1, cont: false };
    this.el = { round: 1, inter: false, roundEnd: this.now() + 120000, interEnd: 0 };
    this.pads = [];
    this.cover = (M.cover || []).map(() => ({ hp: RR_COVER_HP, back: 0 }));
    for (const p of this.players.values()) { p.k = 0; p.d = 0; p.a = 0; p.caps = 0; p.rets = 0; p.hillT = 0; p.dead = false; }
    this.endsAt = this.now() + RR_MODES[mode].time * 1000;
    this.phaseEnd = this.endsAt;
    this.dirty = true;
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
    this.phaseEnd = this.now() + 12000;
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
  teamAlive(t) { let n = 0; for (const p of this.players.values()) if (p.team === t && !p.dead) n++; return n; }
  checkElim() {
    if (this.phase !== 'play' || this.mode !== 'elim' || !this.el || this.el.inter) return;
    const a0 = this.teamAlive(0), a1 = this.teamAlive(1);
    if (a0 > 0 && a1 > 0) return;
    this.roundWin(a0 > 0 ? 0 : a1 > 0 ? 1 : -1);
  }
  roundWin(t) {
    if (t >= 0) this.score[t]++;
    this.emit({ t: 'rw', w: t, round: this.el.round });
    if (t >= 0 && this.score[t] >= RR_MODES.elim.target) { this.endMatch(t); return; }
    this.el.inter = true; this.el.interEnd = this.now() + 4500;
    this.dirty = true;
  }
  gameEvent(senderId, g) {
    if (!g || typeof g !== 'object') return;
    let id = senderId;
    if (typeof g.who === 'string' && g.who && g.who !== senderId) {
      const b = this.players.get(g.who);
      if (!b || !b.bot || senderId !== this.host) return;
      id = g.who;
    }
    const p = this.players.get(id);
    if (!p) return;
    if (g.k === 'ko') {
      p.d++;
      const killer = typeof g.by === 'string' ? this.players.get(g.by) : null;
      const validKiller = killer && (killer.team !== p.team || this.set.rules.ff) && killer.id !== p.id ? killer : null;
      if (validKiller && validKiller.team !== p.team) validKiller.k++;
      const as = [];
      if (Array.isArray(g.as)) for (const aid of g.as.slice(0, 5)) {
        const ap = typeof aid === 'string' ? this.players.get(aid) : null;
        if (ap && ap !== validKiller && ap.team !== p.team && !as.includes(ap.id)) { ap.a++; as.push(ap.id); }
      }
      this.dropFlagsOf(id, this.clampN(g.x, 0, 1800) || p.x, this.clampN(g.y, 0, 1100) || p.y);
      this.emit({ t: 'ko', v: id, by: validKiller ? validKiller.id : '', as, how: g.how === 'fell' ? 1 : 0, vt: p.team });
      if (this.phase === 'play' && this.mode === 'tko') {
        this.score[1 - p.team]++;
        if (this.score[1 - p.team] >= RR_MODES.tko.target) this.endMatch(1 - p.team);
      }
      if (this.phase === 'play' && this.mode === 'elim' && !this.el.inter) { p.dead = true; this.checkElim(); }
      this.dirty = true;
      return;
    }
    if (g.k === 'flag') {
      if (this.phase !== 'play' || this.mode !== 'ctf' || !this.flags) return;
      const ft = g.f === 1 ? 1 : 0, F = this.flags[ft], M = RR_MAPS[this.map];
      if (g.act === 'take') {
        if (p.team === ft || F.st === 'c' || this.carrying(id)) return;
        F.st = 'c'; F.by = id;
        this.emit({ t: 'fe', act: 'take', f: ft, by: id });
      } else if (g.act === 'ret') {
        if (p.team !== ft || F.st !== 'd') return;
        F.st = 'h'; F.by = ''; F.x = M.flags[ft][0]; F.y = M.flags[ft][1];
        p.rets++;
        this.emit({ t: 'fe', act: 'ret', f: ft, by: id });
      } else if (g.act === 'cap') {
        if (F.st !== 'c' || F.by !== id || p.team === ft || this.flags[p.team].st !== 'h') return;
        F.st = 'h'; F.by = ''; F.x = M.flags[ft][0]; F.y = M.flags[ft][1];
        p.caps++;
        this.score[p.team]++;
        this.emit({ t: 'fe', act: 'cap', f: ft, by: id });
        if (this.score[p.team] >= RR_MODES.ctf.target) this.endMatch(p.team);
      }
      this.dirty = true;
      return;
    }
    if (g.k === 'cov') {
      const c = this.cover[g.i | 0]; if (!c || c.hp <= 0) return;
      c.hp -= this.clampN(g.d, 0, 600);
      if (c.hp <= 0) { c.hp = 0; c.back = this.now() + 45000; this.emit({ t: 'cov', i: g.i | 0, hp: 0 }); }
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
  playersNear(x, y, r) {
    const now = this.now(), inn = [0, 0], who = [[], []];
    for (const p of this.players.values()) {
      if (!p.alive || now - p.seen > 2500) continue;
      if (Math.hypot(p.x - x, p.y - y) < r) { inn[p.team]++; who[p.team].push(p); }
    }
    return { inn, who };
  }
  tick() {
    const now = this.now();
    const dt = Math.min(1, (now - this.lastTick) / 1000);
    this.lastTick = now;
    if (this.phase === 'play' || this.phase === 'lobby') for (let i = 0; i < this.cover.length; i++) { const c = this.cover[i]; if (c.hp <= 0 && now >= c.back) { c.hp = RR_COVER_HP; this.dirty = true; } }
    if (this.phase === 'play') {
      const M = RR_MAPS[this.map];
      if (this.mode === 'ctf' && this.flags) for (let t = 0; t < 2; t++) {
        const F = this.flags[t];
        if (F.st === 'd' && now >= F.until) {
          F.st = 'h'; F.x = M.flags[t][0]; F.y = M.flags[t][1];
          this.emit({ t: 'fe', act: 'auto', f: t, by: '' });
          this.dirty = true;
        }
        if (F.st === 'c' && !this.players.has(F.by)) { F.st = 'd'; F.by = ''; F.until = now + 15000; this.dirty = true; }
      }
      if (this.mode === 'zone') {
        const [hx, hy, hr] = M.hill;
        const { inn, who } = this.playersNear(hx, hy, hr);
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
      if (this.mode === 'push' && this.push) {
        const P = this.push;
        const [cx, cy] = rrPathPoint(M.path, P.d);
        const { inn, who } = this.playersNear(cx, cy, RR_CART_R);
        const cont = inn[0] > 0 && inn[1] > 0;
        let own = -1;
        if (!cont) { if (inn[0] > 0) own = 0; else if (inn[1] > 0) own = 1; }
        if (own >= 0) {
          const spd = Math.min(90, 55 + 12 * (inn[own] - 1));
          P.d = Math.max(0, Math.min(P.L, P.d + (own === 0 ? 1 : -1) * spd * dt));
          for (const p of who[own]) p.hillT += dt;
        }
        P.dmax = Math.max(P.dmax, P.d); P.dmin = Math.min(P.dmin, P.d);
        this.score = [Math.round((P.dmax - P.L / 2) / (P.L / 2) * 100), Math.round((P.L / 2 - P.dmin) / (P.L / 2) * 100)];
        if (own !== P.own || cont !== P.cont) this.dirty = true;
        P.own = own; P.cont = cont;
        if (P.d >= P.L - 1) this.endMatch(0); else if (P.d <= 1) this.endMatch(1);
      }
      if (this.mode === 'elim' && this.el && this.phase === 'play') {
        const E = this.el;
        if (E.inter && now >= E.interEnd) {
          E.round++; E.inter = false; E.roundEnd = now + 120000;
          for (const p of this.players.values()) p.dead = false;
          this.emit({ t: 'rs', round: E.round });
          this.dirty = true;
        } else if (!E.inter && now >= E.roundEnd) {
          const a0 = this.teamAlive(0), a1 = this.teamAlive(1);
          this.roundWin(a0 > a1 ? 0 : a1 > a0 ? 1 : -1);
        }
      }
      if (this.phase === 'play' && now >= this.endsAt) {
        const s0 = Math.floor(this.score[0]), s1 = Math.floor(this.score[1]);
        this.endMatch(s0 > s1 ? 0 : s1 > s0 ? 1 : -1);
      }
    } else if (this.phase === 'end') {
      if (now >= this.phaseEnd) { if (this.set.modes === 'vote') this.toVote(); else this.startMatch(); }
    } else if (this.phase === 'vote') {
      if (now >= this.phaseEnd) this.startMatch();
    } else if (this.phase === 'lobby') {
      if (now >= this.phaseEnd) { if (this.set.modes === 'vote') this.toVote(); else this.startMatch(); }
    }
    const interval = this.phase === 'play' && (this.mode === 'zone' || this.mode === 'push') ? 250 : 1000;
    if (this.dirty ? now - this.lastSend > 60 : now - this.lastSend > interval) this.send();
  }
  summary() {
    return { name: this.set.name, humans: this.humanCount(), bots: this.list().filter(p => p.bot).length, size: this.set.size, phase: this.phase, mode: this.mode, map: this.map,
      modes: this.set.modes, botsOn: this.set.bots, rules: this.set.rules, sc: [Math.floor(this.score[0]), Math.floor(this.score[1])] };
  }
  state() {
    const vc = this.opts.map(() => 0);
    for (const v of this.votes.values()) vc[v]++;
    const now = this.now();
    return {
      t: 'm', ph: this.phase, id: this.matchId, map: this.map, mode: this.mode,
      sc: [Math.round(this.score[0] * 10) / 10, Math.round(this.score[1] * 10) / 10],
      end: this.phase === 'play' && this.mode === 'elim' && this.el ? (this.el.inter ? this.el.interEnd : Math.min(this.el.roundEnd, this.endsAt)) : this.phaseEnd,
      now, opts: this.opts, vc, host: this.host, set: this.set,
      fl: this.flags ? this.flags.map(F => [F.st, F.by, Math.round(F.x), Math.round(F.y), F.st === 'd' ? Math.max(0, F.until - now) : 0]) : null,
      hl: [this.hill.own, this.hill.cont ? 1 : 0, this.hill.in[0], this.hill.in[1]],
      pu: this.push ? [Math.round(this.push.d), this.push.own, this.push.cont ? 1 : 0] : null,
      el: this.el ? [this.el.round, this.el.inter ? 1 : 0] : null,
      pd: this.pads.map(t => Math.max(0, (t || 0) - now)),
      cv: this.cover.map(c => Math.max(0, Math.round(c.hp))),
      pl: this.list().map(p => [p.id, p.team, p.k, p.d, p.a, p.caps, Math.round(p.hillT), p.rets, p.dead ? 1 : 0, p.bot ? 1 : 0, p.bot ? p.name : '', p.bot ? p.hero : '']),
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
const MAX_ROOMS = 300;
const ROOM_RE = /^[a-z0-9][a-z0-9_.-]{0,47}$/;
const ID_RE = /^[a-z0-9]{8,32}$/;
const rooms = new Map(); // code -> { code, clients: Map(id -> client), core }

const server = http.createServer((req, res) => {
  const url = (req.url || '/').split('?')[0];
  if (url === '/healthz') { res.writeHead(200, { 'Content-Type': 'text/plain' }); res.end('ok'); return; }
  if (url === '/rooms') {
    const list = [];
    for (const room of rooms.values()) if (room.core.set.pub && room.clients.size > 0) list.push({ code: room.code, ...room.core.summary() });
    list.sort((a, b) => b.humans - a.humans);
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(list.slice(0, 50)));
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
  res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('Not found');
});

const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 64 * 1024 });
function sendRaw(ws, str) { if (ws.readyState === 1) ws.send(str); }
function roomBroadcast(room, obj, exceptId) {
  const s = typeof obj === 'string' ? obj : JSON.stringify(obj);
  for (const [id, c] of room.clients) if (id !== exceptId) sendRaw(c.ws, s);
}
function makeRoom(code, settings) {
  const room = { code, clients: new Map(), core: null };
  room.core = new RRCore({ emit: msg => roomBroadcast(room, msg), settings });
  rooms.set(code, room);
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
const numArr = (a, max) => Array.isArray(a) && a.length <= max && a.every(v => typeof v === 'number' && isFinite(v));

wss.on('connection', ws => {
  const client = { ws, id: null, room: null, info: {}, s: null, budget: 300, gBudget: 60, last: Date.now() };
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
  ws.on('message', (data, isBinary) => {
    if (isBinary) return;
    const now = Date.now();
    client.budget = Math.min(300, client.budget + (now - client.last) * 0.14);
    client.gBudget = Math.min(60, client.gBudget + (now - client.last) * 0.03);
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
      let room = rooms.get(m.room);
      if (!room) {
        if (rooms.size >= MAX_ROOMS) { sendRaw(ws, JSON.stringify({ t: 'error', code: 'busy' })); return; }
        room = makeRoom(m.room, m.create);
      }
      const stale = room.clients.get(m.id);
      if (stale && stale !== client) { stale.room = null; room.clients.delete(m.id); try { stale.ws.terminate(); } catch (e) {} }
      client.info = cleanInfo(m.i);
      const existing = room.core.players.get(m.id);
      const p = room.core.addPlayer(m.id, { name: client.info.n, hero: client.info.h, team: existing ? existing.team : (m.team === 0 || m.team === 1 ? m.team : undefined) });
      if (!p) { sendRaw(ws, JSON.stringify({ t: 'error', code: 'full' })); if (room.clients.size === 0) rooms.delete(room.code); return; }
      client.id = m.id; client.room = m.room;
      room.clients.set(client.id, client);
      const peers = [];
      for (const c of room.clients.values()) if (c !== client) peers.push({ id: c.id, i: c.info, s: c.s });
      sendRaw(ws, JSON.stringify({ t: 'joined', id: client.id, code: room.code, peers, m: room.core.state() }));
      roomBroadcast(room, { t: 'i', id: client.id, i: client.info }, client.id);
      room.core.dirty = true;
      return;
    }
    if (!client.room) return;
    const room = rooms.get(client.room);
    if (!room) return;
    const core = room.core;
    if (m.t === 'u') {
      if (!numArr(m.s, 24)) return;
      client.s = m.s;
      core.setPos(client.id, m.s[0], m.s[1], (m.s[7] | 0) & 1);
      let bots = null;
      if (Array.isArray(m.b) && client.id === core.host) {
        bots = [];
        for (const b of m.b.slice(0, 12)) {
          if (!Array.isArray(b) || typeof b[0] !== 'string' || !numArr(b.slice(1), 24)) continue;
          const bp = core.players.get(b[0]);
          if (!bp || !bp.bot) continue;
          core.setPos(b[0], b[1], b[2], (b[8] | 0) & 1);
          bots.push(b);
        }
      }
      const ev = Array.isArray(m.e) && m.e.length ? m.e.slice(0, 60) : null;
      roomBroadcast(room, '{"t":"u","id":"' + client.id + '","s":' + JSON.stringify(m.s) + (bots && bots.length ? ',"b":' + JSON.stringify(bots) : '') + (ev ? ',"e":' + JSON.stringify(ev) : '') + '}', client.id);
      return;
    }
    if (m.t === 'i') { client.info = cleanInfo(m.i); core.setInfo(client.id, client.info); roomBroadcast(room, { t: 'i', id: client.id, i: client.info }, client.id); return; }
    if (m.t === 'g') { core.gameEvent(client.id, m.g); return; }
    if (m.t === 'v') { core.vote(client.id, m.o); return; }
    if (m.t === 'tm') { core.requestTeam(client.id, m.team); return; }
    if (m.t === 'start') { core.forceStart(client.id); return; }
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
