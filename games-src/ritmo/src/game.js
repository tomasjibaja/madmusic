// Captura de pulsaciones + cierre del ejercicio. Sin DOM: solo recibe hits.
import { evaluateAttempt, estimateBeatDuration, patternToGrid } from './engine.js';
import { FIRST_HIT_TIMEOUT_MS, INCOMPLETE_WAIT_MIN_MS, INCOMPLETE_WAIT_BEATS,
         EXTRA_WAIT_MIN_MS, EXTRA_WAIT_MAX_MS } from './config.js';

/** Cuánto esperar tras el último golpe antes de cerrar. Nunca cierra a mitad de un ejercicio normal. */
export function getCloseDelay(pattern, hits) {
  if (hits.length < 2) return FIRST_HIT_TIMEOUT_MS;
  const beat = estimateBeatDuration(pattern, hits[0], hits[1]);
  const total = patternToGrid(pattern).length;
  if (hits.length < total) return Math.max(INCOMPLETE_WAIT_MIN_MS, beat * INCOMPLETE_WAIT_BEATS);
  return Math.min(EXTRA_WAIT_MAX_MS, Math.max(EXTRA_WAIT_MIN_MS, beat)); // ventana para golpes de más
}

export function createRecorder(pattern, onFinish) {
  const hits = [];
  let timer = null, done = false;
  function finish() {
    done = true;
    onFinish(evaluateAttempt(pattern, hits.slice()), hits.slice());
  }
  return {
    hit(t = performance.now()) {
      if (done) return;
      hits.push(t);
      clearTimeout(timer);
      timer = setTimeout(finish, getCloseDelay(pattern, hits));
    },
    count: () => hits.length,
    cancel() { done = true; clearTimeout(timer); },
  };
}
