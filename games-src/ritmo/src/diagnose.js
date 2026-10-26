// Diagnóstico de un intento fallido (sin DOM): ¿qué figuras salieron mal y qué tendencia hubo?
import { patternToGrid } from './engine.js';
import { TREND_RUSH_RATIO, TREND_DRAG_RATIO, TREND_MIN_HITS } from './config.js';

/** Para cada golpe esperado, índice de la figura (pulso) a la que pertenece. [1,2,4] -> [0,1,1,2,2,2,2] */
export function pulseOfHits(pattern) {
  const out = [];
  pattern.forEach((n, p) => { for (let i = 0; i < n; i++) out.push(p); });
  return out;
}

const median = arr => { const s = [...arr].sort((p, q) => p - q), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

// Recta robusta (Theil-Sen: mediana de pendientes): tiempo = a + b * posición en la grilla.
// Es robusta a uno o dos golpes muy corridos, que con mínimos cuadrados arrastrarían la recta y harían
// parecer "mal" a golpes que estuvieron bien.
function fit(xs, ys) {
  const slopes = [];
  for (let i = 0; i < xs.length; i++) for (let j = i + 1; j < xs.length; j++) if (xs[j] !== xs[i]) slopes.push((ys[j] - ys[i]) / (xs[j] - xs[i]));
  const b = slopes.length ? median(slopes) : 0;
  return { a: median(ys.map((y, i) => y - b * xs[i])), b };
}
const residuals = (xs, ys) => { const { a, b } = fit(xs, ys); return ys.map((y, i) => y - (a + b * xs[i])); };
const rms = r => Math.sqrt(r.reduce((s, v) => s + v * v, 0) / r.length);


// Tempo (ms por unidad de grilla) de un tramo: mediana de pendientes entre pares de golpes separados >= minSep unidades.
function halfTempo(grid, hits, lo, hi, minSep) {
  const sl = [];
  for (let i = lo; i <= hi; i++) for (let j = i + 1; j <= hi; j++) if (grid[j] - grid[i] >= minSep) sl.push((hits[j] - hits[i]) / (grid[j] - grid[i]));
  return sl.length >= 2 ? median(sl) : null;
}

/**
 * ¿Se fue apurando o atrasando? Compara el tempo de la 2ª mitad del ejercicio con el de la 1ª, midiendo cada
 * mitad con la mediana de pendientes entre golpes separados al menos un pulso. Al ser robusto, un golpe suelto
 * corrido no se confunde con una tendencia (en simulación: 0 % de falsos positivos y ~99 % de detección de derivas reales).
 */
function trend(grid, hits) {
  const n = grid.length;
  if (n < TREND_MIN_HITS || hits.length !== n) return null;
  const mid = (grid[0] + grid[n - 1]) / 2;
  let k = 0;
  for (let i = 0; i < n; i++) if (grid[i] <= mid) k = i;
  k = Math.min(Math.max(k, 2), n - 3);
  const t1 = halfTempo(grid, hits, 0, k, 4), t2 = halfTempo(grid, hits, k + 1, n - 1, 4); // mitades disjuntas
  if (!(t1 > 0) || !(t2 > 0)) return null;
  const ratio = t2 / t1;
  return ratio < TREND_RUSH_RATIO ? 'rushing' : ratio > TREND_DRAG_RATIO ? 'dragging' : null;
}

/**
 * Devuelve { badPulses: [índices de figura], tendency: 'rushing'|'dragging'|null,
 *            side: 'early'|'late'|'mixed'|null, detail: 'timing'|'missing-one'|'missing-many'|'extra-one'|'extra-many' }.
 * `res` es el resultado de evaluateAttempt (res.reason, res.gaps).
 */
export function diagnoseAttempt(pattern, hits, res) {
  const grid = patternToGrid(pattern), pulse = pulseOfHits(pattern), n = grid.length, m = hits.length;
  const out = { badPulses: [], tendency: null, side: null, detail: res.reason };
  const pulses = idxs => [...new Set(idxs.map(i => pulse[Math.min(Math.max(i, 0), n - 1)]))].sort((a, b) => a - b);

  if (res.reason === 'missing') {
    out.detail = 'missing-many';
    let at = Math.min(m, n - 1); // por defecto: la primera figura que no se llegó a tocar
    if (n - m === 1 && m >= 3) { // falta un solo golpe: ¿en cuál posición encaja mejor?
      let best = Infinity;
      for (let j = 0; j < n; j++) {
        const idx = hits.map((_, k) => (k < j ? k : k + 1));
        const s = rms(residuals(idx.map(i => grid[i]), hits));
        if (s <= best + 1e-6) { best = Math.min(best, s); at = j; } // en empate gana el último (se cortó al final)
      }
      out.detail = 'missing-one';
    }
    out.badPulses = pulses([at]);
  } else if (res.reason === 'extra') {
    out.detail = 'extra-many';
    let at = n - 1; // por defecto: sobraron al final
    if (m - n === 1 && n >= 3) { // sobra un solo golpe: ¿cuál es?
      let best = Infinity;
      for (let k = 0; k < m; k++) {
        const ys = hits.filter((_, i) => i !== k);
        const s = rms(residuals(grid, ys));
        if (s <= best + 1e-6) { best = Math.min(best, s); at = k; } // en empate gana el último (sobró al final)
      }
      out.detail = 'extra-one';
    }
    out.badPulses = pulses([at]);
  } else { // timing (misma cantidad de golpes)
    out.detail = 'timing';
    if (m !== n || !res.gaps || !res.gaps.length) { out.badPulses = pulses([1]); return out; }
    const r = residuals(grid, hits);
    const culprits = new Set();
    res.gaps.forEach((g, i) => {
      if (g && !g.ok) culprits.add(Math.abs(r[i]) > Math.abs(r[i + 1]) ? i : i + 1); // el golpe más desviado de los dos
    });
    if (!culprits.size) culprits.add(r.reduce((bi, v, i) => (Math.abs(v) > Math.abs(r[bi]) ? i : bi), 0));
    const list = [...culprits];
    out.badPulses = pulses(list);
    const signs = list.map(i => Math.sign(r[i]));
    out.side = signs.every(s => s < 0) ? 'early' : signs.every(s => s > 0) ? 'late' : 'mixed';
    out.tendency = trend(grid, hits);
  }
  return out;
}

/** Texto corto del aviso según el diagnóstico. */
export function failureText(diag) {
  switch (diag.detail) {
    case 'missing-one': return 'Faltó un golpe en la figura marcada.';
    case 'missing-many': return 'Faltaron golpes (desde la figura marcada).';
    case 'extra-one': return 'Sobró un golpe en la figura marcada.';
    case 'extra-many': return 'Hubo golpes de más (después de la figura marcada).';
    default:
      if (diag.tendency === 'rushing') return 'Te fuiste apurando hacia el final.';
      if (diag.tendency === 'dragging') return 'Te fuiste atrasando hacia el final.';
      if (diag.side === 'early') return 'Las figuras marcadas salieron adelantadas.';
      if (diag.side === 'late') return 'Las figuras marcadas salieron atrasadas.';
      return 'Revisá las figuras marcadas.';
  }
}
