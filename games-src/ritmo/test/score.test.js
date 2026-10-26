import test from 'node:test';
import assert from 'node:assert/strict';
import { scoreAttempt } from '../src/score.js';
import { evaluateAttempt } from '../src/engine.js';

const pat = [1, 1, 1, 1];
test('perfecto = 10', () => assert.equal(scoreAttempt(evaluateAttempt(pat, [0, 500, 1000, 1500])), 10));
test('fallo = 0', () => assert.equal(scoreAttempt(evaluateAttempt(pat, [0, 500, 1000])), 0));
test('en el límite de tolerancia = 4 (mínimo al pasar)', () => {
  // gaps 700/300 con tolerancia 200: error 200 = tol
  assert.equal(scoreAttempt(evaluateAttempt(pat, [0, 500, 1200, 1500])), 4);
});
test('más preciso => más puntos', () => {
  const a = scoreAttempt(evaluateAttempt(pat, [0, 500, 1030, 1500]));
  const b = scoreAttempt(evaluateAttempt(pat, [0, 500, 1100, 1500]));
  const c = scoreAttempt(evaluateAttempt(pat, [0, 500, 1010, 1505]));
  assert.ok(c > a && a > b, `${c} ${a} ${b}`);
  assert.ok([a, b, c].every(p => p >= 4 && p <= 10));
});

test('el puntaje usa la tolerancia de referencia: pasar es fácil, los 10 puntos siguen costando', () => {
  // gaps 500 -> 700, 700 (error 200 en ambos): pasa con la tolerancia nueva (275) pero para el puntaje es el límite
  const lenient = evaluateAttempt(pat, [0, 500, 1200, 1900]);
  assert.equal(lenient.ok, true);
  assert.equal(scoreAttempt(lenient), 4);
  // un solo golpe flojo: puntaje intermedio
  const mid = scoreAttempt(evaluateAttempt(pat, [0, 500, 1150, 1650]));
  assert.ok(mid > 4 && mid < 10, `${mid}`);
  assert.equal(scoreAttempt(evaluateAttempt(pat, [0, 500, 1000, 1500])), 10);
});
