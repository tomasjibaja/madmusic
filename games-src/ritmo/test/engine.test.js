import test from 'node:test';
import assert from 'node:assert/strict';
import { generateExercise, patternToGrid, estimateBeatDuration, getExpectedHits,
         getExpectedIntervals, evaluatePerformance, evaluateAttempt, getTolerance } from '../src/engine.js';
import { getCloseDelay } from '../src/game.js';

const SOL = 1, BARCO = 2, MARI = 4;

test('grilla básica', () => {
  assert.deepEqual(patternToGrid([SOL]), [0]);
  assert.deepEqual(patternToGrid([BARCO]), [0, 2]);
  assert.deepEqual(patternToGrid([MARI]), [0, 1, 2, 3]);
  assert.deepEqual(patternToGrid([SOL, BARCO, SOL, MARI]), [0, 4, 6, 8, 12, 13, 14, 15]);
});

const cases = [
  ['MARINERO (1/4)',        [MARI, SOL],        125, 500],
  ['BARCO (1/2)',           [BARCO, SOL],       250, 500],
  ['SOL->SOL (1 pulso)',    [SOL, SOL],         500, 500],
  ['SOL->BARCO',            [SOL, BARCO],       500, 500],
  ['BARCO->SOL',            [BARCO, SOL],       250, 500],
  ['MARINERO->SOL',         [MARI, SOL],        125, 500],
  ['SOL->MARINERO',         [SOL, MARI, SOL],   500, 500],
  ['SOL->BARCO->MARI',      [SOL, BARCO, MARI], 600, 600],
];
for (const [name, pat, interval, beat] of cases) {
  test(`tempo: ${name}`, () => {
    assert.equal(estimateBeatDuration(pat, 1000, 1000 + interval), beat);
  });
}

test('tempo con otro BPM (lento y rápido)', () => {
  assert.equal(estimateBeatDuration([MARI, SOL], 0, 200), 800);
  assert.equal(estimateBeatDuration([SOL, SOL], 0, 300), 300);
});

test('tiempos absolutos esperados (referencia)', () => {
  assert.deepEqual(getExpectedHits([SOL, BARCO, SOL, MARI], 0, 500), [0, 500, 750, 1000, 1500, 1625, 1750, 1875]);
});

test('intervalos esperados entre golpes consecutivos', () => {
  assert.deepEqual(getExpectedIntervals([SOL, BARCO, SOL, MARI], 500), [500, 250, 250, 500, 125, 125, 125]);
  assert.deepEqual(getExpectedIntervals([SOL, SOL, BARCO, SOL], 1000), [1000, 1000, 500, 500]);
});

test('ejemplo del usuario: SOL SOL BARCO SOL a 60 BPM', () => {
  const pat = [SOL, SOL, BARCO, SOL];
  assert.ok(evaluateAttempt(pat, [0, 1000, 2000, 2500, 3000]).ok);
  // segundo golpe algo apurado (1100): el tempo estimado se corre, pero el resto sigue pasando
  assert.ok(evaluateAttempt(pat, [0, 1100, 2000, 2500, 3000]).ok);
  // 2º golpe a 900 y el resto a 1000/500/500 reales
  assert.ok(evaluateAttempt(pat, [0, 900, 1900, 2400, 2900]).ok);
});

test('no se acumula deriva: tempo levemente lento y constante pasa', () => {
  assert.ok(evaluateAttempt([SOL, SOL, SOL, SOL], [0, 500, 1060, 1620]).ok);
  assert.ok(evaluateAttempt([SOL, SOL, SOL, SOL, SOL, SOL, SOL, SOL], [0, 500, 1070, 1640, 2210, 2780, 3350, 3920]).ok);
});

test('ejecución perfecta y con jitter pasa', () => {
  const pat = [SOL, BARCO, SOL, MARI];
  const perfect = getExpectedHits(pat, 1000, 500);
  assert.ok(evaluateAttempt(pat, perfect).ok);
  const jitter = perfect.map((t, i) => i < 2 ? t : t + (i % 2 ? 20 : -20));
  assert.ok(evaluateAttempt(pat, jitter).ok);
});

test('SOL×4: 4 golpes con una espera larga falla', () => {
  const r = evaluateAttempt([SOL, SOL, SOL, SOL], [0, 500, 1500, 2000]);
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'timing');
});

test('faltantes, extra y timing', () => {
  const pat = [SOL, SOL, SOL, SOL];
  assert.equal(evaluateAttempt(pat, [0, 500, 1000]).reason, 'missing');
  assert.equal(evaluateAttempt(pat, [0, 500, 1000, 1500, 2000]).reason, 'extra');
  assert.equal(evaluateAttempt(pat, [0, 500, 1000, 2000]).reason, 'timing');
  assert.equal(evaluateAttempt(pat, [0]).reason, 'missing');
});

test('golpe de más en medio falla', () => {
  assert.equal(evaluateAttempt([SOL, SOL, SOL, SOL], [0, 500, 750, 1000, 1500]).ok, false);
});

test('tolerancia proporcional al intervalo (65%) con piso de 130 ms', () => {
  assert.equal(getTolerance(500), 325);
  assert.equal(getTolerance(1000), 650);
  assert.equal(getTolerance(50), 130);
  const pat = [SOL, SOL, SOL, SOL];
  assert.ok(evaluateAttempt(pat, [0, 500, 1150, 1500]).ok);          // gaps 650/350: ±150 < 325
  assert.ok(evaluateAttempt(pat, [0, 500, 1300, 1500]).ok);          // ±300 < 325
  assert.equal(evaluateAttempt(pat, [0, 500, 1400, 1500]).ok, false); // ±400 > 325
});

test('ratio y piso configurables', () => {
  assert.ok(evaluatePerformance([500], [0, 580], 0.2, 40).ok);          // tol 100, error 80
  assert.equal(evaluatePerformance([500], [0, 580], 0.1, 40).reason, 'timing'); // tol 50
  assert.ok(evaluatePerformance([100], [0, 190]).ok);                   // por defecto: piso 130 ms
  assert.equal(evaluatePerformance([100], [0, 260]).reason, 'timing'); // error 160 > 130
});

test('toques simultáneos/desordenados no rompen: devuelven "mal"', () => {
  const r = evaluateAttempt([SOL, SOL, SOL, SOL], [100, 100, 600, 1100]);
  assert.equal(r.ok, false); assert.equal(r.reason, 'timing');
  assert.equal(evaluateAttempt([SOL, SOL, SOL, SOL], [200, 100, 600, 1100]).ok, false);
});

test('un jugador con ruido razonable pasa casi siempre; un golpe muy corrido no', () => {
  const gauss = () => { let u = 0; while (!u) u = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * Math.random()); };
  const play = (p, sigma) => { const g = patternToGrid(p), unit = 150; const h = g.map(x => 1000 + x * unit + gauss() * sigma); return h.sort((a, b) => a - b); };
  let ok = 0; const N = 2000;
  for (let i = 0; i < N; i++) { const p = generateExercise(4); if (evaluateAttempt(p, play(p, 15)).ok) ok++; }
  assert.ok(ok / N > 0.9, `jugador preciso pasa ${ok / N}`);
  let bad = 0;
  for (let i = 0; i < N; i++) { const p = generateExercise(8); const h = play(p, 5); const k = 1 + Math.floor(Math.random() * (h.length - 2)); h[k] += 0.5 * 600; if (h[k] <= h[k - 1]) h[k] = h[k - 1] + 5; if (evaluateAttempt(p, h).ok) bad++; }
  assert.ok(bad / N < 0.15, `golpe corrido medio pulso pasa ${bad / N}`);
});

test('cierre: nunca cierra a mitad de un ejercicio normal', () => {
  const pat = [SOL, SOL, BARCO, SOL];
  // 2 golpes de 5, 1100 ms entre golpes: espera >= 3000, no 1.5 pulsos
  assert.ok(getCloseDelay(pat, [0, 700]) >= 3000);
  // patrón completo: ventana corta para golpes de más
  const d = getCloseDelay(pat, [0, 1000, 2000, 2500, 3000]);
  assert.ok(d >= 600 && d <= 1500);
});

test('generador: longitud y valores válidos', () => {
  for (const len of [4, 8]) {
    const p = generateExercise(len);
    assert.equal(p.length, len);
    assert.ok(p.every(x => [1, 2, 4].includes(x)));
  }
  assert.deepEqual(generateExercise(3, () => 0), [1, 1, 1]);
  assert.deepEqual(generateExercise(3, () => 0.99), [4, 4, 4]);
});

test('entradas inválidas', () => {
  assert.throws(() => patternToGrid([3]));
  assert.throws(() => estimateBeatDuration([SOL, SOL], 500, 500));
  assert.throws(() => estimateBeatDuration([SOL], 0, 500));
});

test('generador con subdivisiones permitidas', () => {
  for (let i = 0; i < 300; i++) assert.ok(generateExercise(8, Math.random, [1, 2]).every(x => x === 1 || x === 2));
  assert.deepEqual(generateExercise(3, () => 0.99, [1, 2]), [2, 2, 2]);
});
