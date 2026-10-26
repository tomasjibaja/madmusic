import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, LEVELS } from '../src/levels.js';

const clear = (g, n = 7) => { for (let i = 0; i < n; i++) g.submit(true, 5); };
const goToLevel = (g, lvl) => { for (let l = 0; l < lvl; l++) { clear(g); g.nextLevel(); } };

test('configuración de los 4 niveles', () => {
  assert.equal(LEVELS.length, 4);
  assert.deepEqual(LEVELS.map(l => l.beats), [4, 4, 8, 8]);
  assert.deepEqual(LEVELS.map(l => l.exercises), [7, 7, 7, 7]);
  assert.deepEqual(LEVELS[0].allowed, [1, 2]);
  assert.deepEqual(LEVELS[1].allowed, [1, 2, 4]);
  assert.ok(LEVELS[3].growOnError && LEVELS[3].maxBeats === 12);
});

test('nivel 1 nunca usa marinero; nivel 2 sí puede', () => {
  const g1 = createGame();
  for (let i = 0; i < 200; i++) { assert.ok(g1.state().pattern.every(n => n === 1 || n === 2)); g1.submit(true); if (g1.state().status !== 'playing') g1.restart(); }
  const g2 = createGame(); goToLevel(g2, 1);
  let seen4 = false;
  for (let i = 0; i < 200; i++) { if (g2.state().pattern.includes(4)) seen4 = true; g2.submit(true); if (g2.state().status !== 'playing') { g2.restart(); goToLevel(g2, 1); } }
  assert.ok(seen4);
});

test('longitudes: 4, 4, 8, 8', () => {
  const g = createGame(); const lens = [];
  for (let l = 0; l < 4; l++) { lens.push(g.state().pattern.length); clear(g); g.nextLevel(); }
  assert.deepEqual(lens, [4, 4, 8, 8]);
});

test('fallar en niveles 1-3 mantiene exactamente el mismo ejercicio', () => {
  for (const lvl of [0, 1, 2]) {
    const g = createGame(); goToLevel(g, lvl);
    const before = g.state();
    for (let i = 0; i < 6; i++) assert.equal(g.submit(false), false);
    assert.deepEqual(g.state().pattern, before.pattern);
    assert.equal(g.state().index, 0);
  }
});

test('nivel 4: cada error suma un pulso, conserva el ejercicio, tope en 12', () => {
  const g = createGame(); goToLevel(g, 3);
  const base = g.state().pattern;
  assert.equal(base.length, 8);
  for (let n = 9; n <= 12; n++) {
    assert.equal(g.submit(false), true);
    const p = g.state().pattern;
    assert.equal(p.length, n);
    assert.deepEqual(p.slice(0, 8), base);
    assert.ok(p.every(x => [1, 2, 4].includes(x)));
  }
  assert.equal(g.submit(false), false);
  assert.equal(g.state().pattern.length, 12);
});

test('nivel 4: tras acertar, el siguiente ejercicio vuelve a 8 pulsos', () => {
  const g = createGame(); goToLevel(g, 3);
  g.submit(false); g.submit(false);
  assert.equal(g.state().pattern.length, 10);
  g.submit(true, 8);
  assert.equal(g.state().pattern.length, 8);
  assert.equal(g.state().index, 1);
});

test('acertar avanza; 7 aciertos completan el nivel; nextLevel continúa', () => {
  const g = createGame();
  clear(g, 6); assert.equal(g.state().status, 'playing');
  g.submit(true, 5);
  assert.equal(g.state().status, 'levelComplete');
  g.submit(true); assert.equal(g.state().index, 7);
  g.nextLevel();
  assert.equal(g.state().level, 1); assert.equal(g.state().index, 0);
});

test('completar el nivel 4 termina el juego; restart vuelve al inicio', () => {
  const g = createGame(); goToLevel(g, 3); clear(g);
  assert.equal(g.state().status, 'finished');
  g.nextLevel(); assert.equal(g.state().status, 'finished');
  g.restart();
  assert.equal(g.state().level, 0); assert.equal(g.state().status, 'playing'); assert.equal(g.state().score, 0);
});

test('puntaje: suma por nivel y total; los fallos no suman', () => {
  const g = createGame();
  g.submit(false, 10); g.submit(true, 8); g.submit(true, 10);
  assert.equal(g.state().score, 18);
  for (let i = 0; i < 5; i++) g.submit(true, 5);
  assert.equal(g.state().levelScore, 43);
  g.nextLevel();
  assert.equal(g.state().levelScore, 0);
  assert.equal(g.state().score, 43);
});


import { test as _t } from 'node:test';
_t('resume arranca en el nivel pedido con el puntaje cargado', () => {
  const g = createGame(); g.resume(2, 100);
  const s = g.state();
  assert.equal(s.level, 2); assert.equal(s.index, 0); assert.equal(s.status, 'playing'); assert.equal(s.score, 100); assert.equal(s.levelScore, 0);
});
