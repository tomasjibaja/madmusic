// Pruebas del servidor con una base de datos falsa en memoria (no necesita MongoDB ni internet)
const assert = require('node:assert/strict');
process.env.JWT_SECRET = 'prueba-prueba-prueba-prueba-1234';
process.env.TEACHER_PASSWORD = 'docente-123';

const { fakeDb } = require('./fakedb');
const db = fakeDb();
global.__SONORO_TEST_DB = db;
const handler = require('../api/index.js');

async function call(method, path, body, token) {
  const res = { code: 0, out: null, setHeader() {}, status(c) { this.code = c; return this; }, json(o) { this.out = o; return this; } };
  await handler({ method, url: '/api/index?r=' + path, headers: token ? { authorization: 'Bearer ' + token, host: 'sonoro.test' } : { host: 'sonoro.test' }, body }, res);
  return res;
}
const ok = (r, c = 200) => assert.equal(r.code, c, JSON.stringify(r.out));
const users = db.collection('users')._docs;
const old = (u, g) => { users.find((x) => x.username === u).lv = { [g]: 1 }; }; // saltear la espera mínima

(async () => {
  let r = await call('GET', 'settings'); ok(r); assert.equal(r.out.allowSignup, true); assert.deepEqual(r.out.topics, {});

  r = await call('POST', 'register', { username: 'Ana', password: '1234', avatar: 3 }); ok(r);
  const ana = r.out.token; assert.equal(r.out.user.name, 'Ana'); assert.ok(!('pwHash' in r.out.user));
  ok(await call('POST', 'register', { username: 'ana', password: '1234', avatar: 1 }), 409);
  ok(await call('POST', 'register', { username: '<b>', password: '1234', avatar: 1 }), 400);
  ok(await call('POST', 'register', { username: 'Beto', password: '1234', avatar: 99 }), 400);
  r = await call('POST', 'register', { username: 'Beto', password: 'abcd', avatar: 5 }); ok(r);

  ok(await call('POST', 'login', { username: 'ana', password: 'mal' }), 401);
  r = await call('POST', 'login', { username: 'ANA', password: '1234' }); ok(r);
  for (let i = 0; i < 8; i++) await call('POST', 'login', { username: 'beto', password: 'x' });
  ok(await call('POST', 'login', { username: 'beto', password: 'abcd' }), 429);

  ok(await call('GET', 'me'), 401);
  r = await call('GET', 'me', null, ana); ok(r); assert.equal(r.out.user.avatar, 3);

  // docente
  ok(await call('POST', 'teacher/login', { password: 'mala' }), 401);
  r = await call('POST', 'teacher/login', { password: 'docente-123' }); ok(r); const T = r.out.token;
  ok(await call('GET', 'teacher/users', null, ana), 401);
  ok(await call('POST', 'teacher/settings', { topics: { t1: true } }), 401);
  r = await call('POST', 'teacher/settings', { allowSignup: true, topics: { t1: true, zzz: true } }, T); ok(r); assert.deepEqual(r.out.settings.topics, { t1: true });

  // lectura
  ok(await call('POST', 'read', { topic: 't2', slide: 0 }, ana), 403);
  ok(await call('POST', 'read', { topic: 't1', slide: 9 }, ana), 400);
  for (let i = 0; i < 5; i++) { r = await call('POST', 'read', { topic: 't1', slide: i }, ana); ok(r); assert.equal(r.out.done, false); }
  r = await call('POST', 'read', { topic: 't1', slide: 5 }, ana); assert.equal(r.out.done, true);
  r = await call('GET', 'me', null, ana); assert.equal(r.out.user.read.t1.done, true);

  // juegos
  ok(await call('POST', 'progress/level', { game: 'ritmo', pts: 10, next: 1, score: 10 }, ana), 403);
  r = await call('POST', 'teacher/settings', { games: { ritmo: true, cambio: true, zzz: true } }, T); ok(r); assert.deepEqual(r.out.settings.games, { ritmo: true, cambio: true });
  ok(await call('POST', 'progress/level', { game: 'ritmo', pts: 999, next: 1, score: 10 }, ana), 400);
  ok(await call('POST', 'progress/end', { game: 'ritmo' }, ana), 400);
  r = await call('POST', 'progress/level', { game: 'ritmo', pts: 60, next: 1, score: 60 }, ana); ok(r);
  assert.equal(r.out.user.points.ritmo, 60); assert.equal(r.out.user.prog.ritmo.level, 1);
  ok(await call('POST', 'progress/level', { game: 'ritmo', pts: 10, next: 2, score: 70 }, ana), 429);
  old('ana', 'ritmo'); r = await call('POST', 'progress/level', { game: 'ritmo', pts: 70, next: 2, score: 130 }, ana); ok(r);
  old('ana', 'ritmo'); ok(await call('POST', 'progress/level', { game: 'ritmo', pts: 50, next: 3, score: 180 }, ana));
  old('ana', 'ritmo'); r = await call('POST', 'progress/level', { game: 'ritmo', pts: 80, next: null, score: 260 }, ana); ok(r);
  assert.equal(r.out.user.points.ritmo, 260); assert.ok(!r.out.user.prog.ritmo);
  r = await call('POST', 'progress/end', { game: 'ritmo', bonus: 99999 }, ana); ok(r);
  assert.equal(r.out.user.points.ritmo, 310); assert.deepEqual(r.out.user.stats.ritmo, { plays: 1, best: 310 });
  ok(await call('POST', 'progress/end', { game: 'ritmo' }, ana), 400);
  // reanudar y empezar de nuevo
  old('ana', 'cambio'); await call('POST', 'progress/level', { game: 'cambio', pts: 40, next: 1, score: 40 }, ana);
  r = await call('POST', 'progress/reset', { game: 'cambio' }, ana); ok(r); assert.ok(!r.out.user.prog.cambio); assert.equal(r.out.user.points.cambio, 40);

  // ranking
  r = await call('GET', 'ranking', null, ana); ok(r);
  assert.equal(r.out.total, 2); assert.equal(r.out.me, 1); assert.equal(r.out.list[0].p, 350);

  // arena (una sola batalla, sin niveles ni bonus)
  ok(await call('POST', 'progress/battle', { game: 'arena', pts: 50 }, ana), 403);
  ok(await call('POST', 'teacher/settings', { games: { ritmo: true, cambio: true, arena: true } }, T));
  ok(await call('POST', 'progress/level', { game: 'arena', pts: 10, next: null, score: 1 }, ana), 400);
  ok(await call('POST', 'progress/battle', { game: 'ritmo', pts: 10 }, ana), 400);
  ok(await call('POST', 'progress/battle', { game: 'arena', pts: 401 }, ana), 400);
  ok(await call('POST', 'progress/battle', { game: 'arena', pts: 0 }, ana), 400);
  r = await call('POST', 'progress/battle', { game: 'arena', pts: 90 }, ana); ok(r);
  assert.equal(r.out.user.points.arena, 90); assert.deepEqual(r.out.user.stats.arena, { plays: 1, best: 90 });
  ok(await call('POST', 'progress/battle', { game: 'arena', pts: 80 }, ana), 429);
  old('ana', 'arena'); r = await call('POST', 'progress/battle', { game: 'arena', pts: 120 }, ana); ok(r);
  assert.equal(r.out.user.points.arena, 210); assert.deepEqual(r.out.user.stats.arena, { plays: 2, best: 120 });
  r = await call('POST', 'progress/save', { game: 'arena', state: 'x'.repeat(400) }, ana); ok(r); assert.equal(r.out.user.gstate.arena.length, 300);
  ok(await call('POST', 'progress/save', { game: 'ritmo', state: 'a' }, ana), 400);

  // blanqueo (24 h)
  r = await call('POST', 'teacher/blank', { username: 'ana' }, T); ok(r);
  assert.match(r.out.link, /^https:\/\/sonoro\.test\/\?reset=[\w-]{20,}&u=ana$/);
  const hrs = (new Date(r.out.exp) - Date.now()) / 3600000; assert.ok(hrs > 23.9 && hrs <= 24.01, 'vence en 24 h');
  const tok = r.out.link.split('reset=')[1].split('&')[0];
  r = await call('POST', 'login', { username: 'ana', password: '1234' }); ok(r, 403); assert.equal(r.out.blanqueada, true);
  ok(await call('GET', 'me', null, ana), 401);
  ok(await call('POST', 'reset', { username: 'ana', token: 'falso', password: 'nueva1' }), 400);
  r = await call('POST', 'reset', { username: 'ana', token: tok, password: 'nueva1' }); ok(r);
  ok(await call('GET', 'me', null, r.out.token));
  ok(await call('POST', 'reset', { username: 'ana', token: tok, password: 'otra22' }), 400);
  ok(await call('POST', 'login', { username: 'ana', password: 'nueva1' }));
  // vencido
  r = await call('POST', 'teacher/blank', { username: 'ana' }, T); const t2 = r.out.link.split('reset=')[1].split('&')[0];
  users.find((x) => x.username === 'ana').reset.exp = new Date(Date.now() - 1000);
  ok(await call('POST', 'reset', { username: 'ana', token: t2, password: 'nueva2' }), 400);

  // docente: listado y baja
  r = await call('GET', 'teacher/users', null, T); ok(r);
  assert.equal(r.out.users.length, 2); assert.ok(r.out.users.every((u) => !('pwHash' in u)));
  assert.equal(r.out.users.find((u) => u.username === 'ana').blanqueo !== null, true);
  r = await call('POST', 'teacher/delete', { username: 'beto' }, T); assert.equal(r.out.deleted, 1);
  ok(await call('POST', 'teacher/settings', { allowSignup: false }, T));
  ok(await call('POST', 'register', { username: 'Carla', password: '1234', avatar: 1 }), 403);
  r = await call('POST', 'teacher/settings', { games: { ances: true, orig: false } }, T); ok(r); assert.deepEqual(r.out.settings.games, { ances: true, orig: false });
  assert.equal((await call('GET', 'settings')).out.games.ances, true);
  r = await call('POST', 'register', { username: 'Dani', password: '1234', avatar: 2 }); ok(r, 403); // el registro quedó apagado
  await call('POST', 'teacher/settings', { allowSignup: true }, T); r = await call('POST', 'register', { username: 'Dani', password: '1234', avatar: 2 }); ok(r);
  ok(await call('POST', 'progress/level', { game: 'ances', pts: 5, next: 1, score: 5 }, r.out.token), 400);
  ok(await call('GET', 'nada'), 404);
  r = await call('GET', 'health'); ok(r); assert.equal(r.out.db, 'ok'); assert.equal(r.out.env.JWT_SECRET, true); assert.ok(!JSON.stringify(r.out).includes('prueba-prueba'));
  delete process.env.JWT_SECRET; r = await call('POST', 'register', { username: 'Zeta', password: '1234', avatar: 1 }); ok(r, 500); assert.match(r.out.error, /JWT_SECRET/); assert.equal(users.some((x) => x.username === 'zeta'), false);
  process.env.JWT_SECRET = 'prueba-prueba-prueba-prueba-1234';
  console.log('Todas las pruebas del servidor pasaron');
})().catch((e) => { console.error('FALLÓ:', e.message); process.exit(1); });
