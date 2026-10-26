// Física de los rodillos del jackpot (sin DOM).
// `pos` es la posición en "celdas": cuando es un entero i, en la ventana se ve el símbolo ORDER[i mod 3].
import { SYMBOLS } from './jackpot.js';
import { STOP_GAP_MS, LAND_GAP_MS } from './config.js';

export const ORDER = SYMBOLS; // [SOL, BARCO, MARINERO], en el orden en que desfilan

/** Símbolo que se ve en la ventana cuando el rodillo está clavado en `pos` (entero). */
export function symbolAt(pos) {
  const n = ORDER.length;
  return ORDER[((Math.round(pos) % n) + n) % n];
}

/**
 * Plan de frenado al apretar DETENER: el rodillo desacelera de forma constante hasta clavarse
 * en la próxima celda que está al menos 0,5 celda adelante (el símbolo que "viene entrando").
 * Si `forced` (el símbolo objetivo sorteado) no es null, sigue de largo hasta la primera celda con ese símbolo.
 */
export function planStop(pos, speed, forced = null) {
  let target = Math.ceil(pos + 0.5);
  if (forced !== null) {
    let guard = 0;
    while (symbolAt(target) !== forced && guard++ < ORDER.length) target++;
  }
  const dist = target - pos;
  return { target, dist, duration: (2 * dist) / speed }; // duración en segundos
}

/** Posición durante el frenado (desaceleración constante, llega a `target` con velocidad 0). */
export function brakePos(p0, v0, duration, t) {
  const k = Math.min(Math.max(t, 0), duration);
  return p0 + v0 * k - (v0 / (2 * duration)) * k * k;
}

/**
 * Un toque en DETENER frena los tres rodillos EN ORDEN. Devuelve el plan de frenado del rodillo `k`
 * si ya le toca empezar a frenar (null si todavía no): espera su turno (k * STOP_GAP_MS desde el toque)
 * y, si frenar ahora lo haría aterrizar antes de lo debido, espera a un momento mejor mientras sigue girando.
 */
export function nextBrake({ now, pressedAt, k, pos, speed, target, prevLandAt }, gap = STOP_GAP_MS, landGap = LAND_GAP_MS) {
  if (now - pressedAt < k * gap) return null;
  if (k > 0 && prevLandAt == null) return null;
  const plan = planStop(pos, speed, target);
  const landAt = now + plan.duration * 1000;
  if (k > 0 && landAt < prevLandAt + landGap) return null;
  return { ...plan, landAt };
}
