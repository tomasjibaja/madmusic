// Datos fijos del juego (el servidor no confía en lo que diga el navegador)
module.exports = {
  GAMES: { ritmo: { cap: 200, levels: 4 }, cambio: { cap: 300, levels: 4 }, arena: { cap: 400, levels: 1, battle: true } }, // cap = máximo de puntos por nivel
  TOPICS: { t1: 6, t2: 6, t3: 6, t4: 6, t5: 4, t6: 5 },                          // temas y cantidad de diapositivas
  PLANNED: ['ances', 'orig'],            // juegos futuros: solo se pueden habilitar para mostrar "Próximamente"
  AVATARS: 12,
  FINISH_BONUS: 50,
  MIN_LEVEL_SECONDS: 12,
  MIN_BATTLE_SECONDS: 15,
  RESET_HOURS: 24,
};
