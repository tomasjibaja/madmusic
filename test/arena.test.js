// Humo de la Arena: arranca en modo prueba y dentro de la plataforma (con y sin temas)
const fs = require('fs'), path = require('path'), assert = require('node:assert/strict');
const html = fs.readFileSync(path.join(__dirname, '../games-src/arena/index.html'), 'utf8');
const code = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)][0][1];
function run(S) {
  const els = {};
  const mk = () => ({ _h: '', set innerHTML(v) { this._h = v; }, get innerHTML() { return this._h; }, style: { setProperty() {}, removeProperty() {} }, className: '', textContent: '', value: '1', dataset: {}, classList: { toggle() {} }, querySelectorAll: () => [], querySelector: () => mk(), getContext: () => new Proxy({}, { get: (t, k) => (k in t ? t[k] : () => {}), set: (t, k, v) => { t[k] = v; return true; } }), appendChild() {}, getBoundingClientRect: () => ({ left: 0, top: 0, width: 10, height: 10 }), animate: () => ({ finished: Promise.resolve(), cancel() {} }) });
  const $ = (s) => els[s] || (els[s] = mk());
  const posted = [];
  const g = { document: { querySelector: $, createElement: mk }, window: { SONORO: S, devicePixelRatio: 1, addEventListener() {} }, parent: { postMessage: (o) => posted.push(o) }, raf: (f) => setTimeout(() => f(performance.now()), 16) };
  const BG = new Function('document', 'window', 'parent', 'setInterval', 'clearInterval', 'requestAnimationFrame', code + ';return BG')(g.document, g.window, g.parent, () => 0, () => {}, g.raf);
  return { els, posted, BG };
}
(async () => {
  let r = run(undefined); assert.equal(r.els['#tb'].style.display, 'block'); assert.ok(r.els['#ov'].innerHTML.includes('Empezar batalla'));
  r = run({ charLevel: 4, topics: [], figs: [], meFig: '<svg/>' }); assert.ok(r.els['#ov'].innerHTML.includes('Todavía no hay temas habilitados'));
  r = run({ charLevel: 4, topics: ['t1', 't3', 'zz'], figs: [], meFig: '<svg/>' }); assert.ok(r.els['#ov'].innerHTML.includes('Empezar batalla'));
  // fondos y efecto de ataque
  const { BG, els } = run({ charLevel: 2, topics: ['t1'], figs: [], meFig: '<svg/>' });
  const vistos = new Set(); for (let i = 0; i < 60; i++) { BG.pick(); const h = els['#bg'].innerHTML; assert.ok(h.startsWith('<svg') && !h.includes('NaN') && !h.includes('undefined')); vistos.add(h.slice(300, 340)); }
  assert.equal(vistos.size, 3, 'los 3 fondos aparecen');
  BG.on('#ff3355', 5, -1, { x: 50, y: 60 }); assert.ok(BG.state().n >= 100 && BG.state().act === 1); assert.equal(els['#bgt'].style.opacity, '1');
  await new Promise((r) => setTimeout(r, 150)); assert.ok(BG.state().al > 0.5, 'las partículas aparecen');
  BG.off(); assert.equal(els['#bgt'].style.opacity, '0'); await new Promise((r) => setTimeout(r, 900)); assert.equal(BG.state().raf, 0, 'el efecto termina y vuelve al fondo inicial');
  assert.ok(html.includes('@media (min-width:820px)') && html.includes('BG.on(a[1],t,dir,e)') && html.includes('snd.hit();BG.off()') && html.includes('BG.pick();'));
  assert.ok(!/[\u{1F300}-\u{1FAFF}\u2600-\u27BF]/u.test(html), 'sin emojis');
  const bank = [...code.matchAll(/^\['(t\d)',/gm)].map((m) => m[1]); for (const t of ['t1', 't2', 't3', 't4', 't5', 't6']) assert.equal(bank.filter((x) => x === t).length, 25, t);
  console.log('Arena OK (arranque, 3 fondos, efecto de ataque, diseño ancho, sin emojis, 25 preguntas por tema)');
})().catch((e) => { console.error('FALLÓ:', e); process.exit(1); });
