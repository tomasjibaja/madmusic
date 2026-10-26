// Lógica pura del jackpot (sin DOM). 1 = SOL, 2 = BARCO, 4 = MARINERO.
import { JACKPOT_CHANCE, ODDS_START, ODDS_FINAL } from './config.js';

export const SYMBOLS = [1, 2, 4];

/** ¿Sale el jackpot tras este ejercicio? */
export function rollsJackpot(rng = Math.random, chance = JACKPOT_CHANCE) {
  return rng() < chance;
}

/**
 * Probabilidades del giro para un nivel (0 = primero): arrancan en ODDS_START y van
 * hacia ODDS_FINAL de forma lineal. Devuelve { double, yellow, red, none } (suman 1).
 */
export function oddsForLevel(level, totalLevels) {
  const t = totalLevels > 1 ? Math.min(1, Math.max(0, level / (totalLevels - 1))) : 1;
  const mix = k => ODDS_START[k] + (ODDS_FINAL[k] - ODDS_START[k]) * t;
  const odds = { double: mix('double'), yellow: mix('yellow'), red: mix('red') };
  odds.none = 1 - odds.double - odds.yellow - odds.red;
  return odds;
}

/** Sortea el resultado del giro: 'double' | 'yellow' | 'red' | 'none'. */
export function rollOutcome(rng = Math.random, odds = oddsForLevel(1, 1)) {
  const u = rng();
  let acc = odds.double;
  if (u < acc) return 'double';
  acc += odds.yellow;
  if (u < acc) return 'yellow';
  acc += odds.red;
  if (u < acc) return 'red';
  return 'none';
}

/** Símbolos en que deben detenerse los tres rodillos para mostrar ese resultado. */
export function reelsFor(type, rng = Math.random) {
  const triple = { double: 1, yellow: 2, red: 4 }[type];
  if (triple) return [triple, triple, triple];
  const nonTriples = [];
  for (const a of SYMBOLS) for (const b of SYMBOLS) for (const c of SYMBOLS) if (!(a === b && b === c)) nonTriples.push([a, b, c]);
  return nonTriples[Math.floor(rng() * nonTriples.length)];
}

/** Tres soles: puntos x2 · tres barcos: tarjeta amarilla · tres marineros: tarjeta roja · otra cosa: nada. */
export function evaluateReels(reels) {
  const [a, b, c] = reels;
  if (a !== b || b !== c) return { type: 'none' };
  return { 1: { type: 'double' }, 2: { type: 'yellow' }, 4: { type: 'red' } }[a];
}
