const { getDb } = require('./_lib/db');
const A = require('./_lib/auth');
const { GAMES, PLANNED, TOPICS, AVATARS, FINISH_BONUS, MIN_LEVEL_SECONDS, MIN_BATTLE_SECONDS, RESET_HOURS } = require('./_lib/data');

const fail = (http, message, extra) => Object.assign(new Error(message), { http, extra });
const NAME_RE = /^[\p{L}\p{N}_.\- ]{3,16}$/u;
const DAY = 86400;

const pub = (u) => ({ username: u.username, name: u.name, avatar: u.avatar, points: u.points || {}, read: u.read || {}, stats: u.stats || {}, prog: u.prog || {}, gstate: u.gstate || {} });
const int = (v, lo, hi) => { const n = Math.round(Number(v)); return Number.isFinite(n) && n >= lo && n <= hi ? n : null; };

async function getSettings(db) {
  const s = (await db.collection('settings').findOne({ _id: 'main' })) || {};
  return { allowSignup: s.allowSignup !== false, topics: s.topics || {}, games: s.games || {} };
}
async function limit(db, key, max, seconds) {
  const a = await db.collection('attempts').findOne({ _id: key });
  if (a && a.n >= max && a.exp > new Date()) throw fail(429, 'Demasiados intentos. Probá de nuevo en unos minutos.');
}
async function strike(db, key, seconds) {
  await db.collection('attempts').updateOne({ _id: key }, { $inc: { n: 1 }, $setOnInsert: { exp: new Date(Date.now() + seconds * 1000) } }, { upsert: true });
}
const clear = (db, key) => db.collection('attempts').deleteOne({ _id: key });

async function student(ctx) {
  const m = (ctx.req.headers.authorization || '').match(/^Bearer (.+)$/);
  const t = m && A.verify(m[1]);
  if (!t || t.role !== 'student') throw fail(401, 'Sesión vencida. Entrá de nuevo.');
  const u = await ctx.db.collection('users').findOne({ username: t.sub });
  if (!u || (u.tokVer || 0) !== (t.tv || 0)) throw fail(401, 'Sesión vencida. Entrá de nuevo.');
  return u;
}
function teacher(ctx) {
  const m = (ctx.req.headers.authorization || '').match(/^Bearer (.+)$/);
  const t = m && A.verify(m[1]);
  if (!t || t.role !== 'teacher') throw fail(401, 'Sesión de docente vencida.');
}
const studentToken = (u) => A.sign({ sub: u.username, role: 'student', tv: u.tokVer || 0 }, 30 * DAY);
const session = (u) => ({ token: studentToken(u), user: pub(u) });

const clean = (m) => String(m || '').replace(/mongodb(\+srv)?:\/\/\S+/gi, '[uri]').slice(0, 220);
const H = {
  'GET settings': async ({ db }) => getSettings(db),

  'POST register': async ({ db, b }) => {
    A.secret();
    const st = await getSettings(db);
    if (!st.allowSignup) throw fail(403, 'Por ahora no se pueden crear usuarios nuevos.');
    const name = String(b.username || '').trim(), pw = String(b.password || '');
    if (!NAME_RE.test(name)) throw fail(400, 'El usuario debe tener entre 3 y 16 letras, números, guiones o puntos.');
    if (pw.length < 4 || pw.length > 64) throw fail(400, 'La contraseña necesita 4 caracteres o más.');
    const avatar = int(b.avatar, 0, AVATARS - 1);
    if (avatar === null) throw fail(400, 'Elegí un personaje.');
    const u = { username: name.toLowerCase(), name, pwHash: await A.hashPw(pw), avatar, points: {}, read: {}, stats: {}, prog: {}, tokVer: 0, createdAt: new Date() };
    try { await db.collection('users').insertOne(u); }
    catch (e) { if (e && e.code === 11000) throw fail(409, 'Ese usuario ya existe. Probá con otro.'); throw e; }
    return session(u);
  },

  'POST login': async ({ db, b }) => {
    A.secret();
    const k = String(b.username || '').trim().toLowerCase(), key = 'login:' + k;
    await limit(db, key, 8, 900);
    const u = k && await db.collection('users').findOne({ username: k });
    if (u && !u.pwHash) throw fail(403, 'Tu contraseña fue blanqueada. Usá el enlace que te mandó tu docente.', { blanqueada: true });
    if (!u || !(await A.checkPw(String(b.password || ''), u.pwHash))) { await strike(db, key, 900); throw fail(401, 'Usuario o contraseña incorrectos.'); }
    await clear(db, key);
    return session(u);
  },

  'POST reset': async ({ db, b }) => {
    A.secret();
    const k = String(b.username || '').trim().toLowerCase(), key = 'reset:' + k, pw = String(b.password || '');
    await limit(db, key, 8, 900);
    if (pw.length < 4 || pw.length > 64) throw fail(400, 'La contraseña necesita 4 caracteres o más.');
    const u = k && await db.collection('users').findOne({ username: k });
    const ok = u && u.reset && new Date(u.reset.exp) > new Date() && A.sameStr(A.sha(String(b.token || '').trim()), u.reset.h);
    if (!ok) { await strike(db, key, 900); throw fail(400, 'El enlace o el código no es válido, o ya venció. Pedile uno nuevo a tu docente.'); }
    const nv = (u.tokVer || 0) + 1, hash = await A.hashPw(pw);
    await db.collection('users').updateOne({ username: k }, { $set: { pwHash: hash, tokVer: nv }, $unset: { reset: '' } });
    await clear(db, key);
    return session({ ...u, tokVer: nv });
  },

  'GET me': async (ctx) => ({ user: pub(await student(ctx)) }),

  'POST progress/reset': async (ctx) => {
    const u = await student(ctx), g = String(ctx.b.game || '');
    if (!GAMES[g]) throw fail(400, 'Juego desconocido.');
    await ctx.db.collection('users').updateOne({ username: u.username }, { $unset: { ['prog.' + g]: '', ['fin.' + g]: '' } });
    return { user: pub(await ctx.db.collection('users').findOne({ username: u.username })) };
  },

  'POST progress/level': async (ctx) => {
    const u = await student(ctx), { db, b } = ctx, g = String(b.game || ''), G = GAMES[g];
    if (!G || G.battle) throw fail(400, 'Juego desconocido.');
    if ((await getSettings(db)).games[g] !== true) throw fail(403, 'Este juego todavía no está habilitado.');
    const pts = int(b.pts, 0, G.cap), score = int(b.score, 0, 5000);
    const next = b.next === null || b.next === undefined ? null : int(b.next, 1, G.levels - 1);
    if (pts === null || score === null || (b.next != null && next === null)) throw fail(400, 'Datos inválidos.');
    const now = Date.now(), last = u.lv && u.lv[g];
    if (last && now - last < MIN_LEVEL_SECONDS * 1000) throw fail(429, 'Demasiado rápido.');
    const prev = u.prog && u.prog[g] ? u.prog[g].run || 0 : 0, run = prev + pts;
    const set = { ['lv.' + g]: now }, unset = {};
    if (next !== null) set['prog.' + g] = { level: next, score, run };
    else { unset['prog.' + g] = ''; set['fin.' + g] = { ts: now, run }; }
    const upd = { $inc: { ['points.' + g]: pts }, $set: set };
    if (Object.keys(unset).length) upd.$unset = unset;
    await db.collection('users').updateOne({ username: u.username }, upd);
    return { user: pub(await db.collection('users').findOne({ username: u.username })) };
  },

  'POST progress/end': async (ctx) => {
    const u = await student(ctx), { db, b } = ctx, g = String(b.game || '');
    if (!GAMES[g] || GAMES[g].battle) throw fail(400, 'Juego desconocido.');
    if ((await getSettings(db)).games[g] !== true) throw fail(403, 'Este juego todavía no está habilitado.');
    const f = u.fin && u.fin[g];
    if (!f || Date.now() - f.ts > 180000) throw fail(400, 'No hay una partida terminada para sumar el bonus.');
    const st = (u.stats && u.stats[g]) || { plays: 0, best: 0 }, total = f.run + FINISH_BONUS;
    await db.collection('users').updateOne({ username: u.username }, {
      $inc: { ['points.' + g]: FINISH_BONUS },
      $set: { ['stats.' + g]: { plays: (st.plays || 0) + 1, best: Math.max(st.best || 0, total) } },
      $unset: { ['fin.' + g]: '', ['prog.' + g]: '' },
    });
    return { user: pub(await db.collection('users').findOne({ username: u.username })) };
  },

  // Juegos de una sola batalla (sin niveles ni bonus): solo suman si se gana
  'POST progress/battle': async (ctx) => {
    const u = await student(ctx), { db, b } = ctx, g = String(b.game || ''), G = GAMES[g];
    if (!G || !G.battle) throw fail(400, 'Juego desconocido.');
    if ((await getSettings(db)).games[g] !== true) throw fail(403, 'Este juego todavía no está habilitado.');
    const pts = int(b.pts, 1, G.cap);
    if (pts === null) throw fail(400, 'Datos inválidos.');
    const now = Date.now(), last = u.lv && u.lv[g];
    if (last && now - last < MIN_BATTLE_SECONDS * 1000) throw fail(429, 'Demasiado rápido.');
    const st = (u.stats && u.stats[g]) || { plays: 0, best: 0 };
    await db.collection('users').updateOne({ username: u.username }, { $inc: { ['points.' + g]: pts }, $set: { ['lv.' + g]: now, ['stats.' + g]: { plays: (st.plays || 0) + 1, best: Math.max(st.best || 0, pts) } } });
    return { user: pub(await db.collection('users').findOne({ username: u.username })) };
  },

  'POST progress/save': async (ctx) => {
    const u = await student(ctx), g = String(ctx.b.game || ''), G = GAMES[g];
    if (!G || !G.battle) throw fail(400, 'Juego desconocido.');
    const state = String(ctx.b.state == null ? '' : ctx.b.state).slice(0, 300);
    await ctx.db.collection('users').updateOne({ username: u.username }, { $set: { ['gstate.' + g]: state } });
    return { user: pub(await ctx.db.collection('users').findOne({ username: u.username })) };
  },

  'POST read': async (ctx) => {
    const u = await student(ctx), { db, b } = ctx, t = String(b.topic || ''), n = TOPICS[t];
    if (!n) throw fail(400, 'Tema desconocido.');
    const slide = int(b.slide, 0, n - 1);
    if (slide === null) throw fail(400, 'Datos inválidos.');
    const st = await getSettings(db);
    if (st.topics[t] !== true) throw fail(403, 'Este tema todavía no está habilitado.');
    await db.collection('users').updateOne({ username: u.username }, { $addToSet: { ['read.' + t + '.v']: slide } });
    const v = (await db.collection('users').findOne({ username: u.username })).read[t].v;
    const done = v.length >= n;
    if (done) await db.collection('users').updateOne({ username: u.username }, { $set: { ['read.' + t + '.done']: true } });
    return { done, count: v.length };
  },

  'GET ranking': async (ctx) => {
    const me = await student(ctx);
    const all = await ctx.db.collection('users').find({}, { projection: { username: 1, name: 1, avatar: 1, points: 1 } }).toArray();
    const rows = all.map((x) => ({ k: x.username, n: x.name, a: x.avatar, p: Object.values(x.points || {}).reduce((s, v) => s + v, 0) }))
      .sort((x, y) => y.p - x.p || x.n.localeCompare(y.n));
    rows.forEach((x) => { x.pos = 1 + rows.filter((y) => y.p > x.p).length; x.me = x.k === me.username; });
    const list = rows.slice(0, 100), mine = rows.find((x) => x.me);
    if (mine && !list.includes(mine)) list.push(mine);
    return { total: rows.length, me: mine ? mine.pos : null, list: list.map(({ k, ...r }) => r) };
  },

  // ---------- docente ----------
  'POST teacher/login': async ({ db, b }) => {
    const exp = process.env.TEACHER_PASSWORD;
    if (!exp) throw fail(500, 'Falta TEACHER_PASSWORD en el servidor.');
    await limit(db, 'teacher', 8, 900);
    if (!A.sameStr(String(b.password || ''), exp)) { await strike(db, 'teacher', 900); throw fail(401, 'Contraseña incorrecta.'); }
    await clear(db, 'teacher');
    return { token: A.sign({ role: 'teacher' }, 8 * 3600) };
  },

  'GET teacher/users': async (ctx) => {
    teacher(ctx);
    const all = await ctx.db.collection('users').find({}, { projection: { pwHash: 0, tokVer: 0, lv: 0, fin: 0 } }).toArray();
    return { settings: await getSettings(ctx.db), topics: TOPICS, users: all.map((u) => ({ ...pub(u), createdAt: u.createdAt, blanqueo: u.reset ? { exp: u.reset.exp } : null, sinClave: !!u.reset })) };
  },

  'POST teacher/blank': async (ctx) => {
    teacher(ctx);
    const { db, b, req } = ctx, k = String(b.username || '').trim().toLowerCase();
    const u = k && await db.collection('users').findOne({ username: k });
    if (!u) throw fail(404, 'No existe ese usuario.');
    const token = A.newToken(), exp = new Date(Date.now() + RESET_HOURS * 3600 * 1000);
    await db.collection('users').updateOne({ username: k }, { $set: { pwHash: null, tokVer: (u.tokVer || 0) + 1, reset: { h: A.sha(token), exp } } });
    const host = process.env.PUBLIC_URL || ('https://' + (req.headers['x-forwarded-host'] || req.headers.host));
    return { link: host.replace(/\/$/, '') + '/?reset=' + token + '&u=' + encodeURIComponent(k), exp, name: u.name, username: k };
  },

  'POST teacher/delete': async (ctx) => {
    teacher(ctx);
    const r = await ctx.db.collection('users').deleteOne({ username: String(ctx.b.username || '').trim().toLowerCase() });
    return { deleted: r.deletedCount || 0 };
  },

  'POST teacher/settings': async (ctx) => {
    teacher(ctx);
    const b = ctx.b, set = {};
    if (typeof b.allowSignup === 'boolean') set.allowSignup = b.allowSignup;
    if (b.topics && typeof b.topics === 'object') { set.topics = {}; for (const t of Object.keys(TOPICS)) if (typeof b.topics[t] === 'boolean') set.topics[t] = b.topics[t]; }
    if (b.games && typeof b.games === 'object') { set.games = {}; for (const g of [...Object.keys(GAMES), ...PLANNED]) if (typeof b.games[g] === 'boolean') set.games[g] = b.games[g]; }
    if (Object.keys(set).length) await ctx.db.collection('settings').updateOne({ _id: 'main' }, { $set: set }, { upsert: true });
    return { settings: await getSettings(ctx.db) };
  },
};

function routeOf(req) {
  const url = new URL(req.url, 'http://x');
  let p = url.searchParams.get('r');
  if (p === null) p = url.pathname.startsWith('/api/') ? url.pathname.slice(5) : '';
  return p.replace(/^\/+|\/+$/g, '');
}
// Diagnóstico: muestra qué variables están cargadas y si hay conexión con la base (nunca muestra valores secretos)
async function health() {
  const out = { env: { MONGODB_URI: !!process.env.MONGODB_URI, JWT_SECRET: (process.env.JWT_SECRET || '').length >= 16, TEACHER_PASSWORD: !!process.env.TEACHER_PASSWORD }, node: process.version, db: '' };
  try { const db = await getDb(); if (db.command) await db.command({ ping: 1 }); out.db = 'ok'; }
  catch (e) { out.db = 'error: ' + (e && e.name) + ': ' + clean(e && e.message); }
  return out;
}
function bodyOf(req) {
  let b = req.body;
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch (e) { b = {}; } }
  return b && typeof b === 'object' ? b : {};
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  try {
    const route = routeOf(req);
    if (req.method === 'GET' && route === 'health') return res.status(200).json(await health());
    const h = H[req.method + ' ' + route];
    if (!h) return res.status(404).json({ error: 'No existe.' });
    let db;
    try { db = await getDb(); } catch (e) { console.error(e); throw fail(503, 'No se pudo conectar con la base de datos. Avisale al docente.', { diag: 'db' }); }
    return res.status(200).json(await h({ req, res, db, b: bodyOf(req) }));
  } catch (e) {
    if (e && e.http) return res.status(e.http).json({ error: e.message, ...(e.extra || {}) });
    console.error(e);
    if (e && /^Falta /.test(e.message || '')) return res.status(500).json({ error: 'El servidor no está bien configurado: ' + e.message, diag: 'env' });
    return res.status(500).json({ error: 'Error del servidor. Probá de nuevo en un rato.' });
  }
};
module.exports._routes = Object.keys(H);
