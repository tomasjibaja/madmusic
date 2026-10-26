// Batalla completa de punta a punta con un DOM de mentira: moneda, entrada de personajes, ventana RPG, ataques, preguntas, fondos y puntos
const fs = require('fs'), path = require('path'), assert = require('node:assert/strict');
const html = fs.readFileSync(path.join(__dirname, '../games-src/arena/index.html'), 'utf8');
const code = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)][0][1];

const ctxP = new Proxy({}, { get: (t, k) => (k in t ? t[k] : () => {}), set: (t, k, v) => { t[k] = v; return true; } });
const kidsOf = (el) => {
  if (el._k && el._kh === el._h) return el._k;
  const out = { ab: [], op: [], bt: [] };
  for (const m of el._h.matchAll(/<button class="(ab|op|bt)"([^>]*)>([\s\S]*?)<\/button>/g)) {
    const ds = {}; for (const d of m[2].matchAll(/data-(\w+)="([^"]*)"/g)) ds[d[1]] = d[2];
    out[m[1]].push({ dataset: ds, disabled: /\bdisabled\b/.test(m[2]), textContent: m[3].replace(/<[^>]*>/g, ''), onclick: null, classList: { add() {} }, setAttribute() {} });
  }
  el._k = out; el._kh = el._h; return out;
};
class El {
  constructor(sel) { this.sel = sel; this._h = ''; this.log = []; const me = this; this.style = new Proxy({ setProperty() {}, removeProperty() {} }, { set(t, k, v) { t[k] = v; me.log.push([k, v]); return true; } }); this.dataset = {}; this.classList = { toggle() {}, add() {}, remove() {} }; this.textContent = ''; this.className = ''; this.value = '3'; this.id = ''; }
  set innerHTML(v) { this._h = String(v); }
  get innerHTML() { return this._h; }
  querySelectorAll(s) { return kidsOf(this)[s.replace('.', '')] || []; }
  querySelector(s) { return kidsOf(this)[s.replace('.', '')]?.[0] || new El(s); }
  appendChild(c) { return c; }
  remove() {}
  setAttribute() {}
  getBoundingClientRect() { return { left: 0, top: 0, right: 360, bottom: 400, width: 360, height: 400 }; }
  animate() { return { finished: Promise.resolve(), cancel() {}, set onfinish(f) { setTimeout(f, 0); } }; }
  getContext() { return ctxP; }
}
const els = {}; const $ = (s) => els[s] || (els[s] = new El(s));
const node = () => new Proxy(function () {}, { get: (t, k) => (k === 'getChannelData' ? () => new Float32Array(1000) : k === 'currentTime' ? 0 : k === 'sampleRate' ? 44100 : node()), apply: () => node(), set: () => true });
class FakeAC { constructor() { return new Proxy({}, { get: (t, k) => (k === 'currentTime' ? 0 : k === 'sampleRate' ? 44100 : k === 'createBuffer' ? (c, n) => ({ getChannelData: () => new Float32Array(Math.min(n, 5000)) }) : k === 'destination' ? {} : () => node()) }); } }
const posted = [];
const fast = (f) => setTimeout(f, 0);
const S = { userName: 'lucia', charLevel: 4, topics: ['t1', 't2', 't3', 't4', 't5', 't6'], figs: Array(12).fill('<svg id="rival"/>'), meFig: '<svg id="yo"/>' };
const win = { SONORO: S, devicePixelRatio: 1, AudioContext: FakeAC, addEventListener() {} };
const doc = { querySelector: $, createElement: () => new El('x'), body: new El('body') };
const raf = (f) => setTimeout(() => f(performance.now()), 0);
const api = new Function('document', 'window', 'parent', 'setTimeout', 'setInterval', 'clearInterval', 'requestAnimationFrame', 'AudioContext', 'webkitAudioContext',
  code + ';return {BANK,BG}')(doc, win, { postMessage: (o) => posted.push(o) }, fast, () => 0, () => {}, raf, FakeAC, FakeAC);

(async () => {
  const ov = $('#ov'), panel = $('#panel'); let menuHtml = '', askHtml = '', clicks = 0;
  for (let i = 0; i < 40000 && !posted.some((p) => p.sonoro === 'battle'); i++) {
    await new Promise((r) => setImmediate(r));
    const bt = ov.querySelectorAll('bt')[0]; if (ov.style.display === 'flex' && bt && !bt._d) { bt._d = 1; clicks++; bt.onclick && bt.onclick(); continue; }
    const ab = panel.querySelectorAll('ab');
    if (ab.length && !ab[0]._d) { ab[0]._d = 1; menuHtml = menuHtml || panel._h; const best = ab.filter((a) => !a.disabled).pop(); best.onclick && best.onclick(); continue; }
    const op = panel.querySelectorAll('op');
    if (op.length && !op[0]._d) { op[0]._d = 1; askHtml = askHtml || panel._h; const q = api.BANK.find((b) => panel._h.includes(b[1])); const ok = op.find((o) => o.textContent === q[2]) || op[0]; ok.onclick && ok.onclick(); }
  }
  const win_ = posted.find((p) => p.sonoro === 'battle');
  assert.ok(win_ && win_.pts >= 1 && win_.pts <= 400, 'ganó la batalla y envió los puntos: ' + JSON.stringify(win_));
  assert.ok(menuHtml.includes('class="tt2"') && /\d+\/\d+/.test(menuHtml) && !menuHtml.includes('<svg'), 'menú de ataques: solo nombre y usos, sin ícono');
  assert.ok(askHtml.includes('class="qq"') && /class="op"/.test(askHtml), 'pregunta con opciones como texto');
  assert.ok(posted.some((p) => p.sonoro === 'save'), 'guardó el repertorio');
  assert.ok($('#bgt').log.some(([k, v]) => k === 'opacity' && v === '1'), 'el fondo reacciona al ataque');
  assert.ok($('#bg').innerHTML.startsWith('<svg'), 'hay fondo');
  assert.ok($('#panel').style.bottom && $('#panel').style.left, 'la ventana se ubica sobre la barra de HP, a la derecha del personaje');
  assert.ok($('#rf').innerHTML.includes('rival') && $('#mf').innerHTML.includes('id="yo"'), 'usa los personajes de la plataforma');
  console.log('Batalla completa OK: moneda, entrada, menú, preguntas, fondo, puntos =', win_.pts);
})().catch((e) => { console.error('FALLÓ:', e); process.exit(1); });
