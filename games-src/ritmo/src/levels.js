// Estado de niveles/ejercicios y puntaje. Sin DOM ni tiempos: solo progreso.
import { generateExercise } from './engine.js';
import { SCORE_MAX, MAX_CARDS, MIN_PULSES } from './config.js';

// allowed: subdivisiones permitidas (1 = SOL, 2 = BARCO, 4 = MARINERO)
// growOnError: cada error agrega un pulso al ejercicio actual, hasta maxBeats.
export const LEVELS = [
  { beats: 4, exercises: 7, allowed: [1, 2], intro: null },
  { beats: 4, exercises: 7, allowed: [1, 2, 4], intro: 'Entra el marinero ⚓' },
  { beats: 8, exercises: 7, allowed: [1, 2, 4], intro: 'Ahora son 8 pulsos' },
  { beats: 8, exercises: 7, allowed: [1, 2, 4], growOnError: true, maxBeats: 12, intro: 'Cada error suma un pulso (hasta 12)' },
];

/** status: 'playing' | 'levelComplete' | 'finished' */
export function createGame(rng = Math.random) {
  const g = { level: 0, index: 0, pattern: null, status: 'playing', levelScores: LEVELS.map(() => 0), cards: { yellow: 0, red: 0 } };
  const cfg = () => LEVELS[g.level];
  const newPattern = () => { g.pattern = generateExercise(cfg().beats, rng, cfg().allowed); };
  newPattern();
  return {
    state: () => ({
      level: g.level, index: g.index, status: g.status, pattern: g.pattern.slice(),
      totalExercises: cfg().exercises,
      isLastLevel: g.level === LEVELS.length - 1,
      levelScore: g.levelScores[g.level],
      levelMax: cfg().exercises * SCORE_MAX,
      score: g.levelScores.reduce((a, b) => a + b, 0),
      cards: { ...g.cards },
      totalMax: LEVELS.reduce((a, l) => a + l.exercises * SCORE_MAX, 0),
    }),
    /**
     * Acierto: suma puntos y avanza (devuelve false).
     * Fallo: mismo ejercicio; en niveles growOnError agrega un pulso (devuelve true si lo agregó).
     */
    submit(ok, points = 0) {
      if (g.status !== 'playing') return false;
      if (!ok) {
        if (cfg().growOnError && g.pattern.length < cfg().maxBeats) {
          g.pattern.push(...generateExercise(1, rng, cfg().allowed));
          return true;
        }
        return false;
      }
      g.levelScores[g.level] += points;
      g.index++;
      if (g.index >= cfg().exercises) {
        g.status = g.level === LEVELS.length - 1 ? 'finished' : 'levelComplete';
      } else newPattern();
      return false;
    },
    /** Suma una tarjeta ('yellow' | 'red'). Devuelve false si ya hay MAX_CARDS (no se suma). */
    addCard(color) {
      if (!(color in g.cards) || g.cards[color] >= MAX_CARDS) return false;
      g.cards[color]++;
      return true;
    },
    /** Amarilla: convierte en SOL el pulso i del ejercicio actual (solo barco o marinero). */
    useYellow(i) {
      if (g.status !== 'playing' || g.cards.yellow < 1) return false;
      if (!(i >= 0 && i < g.pattern.length) || g.pattern[i] === 1) return false;
      g.pattern[i] = 1; g.cards.yellow--;
      return true;
    },
    /** Roja: elimina el pulso i del ejercicio actual (nunca deja menos de MIN_PULSES). */
    useRed(i) {
      if (g.status !== 'playing' || g.cards.red < 1) return false;
      if (!(i >= 0 && i < g.pattern.length) || g.pattern.length <= MIN_PULSES) return false;
      g.pattern.splice(i, 1); g.cards.red--;
      return true;
    },
    nextLevel() {
      if (g.status !== 'levelComplete') return;
      g.level++; g.index = 0; g.status = 'playing'; newPattern();
    },
    /** Retomar una partida guardada: arranca en `level`. Los puntos ya acumulados se cargan en el nivel 1 solo para mostrar el total. */
    resume(level, score = 0) {
      g.level = Math.max(0, Math.min(LEVELS.length - 1, level | 0)); g.index = 0; g.status = 'playing';
      g.levelScores = LEVELS.map(() => 0); if (g.level > 0) g.levelScores[0] = score;
      g.cards = { yellow: 0, red: 0 }; newPattern();
    },
    restart() {
      g.level = 0; g.index = 0; g.status = 'playing'; g.levelScores = LEVELS.map(() => 0); g.cards = { yellow: 0, red: 0 }; newPattern();
    },
  };
}
