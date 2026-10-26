// Tolerancia para ACERTAR: max(MIN_TOLERANCE_MS, TOLERANCE_RATIO * intervalo esperado entre golpes consecutivos).
// (Calibrada por simulación: un jugador con ±30 ms de imprecisión al tocar pasa ~87-92 % de los ejercicios de los niveles 2 a 4.)
export const TOLERANCE_RATIO = 0.65;
export const MIN_TOLERANCE_MS = 130;
// Referencia para el PUNTAJE (la tolerancia anterior): pasar es más fácil, pero los 10 puntos siguen premiando la precisión.
export const SCORE_REF_RATIO = 0.40;
export const SCORE_REF_MIN_MS = 40;
export const UNITS_PER_BEAT = 4;        // 1 pulso = 4 unidades (semicorcheas)
export const ALLOWED_SUBDIVISIONS = [1, 2, 4]; // SOL, BARCO, MARINERO

// Cierre del ejercicio (solo captura, no afecta la evaluación)
export const FIRST_HIT_TIMEOUT_MS = 3000; // 1 solo golpe y silencio
export const INCOMPLETE_WAIT_MIN_MS = 3000; // faltan golpes: espera generosa antes de rendirse
export const INCOMPLETE_WAIT_BEATS = 4;
export const EXTRA_WAIT_MIN_MS = 600;   // patrón completo: ventana para detectar golpes de más
export const EXTRA_WAIT_MAX_MS = 1500;

// Puntaje por ejercicio acertado: mínimo al pasar justo en el límite de tolerancia, máximo si es perfecto.
export const FINISH_BONUS = 50;   // bonus por llegar al final y ganar
export const SCORE_MIN_PASS = 4;
export const SCORE_MAX = 10;

// Jackpot y tarjetas
// Probabilidad de que aparezca el jackpot tras un ejercicio acertado.
export const JACKPOT_CHANCE = 0.15;
// Probabilidades del giro (dentro del jackpot): tres soles / tres barcos / tres marineros. El resto = nada.
// Nivel 1 usa ODDS_START (25 % cada opción, 25 % nada) y van pasando gradualmente (lineal) hasta ODDS_FINAL en el último nivel.
export const ODDS_START = { double: 0.25, yellow: 0.25, red: 0.25 };  // nivel 1 -> nada = 25 %
export const ODDS_FINAL = { double: 0.20, yellow: 0.15, red: 0.10 };  // último nivel -> nada = 55 %
export const MAX_CARDS = 3;         // máximo de tarjetas acumulables de cada color
export const MIN_PULSES = 2;        // la tarjeta roja no deja un ejercicio con menos pulsos que esto
export const STOP_GAP_MS = 250;     // un toque en DETENER: cada rodillo empieza a frenar al menos esto después del anterior
export const LAND_GAP_MS = 330;     // ...y aterriza al menos esto después del anterior (se detienen en orden, de izquierda a derecha)

// Diagnóstico de errores: tendencia a apurarse / atrasarse (cociente entre el tempo de la 2ª mitad y el de la 1ª)
export const TREND_RUSH_RATIO = 0.85;  // < 0,85 => se fue apurando
export const TREND_DRAG_RATIO = 1.18;  // > 1,18 => se fue atrasando
export const TREND_MIN_HITS = 8;       // con menos golpes no se evalúa la tendencia (cada mitad necesita >= 4 golpes)
