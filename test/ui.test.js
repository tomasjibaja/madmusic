// Prueba de punta a punta: la plataforma (index.html) hablando con el servidor (base falsa)
const fs = require('fs'), path = require('path'), assert = require('node:assert/strict');
process.env.JWT_SECRET = 'prueba-prueba-prueba-prueba-1234'; process.env.TEACHER_PASSWORD = 'docente-123';
const { fakeDb } = require('./fakedb');
const db = fakeDb(); global.__SONORO_TEST_DB = db;
const handler = require('../api/index.js');

const els = {};
const mk = () => ({ value: '', textContent: '', className: '', innerHTML: '', disabled: false, style: { setProperty() {} }, classList: { toggle() {}, add() {}, remove() {} }, setAttribute() {}, removeAttribute() {}, appendChild() {}, addEventListener() {}, remove() {}, dataset: {}, contentWindow: {} });
const $ = (s) => els[s] || (els[s] = mk());
const listeners = {};
Object.assign(global, {
  document: { querySelector: $, querySelectorAll: () => [], createElement: mk, body: { appendChild() {}, classList: { toggle() {} } }, onkeydown: null },
  window: { scrollTo() {} }, location: { search: '', pathname: '/' }, history: { replaceState() {} },
  localStorage: { _d: {}, getItem(k) { return this._d[k] ?? null; }, setItem(k, v) { this._d[k] = v; }, removeItem(k) { delete this._d[k]; } },
  addEventListener: (t, f) => { listeners[t] = f; }, requestAnimationFrame() {}, matchMedia: () => ({ matches: false }), innerWidth: 400, innerHeight: 800,
  setTimeout: (f) => 0,
});
global.fetch = async (url, o = {}) => {
  const res = { code: 0, out: null, setHeader() {}, status(c) { this.code = c; return this; }, json(x) { this.out = x; return this; } };
  const h = {}; for (const [k, v] of Object.entries(o.headers || {})) h[k.toLowerCase()] = v;
  await handler({ method: o.method || 'GET', url, headers: { ...h, host: 'x.test' }, body: o.body ? JSON.parse(o.body) : undefined }, res);
  return { ok: res.code < 400, status: res.code, json: async () => res.out };
};
const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
const code = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)][0][1];
const AF = Object.getPrototypeOf(async function () {}).constructor;
const call = async (m, p, b, t) => { const r = await fetch('/api/index?r=' + p, { method: m, headers: t ? { Authorization: 'Bearer ' + t } : {}, body: b ? JSON.stringify(b) : undefined }); return r.json(); };

(async () => {
  const T = (await call('POST', 'teacher/login', { password: 'docente-123' })).token;
  await call('POST', 'teacher/settings', { topics: { t1: true }, games: { ritmo: true, arena: true } }, T);
  const r = await new AF('assert', 'call', 'listeners', 'db', code + `
;await boot();
assert.equal(BOOT,true); assert.equal(ST.topics.t1,true); assert.equal(ME,null);
draft={n:'Lola',p:'1234'};cs=4;await createAcc();
assert.equal(ME.name,'Lola');assert.equal(ME.avatar,4);assert.ok(TOKEN);
assert.ok(!games(ME).includes('Instrumentos ancestrales')&&!games(ME).includes('Línea del tiempo'));ST.games={...ST.games,ances:true};assert.ok(games(ME).includes('Instrumentos ancestrales')&&games(ME).includes('Próximamente'));ST.games.ances=false;
nav('rank');await new Promise(r=>setImmediate(r));await new Promise(r=>setImmediate(r));assert.equal(RK.me,1);
// teoría completa
openT('t1');for(let k=0;k<5;k++)step(1);await new Promise(r=>setImmediate(r));await new Promise(r=>setImmediate(r));
assert.equal((await api('me')).user.read.t1.done,true);
// juego
playG('ritmo');const old=()=>{db.collection('users')._docs[0].lv={ritmo:1}};
const send=async d=>{listeners.message({data:d,source:$('#gf').contentWindow});await Q};
await send({sonoro:'level',pts:60,next:1,score:60});assert.equal(ME.points.ritmo,60);assert.equal(ME.prog.ritmo.level,1);
old();await send({sonoro:'level',pts:70,next:null,score:130});old();
await send({sonoro:'end',bonus:50,score:180});assert.equal(ME.points.ritmo,180);assert.equal(ME.stats.ritmo.plays,1);
// arena: lleva nivel, temas y dibujos; suma al ganar y guarda el repertorio
launchG('arena',null);const sd=$('#gf').srcdoc;assert.ok(sd.includes('window.SONORO')&&sd.includes('"charLevel":1')&&sd.includes('"topics":["t1"]')&&sd.includes('"figs":["'));
const i0=sd.indexOf('window.SONORO='),inj=sd.slice(i0,sd.indexOf('</script>',i0));assert.ok(inj.length>5000&&!inj.includes('<'),'los datos inyectados no deben contener <');
await send({sonoro:'battle',pts:100});assert.equal(ME.points.arena,100);assert.equal(ME.stats.arena.plays,1);
await send({sonoro:'save',state:'{"t":[1,2]}'});assert.equal(ME.gstate.arena,'{"t":[1,2]}');
launchG('arena',null);assert.ok($('#gf').srcdoc.includes('{\\"t\\":[1,2]}')||$('#gf').srcdoc.includes('"state"'));
// salir y volver a entrar
logout();assert.equal(ME,null);mode='login';assert.ok(auth().includes('class="cover"')&&auth().includes('Crear mi usuario')&&!auth().includes('cta')&&auth().includes('MAD MUSIC'));mode='new';assert.ok(auth().includes('Ya tengo usuario'));mode='login';mode='login';$('#un').value='LOLA';$('#pw').value='1234';await go({preventDefault(){}});
assert.equal(ME.name,'Lola');assert.equal(total(ME),280);
// blanqueo por enlace
return TOKEN;`)(assert, call, listeners, db);
  const bl = await call('POST', 'teacher/blank', { username: 'lola' }, T);
  assert.match(bl.link, /reset=/); assert.ok((new Date(bl.exp) - Date.now()) / 3600000 > 23.9);
  console.log('Prueba de punta a punta OK (registro, ranking, teoría, juego, bonus, ingreso, blanqueo)');
})().catch((e) => { console.error('FALLÓ:', e); process.exit(1); });
