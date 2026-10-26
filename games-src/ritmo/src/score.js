import { SCORE_MIN_PASS, SCORE_MAX, SCORE_REF_RATIO, SCORE_REF_MIN_MS } from './config.js';

/**
 * Puntos de un intento: 0 si falló; si acertó, entre SCORE_MIN_PASS y SCORE_MAX
 * según qué tan cerca estuvo cada golpe de su tiempo esperado (error / tolerancia de referencia).
 * El 1er intervalo se excluye: define el tempo, su error es 0 por construcción.
 */
export function scoreAttempt(result) {
  if (!result.ok) return 0;
  const gaps = result.gaps.slice(1).filter(Boolean);
  // La precisión se mide contra una tolerancia de referencia (más exigente que la de acierto)
  const refTol = g => Math.max(SCORE_REF_MIN_MS, g.expected * SCORE_REF_RATIO);
  const meanErr = gaps.length
    ? gaps.reduce((sum, g) => sum + Math.min(1, Math.abs(g.error) / refTol(g)), 0) / gaps.length
    : 0;
  return SCORE_MIN_PASS + Math.round((SCORE_MAX - SCORE_MIN_PASS) * (1 - meanErr));
}
