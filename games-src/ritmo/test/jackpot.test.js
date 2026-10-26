import test from 'node:test';
import assert from 'node:assert/strict';
import { rollsJackpot, evaluateReels, oddsForLevel, SYMBOLS } from '../src/jackpot.js';
import { ORDER, symbolAt, planStop, brakePos, nextBrake } from '../src/reel.js';
import { createGame } from '../src/levels.js';
import { patternToGrid } from '../src/engine.js';

import { rollOutcome, reelsFor } from '../src/jackpot.js';
import { ODDS_START, ODDS_FINAL, JACKPOT_CHANCE } from '../src/config.js';
import { LEVELS } from '../src/levels.js';

const NL = LEVELS.length;
const close = (a, b) => Math.abs(a - b) < 1e-9;

test('configuración: jackpot 15%; inicio 25/25/25 (nada 25%) y final 20/15/10 (nada 55%)', () => {
  assert.equal(JACKPOT_CHANCE, 0.15);
  assert.deepEqual(ODDS_START, { double: 0.25, yellow: 0.25, red: 0.25 });
  assert.deepEqual(ODDS_FINAL, { double: 0.20, yellow: 0.15, red: 0.10 });
});

test('jackpot: probabilidad de aparecer (15%) con límite exacto', () => {
  assert.equal(rollsJackpot(() => 0.149), true);
  assert.equal(rollsJackpot(() => 0.15), false);
  assert.equal(rollsJackpot(() => 0.999999, 1), true);
  assert.equal(rollsJackpot(() => 0, 0), false);
});

test('probabilidades por nivel: 25% en el nivel 1 y las actuales en el último', () => {
  const l1 = oddsForLevel(0, NL), l4 = oddsForLevel(NL - 1, NL);
  for (const k of ['double', 'yellow', 'red', 'none']) assert.ok(close(l1[k], 0.25), `nivel 1 ${k}`);
  assert.ok(close(l4.double, 0.20) && close(l4.yellow, 0.15) && close(l4.red, 0.10) && close(l4.none, 0.55));
});

test('probabilidades por nivel: transición gradual (lineal) y siempre suman 1', () => {
  const o = [0, 1, 2, 3].map(l => oddsForLevel(l, NL));
  const r = x => Math.round(x * 10000) / 10000;
  assert.deepEqual(o.map(x => r(x.double)), [0.25, 0.2333, 0.2167, 0.2]);
  assert.deepEqual(o.map(x => r(x.yellow)), [0.25, 0.2167, 0.1833, 0.15]);
  assert.deepEqual(o.map(x => r(x.red)), [0.25, 0.2, 0.15, 0.1]);
  assert.deepEqual(o.map(x => r(x.none)), [0.25, 0.35, 0.45, 0.55]);
  for (const x of o) assert.ok(close(x.double + x.yellow + x.red + x.none, 1));
  for (let i = 1; i < 4; i++) {
    assert.ok(o[i].double < o[i - 1].double && o[i].yellow < o[i - 1].yellow && o[i].red < o[i - 1].red);
    assert.ok(o[i].none > o[i - 1].none);
  }
});

test('resultado del giro: umbrales exactos en el nivel 1 (25 / 25 / 25 / 25)', () => {
  const o = oddsForLevel(0, NL);
  assert.equal(rollOutcome(() => 0.249, o), 'double');
  assert.equal(rollOutcome(() => 0.25, o), 'yellow');
  assert.equal(rollOutcome(() => 0.499, o), 'yellow');
  assert.equal(rollOutcome(() => 0.50, o), 'red');
  assert.equal(rollOutcome(() => 0.749, o), 'red');
  assert.equal(rollOutcome(() => 0.75, o), 'none');
});

test('resultado del giro: umbrales exactos en el último nivel (20 / 15 / 10 / 55)', () => {
  const o = oddsForLevel(NL - 1, NL);
  assert.equal(rollOutcome(() => 0.199, o), 'double');
  assert.equal(rollOutcome(() => 0.20, o), 'yellow');
  assert.equal(rollOutcome(() => 0.349, o), 'yellow');
  assert.equal(rollOutcome(() => 0.35, o), 'red');
  assert.equal(rollOutcome(() => 0.449, o), 'red');
  assert.equal(rollOutcome(() => 0.45, o), 'none');
});

test('resultado del giro: estadística real en cada nivel', () => {
  for (let l = 0; l < NL; l++) {
    const odds = oddsForLevel(l, NL), c = { double: 0, yellow: 0, red: 0, none: 0 }; const N = 300000;
    for (let i = 0; i < N; i++) c[rollOutcome(Math.random, odds)]++;
    for (const k in c) assert.ok(Math.abs(c[k] / N - odds[k]) < 0.006, `nivel ${l + 1} ${k}: ${c[k] / N} vs ${odds[k]}`);
  }
});

test('reelsFor: cada resultado produce exactamente esa combinación', () => {
  assert.deepEqual(reelsFor('double'), [1, 1, 1]);
  assert.deepEqual(reelsFor('yellow'), [2, 2, 2]);
  assert.deepEqual(reelsFor('red'), [4, 4, 4]);
  const seen = new Set();
  for (let i = 0; i < 3000; i++) {
    const r = reelsFor('none');
    assert.equal(r.length, 3);
    assert.ok(r.every(v => SYMBOLS.includes(v)));
    assert.equal(evaluateReels(r).type, 'none'); // nunca es un triple
    seen.add(r.join(''));
  }
  assert.equal(seen.size, 24); // las 24 combinaciones no ganadoras
  for (const t of ['double', 'yellow', 'red', 'none']) assert.equal(evaluateReels(reelsFor(t)).type, t);
});

test('premios: tres soles, barcos, marineros; cualquier otra cosa no da nada', () => {
  assert.deepEqual(evaluateReels([1, 1, 1]), { type: 'double' });
  assert.deepEqual(evaluateReels([2, 2, 2]), { type: 'yellow' });
  assert.deepEqual(evaluateReels([4, 4, 4]), { type: 'red' });
  for (const a of SYMBOLS) for (const b of SYMBOLS) for (const c of SYMBOLS) {
    if (a === b && b === c) continue;
    assert.deepEqual(evaluateReels([a, b, c]), { type: 'none' }, `${a}${b}${c}`);
  }
});

test('rodillo: orden de símbolos y posiciones enteras', () => {
  assert.deepEqual(ORDER, [1, 2, 4]);
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6].map(symbolAt), [1, 2, 4, 1, 2, 4, 1]);
  assert.equal(symbolAt(-1), 4);
});

test('frenado: siempre se clava en una celda entera, 0,5 a 1,5 celdas adelante', () => {
  for (let i = 0; i < 2000; i++) {
    const pos = Math.random() * 300, speed = 4 + Math.random() * 4;
    const { target, dist, duration } = planStop(pos, speed);
    assert.ok(Number.isInteger(target));
    assert.ok(dist >= 0.5 - 1e-9 && dist < 1.5 + 1e-9, `${dist}`);
    assert.ok(Math.abs(duration - 2 * dist / speed) < 1e-12);
  }
});

test('control: apretar en momentos distintos da símbolos distintos y predecibles', () => {
  // pos 0,1 -> aterriza en la celda 1 (barco); pos 0,6 -> celda 2 (marinero); pos 1,6 -> celda 3 (sol)
  assert.equal(symbolAt(planStop(0.1, 5).target), 2);
  assert.equal(symbolAt(planStop(0.6, 5).target), 4);
  assert.equal(symbolAt(planStop(1.6, 5).target), 1);
  // cubre los tres símbolos al variar el momento de pulsación
  const seen = new Set();
  for (let p = 0; p < 3; p += 0.05) seen.add(symbolAt(planStop(p, 5).target));
  assert.equal(seen.size, 3);
});

test('modo debug: forzar un símbolo siempre aterriza en él, con frenado razonable', () => {
  for (const forced of SYMBOLS) for (let i = 0; i < 1000; i++) {
    const pos = Math.random() * 100;
    const { target, dist } = planStop(pos, 5, forced);
    assert.equal(symbolAt(target), forced);
    assert.ok(dist >= 0.5 - 1e-9 && dist < 3.5 + 1e-9, `${dist}`);
  }
});

test('frenado físico: continuo en la velocidad inicial y termina exacto', () => {
  const p0 = 7.3, v0 = 5, { target, duration } = planStop(p0, v0);
  assert.ok(Math.abs(brakePos(p0, v0, duration, 0) - p0) < 1e-12);
  assert.ok(Math.abs(brakePos(p0, v0, duration, duration) - target) < 1e-9);
  assert.ok(Math.abs(brakePos(p0, v0, duration, duration + 5) - target) < 1e-9); // se queda clavado
  const eps = 1e-6, vel0 = (brakePos(p0, v0, duration, eps) - p0) / eps;
  assert.ok(Math.abs(vel0 - v0) < 1e-3); // misma velocidad al arrancar el frenado
  let last = p0; for (let t = 0; t <= duration; t += duration / 50) { const p = brakePos(p0, v0, duration, t); assert.ok(p >= last - 1e-12); last = p; }
});

test('debug: con forced uniforme, cada figura sale ~1/3 y siempre triple', () => {
  const c = { 1: 0, 2: 0, 4: 0 }; const N = 90000;
  for (let i = 0; i < N; i++) {
    const forced = SYMBOLS[Math.floor(Math.random() * 3)];
    const reels = [0, 1, 2].map(() => symbolAt(planStop(Math.random() * 50, 5 + Math.random() * 2, forced).target));
    assert.notEqual(evaluateReels(reels).type, 'none');
    c[reels[0]]++;
  }
  for (const k of [1, 2, 4]) assert.ok(Math.abs(c[k] / N - 1 / 3) < 0.01, `${k} ${c[k] / N}`);
});

const lvl = (n) => { const g = createGame(); for (let l = 0; l < n; l++) { for (let i = 0; i < 7; i++) g.submit(true, 1); g.nextLevel(); } return g; };

test('tarjetas: se acumulan hasta 3 y no más', () => {
  const g = createGame();
  assert.deepEqual(g.state().cards, { yellow: 0, red: 0 });
  assert.equal(g.addCard('yellow'), true); assert.equal(g.addCard('yellow'), true); assert.equal(g.addCard('yellow'), true);
  assert.equal(g.addCard('yellow'), false);
  assert.equal(g.state().cards.yellow, 3);
  assert.equal(g.addCard('red'), true);
  assert.deepEqual(g.state().cards, { yellow: 3, red: 1 });
  assert.equal(g.addCard('azul'), false);
});

test('amarilla: convierte barco/marinero en sol y gasta una tarjeta; no sirve sobre un sol', () => {
  const g = createGame(), g2 = lvl(1);
  g.addCard('yellow'); g.addCard('yellow');
  const before = g.state().pattern;
  const iNon = before.findIndex(v => v !== 1), iSol = before.findIndex(v => v === 1);
  if (iSol >= 0) assert.equal(g.useYellow(iSol), false);
  assert.equal(g.state().cards.yellow, 2);
  if (iNon >= 0) {
    assert.equal(g.useYellow(iNon), true);
    assert.equal(g.state().pattern[iNon], 1);
    assert.equal(g.state().cards.yellow, 1);
  }
  assert.equal(g.useYellow(99), false);
  assert.equal(g2.useYellow(0), false); // sin tarjetas
});

test('roja: elimina un pulso, cambia la grilla y respeta el mínimo', () => {
  const g = createGame(); g.addCard('red'); g.addCard('red'); g.addCard('red');
  const p0 = g.state().pattern;
  assert.equal(g.useRed(1), true);
  const p1 = g.state().pattern;
  assert.equal(p1.length, p0.length - 1);
  assert.deepEqual(p1, p0.filter((_, i) => i !== 1));
  assert.ok(patternToGrid(p1).length >= 2);
  assert.equal(g.useRed(0), true);
  assert.equal(g.state().pattern.length, 2);
  assert.equal(g.useRed(0), false);
  assert.equal(g.state().cards.red, 1);
});

test('el patrón modificado persiste si fallás; el siguiente ejercicio es nuevo', () => {
  const g = createGame(); g.addCard('red');
  g.useRed(0);
  const mod = g.state().pattern;
  g.submit(false); g.submit(false);
  assert.deepEqual(g.state().pattern, mod);
  g.submit(true, 5);
  assert.equal(g.state().pattern.length, 4);
});

test('las tarjetas persisten entre ejercicios y niveles; restart las borra', () => {
  const g = createGame(); g.addCard('yellow'); g.addCard('red');
  for (let i = 0; i < 7; i++) g.submit(true, 1);
  g.nextLevel();
  assert.deepEqual(g.state().cards, { yellow: 1, red: 1 });
  g.restart();
  assert.deepEqual(g.state().cards, { yellow: 0, red: 0 });
});

test('nivel 4: roja + crecimiento por error conviven', () => {
  const g = lvl(3); g.addCard('red');
  g.submit(false); g.submit(false);
  assert.equal(g.state().pattern.length, 10);
  g.useRed(3);
  assert.equal(g.state().pattern.length, 9);
});

// Simula el lazo del juego (60 fps): un toque, tres rodillos con velocidades y posiciones arbitrarias
function simulateStop(pos, speeds, targets) {
  const dtMs = 1000 / 60; let now = 0; const pressedAt = 0;
  const st = [0, 1, 2].map(() => ({ state: 'spin', brake: null, landAt: null, land: null }));
  const p = pos.slice();
  while (st.some(s => s.land === null) && now < 20000) {
    for (let k = 0; k < 3; k++) {
      const s = st[k];
      if (s.state === 'spin') {
        p[k] += speeds[k] * dtMs / 1000;
        const plan = nextBrake({ now, pressedAt, k, pos: p[k], speed: speeds[k], target: targets[k], prevLandAt: k ? st[k - 1].landAt : null });
        if (plan) { s.state = 'brake'; s.brake = { t0: now, p0: p[k], v0: speeds[k], T: plan.target, dur: plan.duration }; s.landAt = plan.landAt; }
      } else if (s.state === 'brake') {
        const t = (now - s.brake.t0) / 1000;
        if (t >= s.brake.dur) { s.state = 'done'; s.land = now; p[k] = s.brake.T; }
      }
    }
    now += dtMs;
  }
  return { land: st.map(s => s.land), final: p.map(symbolAt) };
}

test('un toque: los 3 rodillos aterrizan en orden, separados, y en su símbolo objetivo', () => {
  for (let i = 0; i < 400; i++) {
    const pos = [0, 1, 2].map(() => Math.random() * 40);
    const speeds = [5.0, 5.8, 6.6];
    const targets = [0, 1, 2].map(() => SYMBOLS[Math.floor(Math.random() * 3)]);
    const r = simulateStop(pos, speeds, targets);
    assert.ok(r.land.every(v => v !== null), 'todos aterrizan');
    assert.deepEqual(r.final, targets);
    assert.ok(r.land[1] - r.land[0] >= 300, `gap 0-1: ${r.land[1] - r.land[0]}`);
    assert.ok(r.land[2] - r.land[1] >= 300, `gap 1-2: ${r.land[2] - r.land[1]}`);
    assert.ok(r.land[2] < 4500, `termina en tiempo razonable: ${r.land[2]}`);
  }
});

test('nextBrake: el primero frena enseguida; los otros esperan su turno', () => {
  assert.ok(nextBrake({ now: 0, pressedAt: 0, k: 0, pos: 3.3, speed: 5, target: 2, prevLandAt: null }));
  assert.equal(nextBrake({ now: 100, pressedAt: 0, k: 1, pos: 3.3, speed: 5, target: 2, prevLandAt: 800 }), null); // aún no es su turno
  assert.equal(nextBrake({ now: 1000, pressedAt: 0, k: 1, pos: 3.3, speed: 5, target: 2, prevLandAt: null }), null); // el anterior no frenó
});
