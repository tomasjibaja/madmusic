// Panel docente contra el servidor (base falsa)
const fs = require('fs'), path = require('path'), assert = require('node:assert/strict');
process.env.JWT_SECRET = 'prueba-prueba-prueba-prueba-1234'; process.env.TEACHER_PASSWORD = 'docente-123';
const { fakeDb } = require('./fakedb');
const db = fakeDb(); global.__SONORO_TEST_DB = db;
const handler = require('../api/index.js');
const els = {};
const mk = () => ({ value: '', textContent: '', className: '', _h: '', set innerHTML(v) { this._h = v; }, get innerHTML() { return this._h; }, style: {}, select() {}, remove() {}, appendChild() {} });
const $ = (s) => els[s] || (els[s] = mk());
Object.assign(global, { document: { querySelector: $, createElement: mk, body: { appendChild() {} }, execCommand() {} }, sessionStorage: { _d: {}, getItem(k) { return this._d[k] ?? null; }, setItem(k, v) { this._d[k] = v; }, removeItem(k) { delete this._d[k]; } }, setTimeout: () => 0 });
global.fetch = async (url, o = {}) => {
  const res = { code: 0, out: null, setHeader() {}, status(c) { this.code = c; return this; }, json(x) { this.out = x; return this; } };
  const h = {}; for (const [k, v] of Object.entries(o.headers || {})) h[k.toLowerCase()] = v;
  await handler({ method: o.method || 'GET', url, headers: { ...h, host: 'x.test' }, body: o.body ? JSON.parse(o.body) : undefined }, res);
  return { ok: res.code < 400, status: res.code, json: async () => res.out };
};
const html = fs.readFileSync(path.join(__dirname, '../docente/index.html'), 'utf8');
const code = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)][0][1];
const AF = Object.getPrototypeOf(async function () {}).constructor;
const call = async (m, p, b) => (await (await fetch('/api/index?r=' + p, { method: m, headers: {}, body: b ? JSON.stringify(b) : undefined })).json());
(async () => {
  for (const n of ['Ana', 'Beto']) await call('POST', 'register', { username: n, password: '1234', avatar: 2 });
  await new AF('assert', code + `
;await init();assert.ok($('#app').innerHTML.includes('type="password"'));
$('#p1').value='mala';await login({preventDefault(){}});assert.ok($('#er').textContent.includes('incorrecta'));
$('#p1').value='docente-123';await login({preventDefault(){}});assert.equal(USERS.length,2);
for(const t of ['res','al','tm','aj']){tab=t;render();assert.ok($('#app').innerHTML.length>200,t)}
await setTopic('t2',true);assert.equal(SET.topics.t2,true);await allTopics(false);assert.equal(open_('t2'),false);
await setGame('ritmo',true);assert.equal(gOpen('ritmo'),true);await allGames(false);assert.equal(gOpen('ritmo'),false);
await saveSet({allowSignup:false});assert.equal(SET.allowSignup,false);
tab='al';sel='ana';render();assert.ok($('#app').innerHTML.includes('Blanquear'));
await doBlank('ana');assert.ok(USERS.find(u=>u.k==='ana').blanqueo);
await doDel('beto');assert.equal(USERS.length,1);
out();assert.equal(TOK,null);`)(assert);
  console.log('Panel docente OK (ingreso, pestañas, temas, registro, blanqueo, baja)');
})().catch((e) => { console.error('FALLÓ:', e); process.exit(1); });
