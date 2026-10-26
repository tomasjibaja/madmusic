import { TOLERANCE_RATIO, MIN_TOLERANCE_MS, UNITS_PER_BEAT, ALLOWED_SUBDIVISIONS } from './config.js';

/** Genera un patrón aleatorio válido, p.ej. [1,2,1,4]. `rng` inyectable para tests. */
export function generateExercise(length, rng = Math.random, allowed = ALLOWED_SUBDIVISIONS) {
  return Array.from({ length }, () => allowed[Math.floor(rng() * allowed.length)]);
}

/** Patrón -> posiciones de golpe en unidades de 1/4 de pulso. */
export function patternToGrid(pattern) {
  const grid = [];
  pattern.forEach((hits, beat) => {
    if (!ALLOWED_SUBDIVISIONS.includes(hits)) throw new Error(`Subdivisión inválida: ${hits}`);
    const step = UNITS_PER_BEAT / hits;
    for (let i = 0; i < hits; i++) grid.push(beat * UNITS_PER_BEAT + i * step);
  });
  return grid;
}

/** beatDuration = realInterval * (4 / gridDistance), sin casos especiales. */
export function estimateBeatDuration(pattern, firstHitTime, secondHitTime) {
  const grid = patternToGrid(pattern);
  if (grid.length < 2) throw new Error('El patrón necesita al menos 2 golpes');
  const realInterval = secondHitTime - firstHitTime;
  if (!(realInterval > 0)) throw new Error('La segunda pulsación debe ser posterior a la primera');
  const gridDistance = grid[1] - grid[0];
  return realInterval * (UNITS_PER_BEAT / gridDistance);
}

/** Tiempos absolutos esperados (ms) con la 1ª pulsación como origen. (Referencia/diagnóstico) */
export function getExpectedHits(pattern, firstHitTime, beatDuration) {
  const unit = beatDuration / UNITS_PER_BEAT;
  return patternToGrid(pattern).map(p => firstHitTime + p * unit);
}

/** Duración esperada (ms) entre cada golpe y su antecesor. Longitud = golpes - 1. */
export function getExpectedIntervals(pattern, beatDuration) {
  const grid = patternToGrid(pattern);
  const unit = beatDuration / UNITS_PER_BEAT;
  return grid.slice(1).map((p, i) => (p - grid[i]) * unit);
}

/** Tolerancia (ms) para un intervalo esperado: proporcional, con piso mínimo. */
export function getTolerance(expectedGap, ratio = TOLERANCE_RATIO, minMs = MIN_TOLERANCE_MS) {
  return Math.max(minMs, expectedGap * ratio);
}

/**
 * Cada golpe se mide contra el golpe REAL anterior (los errores no se acumulan).
 * El 2º golpe define el tempo, así que su intervalo coincide por construcción.
 * Devuelve { ok, reason: 'ok'|'missing'|'extra'|'timing', gaps:[{expected,actual,error,tol,ok}], details }.
 */
export function evaluatePerformance(expectedGaps, actualHits, ratio = TOLERANCE_RATIO, minMs = MIN_TOLERANCE_MS) {
  const expectedCount = expectedGaps.length + 1;
  const gaps = expectedGaps.map((expected, i) => {
    if (i + 1 >= actualHits.length) return null;
    const actual = actualHits[i + 1] - actualHits[i];
    const tol = getTolerance(expected, ratio, minMs);
    const error = actual - expected;
    return { expected, actual, error, tol, ok: Math.abs(error) <= tol };
  });
  const badIdx = gaps.map((g, i) => g && !g.ok ? i + 1 : -1).filter(i => i >= 0);
  const missing = Math.max(0, expectedCount - actualHits.length);
  const extra = Math.max(0, actualHits.length - expectedCount);
  let reason = 'ok';
  if (missing) reason = 'missing';
  else if (extra) reason = 'extra';
  else if (badIdx.length) reason = 'timing';
  return { ok: reason === 'ok', reason, gaps, details: { missing, extra, badIdx } };
}

/** Atajo: evalúa una ejecución completa a partir de los timestamps crudos. */
export function evaluateAttempt(pattern, actualHits, ratio = TOLERANCE_RATIO, minMs = MIN_TOLERANCE_MS) {
  if (actualHits.length < 2) {
    return { ok: false, reason: 'missing', gaps: [], details: { missing: patternToGrid(pattern).length - actualHits.length, extra: 0, badIdx: [] } };
  }
  if (!(actualHits[1] > actualHits[0])) { // toques simultáneos o desordenados: no hay tempo que estimar
    return { ok: false, reason: 'timing', gaps: [], details: { missing: 0, extra: 0, badIdx: [1] } };
  }
  const beat = estimateBeatDuration(pattern, actualHits[0], actualHits[1]);
  const result = evaluatePerformance(getExpectedIntervals(pattern, beat), actualHits, ratio, minMs);
  return { ...result, beatDuration: beat };
}
