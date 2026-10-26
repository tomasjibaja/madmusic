// Sonidos sintetizados con Web Audio (sin archivos). Se activan con el primer toque del usuario.
let ctx = null;

export function unlockAudio() {
  try {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
  } catch (e) { /* sin audio: el juego sigue igual */ }
}

function tone(f, { t = 0, d = 0.15, f2 = null, type = 'triangle', vol = 0.2 } = {}) {
  if (!ctx) return;
  try {
    const t0 = ctx.currentTime + t;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f, t0);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, t0 + d);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
    o.connect(g); g.connect(ctx.destination);
    o.start(t0); o.stop(t0 + d + 0.03);
  } catch (e) { /* ignorar */ }
}

/** Reproduce un patrón (1/2/4 golpes por pulso) a `beatSec` segundos por pulso. */
export function playPatternSound(pattern, beatSec) {
  pattern.forEach((v, i) => { for (let k = 0; k < v; k++) tone(k === 0 ? 880 : 740, { t: 0.05 + i * beatSec + k * beatSec / v, d: 0.09, vol: 0.22 }); });
}

/** Acierto: tres notas ascendentes + destello agudo. Breve y gratificante. */
export function playSuccess() {
  tone(660, { d: 0.09 });
  tone(880, { t: 0.08, d: 0.1 });
  tone(1320, { t: 0.16, d: 0.22 });
  tone(2637, { t: 0.2, d: 0.18, type: 'sine', vol: 0.05 });
}

/** Error: "wah-wah" descendente + golpe grave. Breve, de mala onda. */
export function playError() {
  [[392, 0], [370, 0.11], [330, 0.22]].forEach(([f, t]) => tone(f, { t, d: 0.12, type: 'sawtooth', vol: 0.1 }));
  tone(247, { t: 0.34, f2: 98, d: 0.34, type: 'sawtooth', vol: 0.13 });
  tone(70, { t: 0.34, d: 0.3, type: 'sine', vol: 0.25 });
}

/** Nivel completado: dos arpegios ascendentes, acorde brillante y destellos. */
export function playLevelUp() {
  [523, 659, 784, 1047].forEach((f, i) => tone(f, { t: i * 0.09, d: 0.14, type: 'square', vol: 0.1 }));
  [659, 784, 1047, 1319].forEach((f, i) => tone(f, { t: 0.4 + i * 0.09, d: 0.14, type: 'square', vol: 0.1 }));
  [1047, 1319, 1568, 2093].forEach(f => tone(f, { t: 0.82, d: 0.9, vol: 0.13 }));
  [3136, 3520, 4186].forEach((f, i) => tone(f, { t: 0.95 + i * 0.1, d: 0.3, type: 'sine', vol: 0.045 }));
  tone(262, { t: 0.82, d: 0.8, type: 'sine', vol: 0.18 });
}

/** Juego completado: escala, fanfarria con acordes y remate triunfal. */
export function playWin() {
  [523, 587, 659, 698, 784, 880, 988, 1047].forEach((f, i) => tone(f, { t: i * 0.085, d: 0.13, type: 'square', vol: 0.09 }));
  [[1047, 1319, 1568], [1175, 1480, 1760], [1319, 1568, 1976]].forEach((ch, k) =>
    ch.forEach(f => tone(f, { t: 0.75 + k * 0.28, d: 0.3, vol: 0.12 })));
  [[1047, 1319, 1568, 2093], [1047, 1319, 1568, 2093]].forEach((ch, k) =>
    ch.forEach(f => tone(f, { t: 1.65 + k * 0.1, d: 1.6 - k * 0.1, vol: 0.12 })));
  tone(262, { t: 1.65, d: 1.6, type: 'sine', vol: 0.2 });
  [3136, 3951, 4186, 3520, 4698].forEach((f, i) => tone(f, { t: 1.9 + i * 0.12, d: 0.35, type: 'sine', vol: 0.045 }));
}

/* ---------- jackpot y tarjetas ---------- */

/** Campanitas de entrada al jackpot. */
export function playJackpotIntro() {
  [1319, 1760, 2093].forEach((f, i) => tone(f, { t: i * 0.1, d: 0.5, type: 'sine', vol: 0.1 }));
  tone(784, { d: 0.35, type: 'square', vol: 0.05 });
}

/** Giro de rodillos: tictic que se va espaciando (~2.7 s). */
export function playSpin() {
  let t = 0;
  for (let i = 0; i < 30; i++) {
    tone(700 + (i % 2) * 140, { t, d: 0.03, type: 'square', vol: 0.035 });
    t += 0.055 + i * 0.0025;
  }
}

/** Cada rodillo al frenar. */
export function playReelStop() {
  tone(220, { f2: 110, d: 0.12, type: 'square', vol: 0.12 });
  tone(1500, { d: 0.04, type: 'square', vol: 0.05 });
}

/** Premio: cascada de monedas + acorde. */
export function playPrize() {
  [1047, 1319, 1568, 2093, 2637, 3136].forEach((f, i) => tone(f, { t: i * 0.07, d: 0.12, type: 'square', vol: 0.08 }));
  [1568, 2093, 2637].forEach(f => tone(f, { t: 0.5, d: 0.85, vol: 0.1 }));
  tone(392, { t: 0.5, d: 0.8, type: 'sine', vol: 0.15 });
}

/** Sin premio: algo suave y breve, sin dramatismo. */
export function playNoPrize() {
  tone(330, { d: 0.18, type: 'sawtooth', vol: 0.05 });
  tone(262, { t: 0.14, d: 0.18, type: 'sawtooth', vol: 0.05 });
  tone(196, { t: 0.28, f2: 147, d: 0.3, type: 'sine', vol: 0.09 });
}

/** Elegir una tarjeta. */
export function playCardPick() {
  tone(880, { d: 0.06, type: 'square', vol: 0.06 });
  tone(1175, { t: 0.05, d: 0.09, type: 'square', vol: 0.06 });
}

/** Usar una tarjeta: amarilla = destello ascendente, roja = barrido + golpe. */
export function playCardUse(kind) {
  if (kind === 'yellow') {
    [784, 1047, 1568, 2093].forEach((f, i) => tone(f, { t: i * 0.06, d: 0.14, vol: 0.12 }));
  } else {
    tone(900, { f2: 200, d: 0.3, type: 'sawtooth', vol: 0.08 });
    tone(150, { t: 0.28, d: 0.12, type: 'sine', vol: 0.22 });
  }
}

/** Palanca: golpe mecánico seco. */
export function playLever() {
  tone(190, { f2: 70, d: 0.16, type: 'square', vol: 0.13 });
  tone(1100, { d: 0.03, type: 'square', vol: 0.05 });
  tone(420, { t: 0.2, f2: 300, d: 0.1, type: 'triangle', vol: 0.06 });
}

/** Tic del rodillo girando. */
export function playTick() {
  tone(1000 + Math.random() * 250, { d: 0.02, type: 'square', vol: 0.03 });
}

/** Al apretar DETENER. */
export function playStopClick() {
  tone(520, { d: 0.05, type: 'square', vol: 0.07 });
  tone(260, { t: 0.02, d: 0.07, type: 'triangle', vol: 0.09 });
}
