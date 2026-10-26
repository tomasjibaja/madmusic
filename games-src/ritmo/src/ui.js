import { createRecorder } from './game.js';
import { createGame, LEVELS } from './levels.js';
import { patternToGrid } from './engine.js';
import { scoreAttempt } from './score.js';
import { diagnoseAttempt, failureText } from './diagnose.js';
import { rollsJackpot, rollOutcome, reelsFor, evaluateReels, oddsForLevel } from './jackpot.js';
import { ORDER, symbolAt, nextBrake, brakePos } from './reel.js';
import { MIN_PULSES, FINISH_BONUS } from './config.js';
import { unlockAudio, playSuccess, playError, playLevelUp, playWin, playJackpotIntro, playSpin, playReelStop,
         playPrize, playNoPrize, playPatternSound, playCardPick, playCardUse, playLever, playTick, playStopClick } from './audio.js';

const IMG = { 1: 'assets/sol.png', 2: 'assets/barco.png', 4: 'assets/marinero.png' };
const $ = id => document.getElementById(id);
const game = createGame();
// Aviso a la plataforma (si el juego corre dentro de ella): puntos por nivel y fin de partida
const post = (type, data) => { try { parent.postMessage({ sonoro: type, ...data }, '*'); } catch (e) { /* suelto: sin plataforma */ } };
const RESUME = window.SONORO; // partida guardada: { level, score }
if (RESUME && RESUME.level > 0) game.resume(RESUME.level, RESUME.score || 0);
let listened = false, listening = false, exKey = '';
let rec, totalHits = 0, locked = false, selecting = null, applying = false, curPattern = null;

const WIN = ['¡Bien!', '¡Muy bien!', '¡Eso es!', '¡Perfecto!', '¡Así se hace!'];
const LEVEL_EMOJI = ['🎉', '🔥', '⚡', '🚀'];
const DRIFT_SECONDS = [70, 38, 22, 11]; // el fondo se mueve más rápido en cada nivel
const pick = a => a[Math.floor(Math.random() * a.length)];
const cards = () => [...$('pattern').children];
// Símbolo de alerta que se muestra sobre las figuras que hicieron fallar el ejercicio (SVG en línea)
const ALERT_SVG = '<svg class="alert" viewBox="0 0 24 24" aria-label="Revisá esta figura"><path d="M12 2.4 22.6 20.6H1.4Z" fill="#ffcf1f" stroke="#5a0f16" stroke-width="1.8" stroke-linejoin="round"/><rect x="10.8" y="8.2" width="2.4" height="6.6" rx="1.2" fill="#5a0f16"/><circle cx="12" cy="17.5" r="1.4" fill="#5a0f16"/></svg>';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const done = a => a.finished.catch(() => {});

function setMsg(text, cls = '') { const m = $('msg'); m.textContent = text; m.className = cls; }

/* ---------- tema por nivel (azul -> rojo, más rápido) ---------- */
function applyTheme(levelIdx) {
  const i = Math.min(levelIdx, LEVELS.length - 1);
  document.body.className = 'lv' + i;
  $('bg').style.animationDuration = DRIFT_SECONDS[i] + 's';
}

/* ---------- efectos (Web Animations API: no dependen de CSS) ---------- */
function flash(bg, ms = 700) {
  const f = $('flash'); f.style.background = bg;
  f.animate([{ opacity: 0 }, { opacity: 1, offset: .2 }, { opacity: 0 }], { duration: ms, easing: 'ease-out' });
}
const GOLD = 'radial-gradient(circle at 50% 38%, rgba(255,226,70,1), rgba(255,255,255,.6) 45%, rgba(255,255,255,0) 78%)';
const RED = 'radial-gradient(circle at 50% 40%, rgba(225,40,50,.62), rgba(225,40,50,.3) 55%, rgba(120,0,10,.35))';

function celebrate() {
  flash(GOLD, 850);
  cards().forEach((c, i) => c.animate([
    { transform: 'translateY(0) scale(1) rotate(0)' },
    { transform: 'translateY(-16px) scale(1.24) rotate(-10deg)', offset: .25 },
    { transform: 'translateY(-4px) scale(1.14) rotate(9deg)', offset: .5 },
    { transform: 'translateY(-10px) scale(1.2) rotate(-6deg)', offset: .75 },
    { transform: 'translateY(0) scale(1) rotate(0)' },
  ], { duration: 750, delay: i * 55, easing: 'ease-in-out' }));
  $('msg').animate([{ transform: 'scale(.5)', opacity: 0 }, { transform: 'scale(1.3)', offset: .6 }, { transform: 'scale(1)', opacity: 1 }], { duration: 520 });
  $('score').animate([{ transform: 'scale(1)' }, { transform: 'scale(1.35)', offset: .35 }, { transform: 'scale(1)' }], { duration: 600 });
  confetti(90, 'center');
}
function stumble() {
  flash(RED, 900);
  cards().forEach((c, i) => c.animate([
    { transform: 'translate(0,0) rotate(0)' }, { transform: 'translate(-15px,2px) rotate(-3deg)', offset: .12 },
    { transform: 'translate(15px,4px) rotate(3deg)', offset: .28 }, { transform: 'translate(-11px,6px) rotate(-2deg)', offset: .46 },
    { transform: 'translate(11px,8px) rotate(2deg)', offset: .64 }, { transform: 'translate(-5px,8px)', offset: .82 },
    { transform: 'translate(0,0) rotate(0)' },
  ], { duration: 650, delay: i * 25 }));
  $('play').animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-7px)', offset: .15 }, { transform: 'translateX(7px)', offset: .3 },
    { transform: 'translateX(-5px)', offset: .5 }, { transform: 'translateX(3px)', offset: .75 }, { transform: 'translateX(0)' }], { duration: 450 });
  $('msg').animate([{ transform: 'translateY(-8px)', opacity: 0 }, { transform: 'translateY(0)', opacity: 1 }], { duration: 300 });
}

/* confeti: un único lazo compartido para poder lanzar varias ráfagas a la vez */
const parts = []; let looping = false;
const COLS = ['#e74c3c', '#f1c40f', '#2ecc71', '#3498db', '#9b59b6', '#ff8c42', '#ffffff'];
function confetti(n, mode = 'center', opt = {}) {
  const c = $('fx'); c.width = innerWidth; c.height = innerHeight;
  for (let i = 0; i < n; i++) {
    const left = mode === 'sides' && i % 2 === 0, side = mode === 'sides';
    if (mode === 'at') {
      parts.push({ x: opt.x, y: opt.y, vx: (Math.random() - .5) * 18, vy: -Math.random() * 13 - 3,
        s: 6 + Math.random() * 6, r: Math.random() * 6, vr: (Math.random() - .5) * .45, c: (opt.cols || COLS)[i % (opt.cols || COLS).length] });
      continue;
    }
    parts.push({
      x: side ? (left ? 0 : innerWidth) : innerWidth / 2 + (Math.random() - .5) * 80,
      y: side ? innerHeight * .78 : innerHeight * .4,
      vx: side ? (left ? 1 : -1) * (5 + Math.random() * 9) : (Math.random() - .5) * 17,
      vy: side ? -(13 + Math.random() * 11) : -Math.random() * 15 - 4,
      s: 7 + Math.random() * 7, r: Math.random() * 6, vr: (Math.random() - .5) * .45, c: COLS[i % COLS.length],
    });
  }
  if (!looping) { looping = true; requestAnimationFrame(frame); }
}
function frame() {
  const c = $('fx'), ctx = c.getContext('2d');
  ctx.clearRect(0, 0, c.width, c.height);
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i];
    p.vy += .35; p.vx *= .995; p.x += p.vx; p.y += p.vy; p.r += p.vr;
    if (p.y > c.height + 40) { parts.splice(i, 1); continue; }
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r);
    ctx.fillStyle = p.c; ctx.fillRect(-p.s / 2, -p.s / 3, p.s, p.s * .6); ctx.restore();
  }
  if (parts.length) requestAnimationFrame(frame); else { looping = false; ctx.clearRect(0, 0, c.width, c.height); }
}
function countUp(el, to, ms = 1200) {
  const t0 = performance.now();
  (function step(now) {
    const k = Math.min(1, (now - t0) / ms);
    el.textContent = Math.round(to * (1 - Math.pow(1 - k, 3)));
    if (k < 1) requestAnimationFrame(step);
  })(t0);
}
function popStars(ids) {
  [...document.querySelectorAll(ids)].forEach((s, i) => s.animate([
    { transform: 'scale(0) rotate(-120deg)', opacity: 0 }, { transform: 'scale(1.5) rotate(15deg)', opacity: 1, offset: .6 },
    { transform: 'scale(1) rotate(0)', opacity: 1 }], { duration: 600, delay: 350 + i * 220, fill: 'backwards', easing: 'ease-out' }));
}


/* ---------- tarjetas (amarilla: barco/marinero -> sol · roja: eliminar un pulso) ---------- */
const SLOTS = { yellow: $('cardY'), red: $('cardR') };
// Íconos de las tarjetas: SVG en línea (no dependen de archivos externos)
const CARD_ICON = {
  yellow: '<svg class="ico" viewBox="0 0 32 32" aria-hidden="true"><g stroke="#6b4e00" stroke-width="2.4" stroke-linecap="round"><line x1="25.80" y1="16.00" x2="30.00" y2="16.00"/><line x1="22.93" y1="22.93" x2="25.90" y2="25.90"/><line x1="16.00" y1="25.80" x2="16.00" y2="30.00"/><line x1="9.07" y1="22.93" x2="6.10" y2="25.90"/><line x1="6.20" y1="16.00" x2="2.00" y2="16.00"/><line x1="9.07" y1="9.07" x2="6.10" y2="6.10"/><line x1="16.00" y1="6.20" x2="16.00" y2="2.00"/><line x1="22.93" y1="9.07" x2="25.90" y2="6.10"/></g><circle cx="16" cy="16" r="6.4" fill="#fffbe0" stroke="#6b4e00" stroke-width="2.4"/></svg>',
  red: '<svg class="ico" viewBox="0 0 32 32" aria-hidden="true"><g stroke="#fff" stroke-width="4.8" stroke-linecap="round"><line x1="8.5" y1="8.5" x2="23.5" y2="23.5"/><line x1="23.5" y1="8.5" x2="8.5" y2="23.5"/></g></svg>',
};
SLOTS.yellow.insertAdjacentHTML('afterbegin', CARD_ICON.yellow);
SLOTS.red.insertAdjacentHTML('afterbegin', CARD_ICON.red);
const PICK = { yellow: 'pick-y', red: 'pick-r' };
const centerOf = el => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; };

function eligible(type, pat) { return type === 'yellow' ? pat.some(v => v !== 1) : pat.length > MIN_PULSES; }
function canUse(type) {
  const s = game.state();
  return s.status === 'playing' && !locked && !applying && !!rec && rec.count() === 0 && s.cards[type] > 0 && eligible(type, s.pattern);
}
function renderCards() {
  const s = game.state();
  for (const t of ['yellow', 'red']) {
    const el = SLOTS[t];
    el.hidden = s.cards[t] === 0;
    el.querySelector('.cnt').textContent = s.cards[t];
    el.classList.toggle('off', !canUse(t) && selecting !== t);
    el.classList.toggle('sel', selecting === t);
  }
}
function enterSelect(type) {
  selecting = type;
  const pat = game.state().pattern;
  cards().forEach((c, i) => {
    const ok = type === 'yellow' ? pat[i] !== 1 : true;
    c.classList.toggle(PICK[type], ok); c.classList.toggle('dim', !ok);
  });
  renderCards();
  setMsg(type === 'yellow' ? 'Elegí un barco o marinero para pasarlo a SOL' : 'Elegí el pulso que querés eliminar', 'hint');
  playCardPick();
}
function exitSelect(restoreMsg = true) {
  selecting = null;
  cards().forEach(c => c.classList.remove('pick-y', 'pick-r', 'dim'));
  renderCards();
  if (restoreMsg && rec && rec.count() === 0 && !locked) setMsg('Tocá cuando quieras empezar', 'hint');
}
function onCardClick(type) {
  unlockAudio();
  if (selecting === type) { exitSelect(); return; }
  if (!canUse(type)) {
    SLOTS[type].animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-6px)', offset: .25 }, { transform: 'translateX(6px)', offset: .5 }, { transform: 'translateX(0)' }], { duration: 260 });
    return;
  }
  if (selecting) exitSelect(false);
  enterSelect(type);
}
async function applyCard(type, i) {
  if (applying) return;
  const el = cards()[i];
  applying = true; locked = true; selecting = null;
  cards().forEach(c => c.classList.remove('pick-y', 'pick-r', 'dim'));
  const { x, y } = centerOf(el);
  playCardUse(type);
  if (type === 'yellow') {
    if (!game.useYellow(i)) { applying = false; startAttempt(); return; }
    await done(el.animate([{ transform: 'rotateY(0) scale(1)' }, { transform: 'rotateY(90deg) scale(1.15)' }], { duration: 170, easing: 'ease-in' }));
    el.querySelector('img').src = IMG[1];
    el.classList.add('won');
    flash('radial-gradient(circle at 50% 40%, rgba(255,214,0,.75), rgba(255,214,0,0) 70%)', 700);
    confetti(36, 'at', { x, y, cols: ['#ffd400', '#fff27a', '#ffffff', '#ffb000'] });
    await done(el.animate([{ transform: 'rotateY(-90deg) scale(1.2)' }, { transform: 'rotateY(0) scale(1.45)', offset: .6 }, { transform: 'rotateY(0) scale(1)' }], { duration: 480, easing: 'ease-out' }));
    await sleep(250);
  } else {
    const n = game.state().pattern.length;
    await done(el.animate([
      { transform: 'scale(1) rotate(0)', opacity: 1 }, { transform: 'scale(1.3) rotate(-14deg)', offset: .3 },
      { transform: 'scale(0) rotate(220deg)', opacity: 0 }], { duration: 560, easing: 'ease-in', fill: 'forwards' }));
    flash('radial-gradient(circle at 50% 40%, rgba(255,70,70,.6), rgba(255,70,70,0) 70%)', 650);
    confetti(36, 'at', { x, y, cols: ['#ff4d4d', '#ff8a80', '#ffffff', '#b71c1c'] });
    if (!game.useRed(i)) { applying = false; startAttempt(); return; }
    renderPattern(game.state().pattern);
    cards().forEach((c, k) => c.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.15)', offset: .4 }, { transform: 'scale(1)' }], { duration: 380, delay: k * 35 }));
    await sleep(450 + n * 0);
  }
  applying = false;
  startAttempt();
}

/* ---------- jackpot: palanca + rodillos que se detienen a mano ---------- */
const JP_SPEEDS = [5.0, 5.8, 6.6]; // celdas por segundo de cada rodillo (cada uno gira distinto)
let jp = null;                      // estado vivo del jackpot (null si no hay uno abierto)

function hideJackpot() {
  if (jp) { clearInterval(jp.ticker); cancelAnimationFrame(jp.raf); }
  jp = null; $('jackpot').hidden = true;
}

function jpPaint() {
  jp.strips.forEach((s, k) => {
    const m = ((jp.pos[k] % 3) + 3) % 3;
    s.style.transform = `translateY(${-m * jp.H}px)`;
  });
}

function jpFrame(now) {
  if (!jp) return;
  const dt = Math.min(0.05, Math.max(0, (now - jp.last) / 1000)); jp.last = now;
  let active = false;
  for (let k = 0; k < 3; k++) {
    if (jp.state[k] === 'spin') {
      jp.pos[k] += jp.v[k] * dt; active = true;
      if (jp.phase === 'stopping') { // le toca frenar a este rodillo? (en orden, de izquierda a derecha)
        const plan = nextBrake({ now: performance.now(), pressedAt: jp.pressedAt, k, pos: jp.pos[k], speed: jp.v[k], target: jp.targets[k], prevLandAt: k ? jp.landAt[k - 1] : null });
        if (plan) {
          jp.brake[k] = { t0: performance.now(), p0: jp.pos[k], v0: jp.v[k], T: plan.target, dur: plan.duration };
          jp.landAt[k] = plan.landAt; jp.state[k] = 'brake'; jp.strips[k].style.filter = '';
        }
      }
    }
    else if (jp.state[k] === 'brake') {
      const b = jp.brake[k], t = Math.max(0, (performance.now() - b.t0) / 1000);
      if (t >= b.dur) { jp.pos[k] = b.T; jp.state[k] = 'stopped'; jpLanded(k); }
      else { jp.pos[k] = brakePos(b.p0, b.v0, b.dur, t); active = true; }
    }
  }
  jpPaint();
  if (active) jp.raf = requestAnimationFrame(jpFrame);
}

function jpLanded(k) {
  playReelStop();
  jp.reelEls[k].animate([{ transform: 'scale(1)' }, { transform: 'scale(1.1)', offset: .4 }, { transform: 'scale(1)' }], { duration: 280, easing: 'ease-out' });
  jp.landed[k] = symbolAt(jp.pos[k]);
  if (jp.landed.every(v => v !== null)) { clearInterval(jp.ticker); jp.resolveStops(jp.landed.slice()); }
}

async function pullLever() {
  if (!jp || jp.phase !== 'ready') return;
  jp.phase = 'pulling';
  const lever = $('jpLever'), knob = lever.querySelector('.knob');
  lever.classList.remove('ready'); lever.classList.add('used');
  playLever();
  const travel = Math.max(10, lever.clientHeight - knob.offsetHeight);
  knob.animate([{ transform: 'translateY(0)' }, { transform: `translateY(${travel}px)`, offset: .4, easing: 'ease-in' },
    { transform: `translateY(${travel}px)`, offset: .5 }, { transform: 'translateY(-6px)', offset: .85 }, { transform: 'translateY(0)' }],
    { duration: 800, easing: 'ease-out' });
  await sleep(330);
  if (!jp) return;
  // arrancan los tres rodillos (levemente escalonados)
  // el resultado se sortea según el nivel (más generoso al principio) y los rodillos frenan en esa combinación
  jp.targets = reelsFor(rollOutcome(Math.random, oddsForLevel(game.state().level, LEVELS.length)));
  jp.last = performance.now();
  [0, 1, 2].forEach(k => setTimeout(() => {
    if (!jp) return;
    jp.v[k] = JP_SPEEDS[k]; jp.state[k] = 'spin'; jp.strips[k].style.filter = 'blur(1.3px)';
    if (k === 0) jp.phase = 'spinning';
  }, k * 90));
  jp.raf = requestAnimationFrame(jpFrame);
  jp.ticker = setInterval(playTick, 85);
  $('jpSub').textContent = 'Tocá DETENER cuando quieras';
  $('jpStop').classList.add('on');
  jp.stopsEnabledAt = performance.now() + 200;
}

function pressStop() {
  if (!jp || jp.phase !== 'spinning' || performance.now() < jp.stopsEnabledAt) return;
  jp.phase = 'stopping'; jp.pressedAt = performance.now(); // un solo toque: los tres frenan en orden (ver jpFrame / nextBrake)
  playStopClick();
  $('jpStop').classList.remove('on');
  $('jpSub').textContent = '';
}

async function flyCard(color) {
  const slot = SLOTS[color];
  renderCards();                       // muestra la ranura con la cuenta nueva
  slot.style.visibility = 'hidden';
  const fc = document.createElement('div');
  fc.className = 'ccard fly ' + (color === 'yellow' ? 'y' : 'r');
  fc.innerHTML = CARD_ICON[color];
  const cx = innerWidth / 2, cy = innerHeight / 2;
  fc.style.left = (cx - 25) + 'px'; fc.style.top = (cy - 35) + 'px';
  document.body.appendChild(fc);
  await done(fc.animate([{ transform: 'scale(0) rotate(-200deg)', opacity: 0 }, { transform: 'scale(3.6) rotate(8deg)', opacity: 1, offset: .6 }, { transform: 'scale(3) rotate(-4deg)' }],
    { duration: 650, easing: 'ease-out', fill: 'forwards' }));
  await sleep(450);
  const to = centerOf(slot);
  $('jackpot').animate([{ opacity: 1 }, { opacity: 0 }], { duration: 650, fill: 'forwards' });
  await done(fc.animate([{ transform: 'scale(3) rotate(-4deg)' }, { transform: `translate(${to.x - cx}px, ${to.y - cy}px) scale(1) rotate(0)` }],
    { duration: 700, easing: 'cubic-bezier(.55,0,.3,1)', fill: 'forwards' }));
  fc.remove();
  slot.style.visibility = '';
  slot.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.6)', offset: .4 }, { transform: 'scale(1)' }], { duration: 500, easing: 'ease-out' });
  const p = centerOf(slot);
  confetti(34, 'at', { x: p.x, y: p.y, cols: color === 'yellow' ? ['#ffd400', '#fff27a', '#ffffff'] : ['#ff4d4d', '#ff8a80', '#ffffff'] });
}

/** Jackpot: tirás de la palanca, los rodillos giran y los vas deteniendo vos. Devuelve los puntos finales del ejercicio. */
async function runJackpot(pts) {
  const ov = $('jackpot'), res = $('jpResult');
  ov.getAnimations().forEach(a => a.cancel()); ov.style.opacity = '';
  res.textContent = ''; res.className = 'jp-result';
  const reelEls = [...ov.querySelectorAll('.reel')], strips = reelEls.map(r => r.querySelector('.strip'));
  const cells = [...ORDER, ORDER[0]].map(v => `<div class="cell"><img src="${IMG[v]}" alt=""></div>`).join('');
  strips.forEach(s => { s.innerHTML = cells; s.style.filter = ''; });
  reelEls.forEach(r => r.classList.remove('win'));
  const lever = $('jpLever');
  lever.classList.remove('used'); lever.classList.add('ready');
  $('jpStop').classList.remove('on', 'gone');
  $('jpSub').textContent = 'Tirá de la palanca';

  ov.hidden = false;
  jp = { reelEls, strips, pos: [0, 1, 2], v: [0, 0, 0], state: ['idle', 'idle', 'idle'], brake: [null, null, null],
         landed: [null, null, null], landAt: [null, null, null], pressedAt: 0, phase: 'ready', raf: 0, ticker: 0, targets: null, last: 0,
         H: reelEls[0].clientHeight, resolveStops: null, stopsEnabledAt: 0 };
  jpPaint();
  ov.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300 });
  ov.querySelector('.jp-panel').animate([{ transform: 'translateY(24px) scale(.94)', opacity: 0 }, { transform: 'translateY(0) scale(1)', opacity: 1 }], { duration: 450, easing: 'cubic-bezier(.2,.8,.2,1)' });
  playJackpotIntro();

  const landed = await new Promise(resolve => { jp.resolveStops = resolve; }); // espera a que vos pulses y frenes los 3
  await sleep(350);
  $('jpStop').classList.add('gone');
  const outcome = evaluateReels(landed);

  let finalPts = pts;
  const score = game.state().score;
  if (outcome.type === 'none') {
    res.className = 'jp-result none'; res.textContent = 'Sin suerte esta vez';
    playNoPrize();
    await sleep(1500);
  } else {
    reelEls.forEach(r => r.classList.add('win'));
    flash(GOLD, 900);
    confetti(130, 'center'); confetti(90, 'sides');
    playPrize();
    if (outcome.type === 'double') {
      finalPts = pts * 2;
      res.className = 'jp-result gd';
      res.innerHTML = `Tres soles<small>Puntos x2 · +${finalPts}</small>`;
      $('score').textContent = `⭐ ${score + finalPts}`;
      $('score').animate([{ transform: 'scale(1)' }, { transform: 'scale(1.5)', offset: .4 }, { transform: 'scale(1)' }], { duration: 700, delay: 300 });
      await sleep(2300);
    } else {
      const color = outcome.type, yellow = color === 'yellow';
      const added = game.addCard(color);
      res.className = 'jp-result ' + (yellow ? 'yw' : 'rd');
      res.innerHTML = `${yellow ? 'Tres barcos' : 'Tres marineros'}<small>${added ? `Tarjeta ${yellow ? 'amarilla' : 'roja'} ganada` : `Ya tenés 3 tarjetas ${yellow ? 'amarillas' : 'rojas'}`}</small>`;
      res.animate([{ transform: 'translateY(8px)', opacity: 0 }, { transform: 'translateY(0)', opacity: 1 }], { duration: 420, easing: 'ease-out' });
      await sleep(1500);
      if (added) await flyCard(color); else await sleep(700);
    }
  }
  if (!ov.hidden) { await done(ov.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 350, fill: 'forwards' })); }
  hideJackpot(); ov.getAnimations().forEach(a => a.cancel());
  return finalPts;
}

/* ---------- pantallas ---------- */
function renderPattern(pattern) {
  const n = pattern.length;
  $('pattern').className = n <= 4 ? 'p4' : n <= 8 ? 'p8' : 'p12';
  $('pattern').innerHTML = pattern.map(v => `<div class="card"><img src="${IMG[v]}" alt=""></div>`).join('');
}

function show() {
  const s = game.state();
  $('play').hidden = s.status !== 'playing';
  $('levelDone').hidden = s.status !== 'levelComplete';
  $('finished').hidden = s.status !== 'finished';
  // en la pantalla de nivel completado ya se ve el color del nivel que viene
  applyTheme(s.status === 'levelComplete' ? s.level + 1 : s.level);

  if (s.status === 'levelComplete') {
    post('level', { pts: s.levelScore, next: s.level + 1, score: s.score });
    $('lvlEmoji').textContent = LEVEL_EMOJI[s.level];
    $('levelDoneTitle').textContent = `¡Nivel ${s.level + 1} completado!`;
    $('nextHint').textContent = LEVELS[s.level + 1].intro || '';
    countUp($('levelPts'), s.levelScore, 1100);
    popStars('#stars span');
    flash(GOLD, 1000);
    confetti(150, 'sides'); setTimeout(() => confetti(140, 'center'), 450); setTimeout(() => confetti(100, 'sides'), 1000);
    playLevelUp();
  }
  if (s.status === 'finished') {
    post('level', { pts: s.levelScore, next: null, score: s.score });
    post('end', { bonus: FINISH_BONUS, score: s.score + FINISH_BONUS });
    countUp($('finalPts'), s.score + FINISH_BONUS, 2200);
    playWin();
    [0, 600, 1300, 2000].forEach((t, i) => setTimeout(() => {
      flash(GOLD, 900); confetti(i % 2 ? 170 : 200, i % 2 ? 'center' : 'sides');
    }, t));
    setTimeout(() => confetti(150, 'sides'), 2700);
  }
  if (s.status !== 'playing') return;
  const k = s.level + ':' + s.index; if (k !== exKey) { exKey = k; listened = false; }
  $('lvl').textContent = `NIVEL ${s.level + 1}`;
  $('dots').innerHTML = Array.from({ length: s.totalExercises }, (_, i) =>
    `<i class="${i < s.index ? 'done' : i === s.index ? 'cur' : ''}"></i>`).join('');
  $('score').textContent = `⭐ ${s.score}`;
  renderPattern(s.pattern);
  startAttempt(s.pattern);
}

function updateListen() {
  const b = $('listen');
  b.disabled = listened || listening || (rec && rec.count() > 0);
  b.textContent = listened ? '🔊 Ya la escuchaste' : '🔊 Escuchar una vez';
}

function startAttempt(pattern = game.state().pattern) {
  rec?.cancel();
  locked = false;
  totalHits = patternToGrid(pattern).length;
  selecting = null; curPattern = pattern;
  $('tap').classList.remove('off');
  cards().forEach(c => { c.className = 'card'; c.querySelector('.alert')?.remove(); });
  setMsg('Tocá cuando quieras empezar', 'hint');
  rec = createRecorder(pattern, onFinish);
  updateListen();
  renderCards();
}

function onFinish(res, hits) {
  locked = true; exitSelect(false);
  if (res.ok) {
    const pts = scoreAttempt(res);
    setMsg(`${pick(WIN)}  +${pts}`, 'ok');
    cards().forEach(c => c.classList.add('won'));
    $('score').textContent = `⭐ ${game.state().score + pts}`;
    celebrate(); playSuccess();
    setTimeout(async () => {
      let final = pts;
      try { if (rollsJackpot()) final = await runJackpot(pts); } catch (e) { final = pts; hideJackpot(); }
      game.submit(true, final); show();
    }, 1750);
  } else {
    const diag = diagnoseAttempt(curPattern, hits, res);
    const grew = game.submit(false); // nivel 4: suma un pulso al mismo ejercicio
    setMsg(`No salió. ${failureText(diag)}${grew ? ' ¡Se suma un pulso!' : ''}`, 'bad');
    $('tap').classList.add('off'); // botón apagado mientras se muestra el aviso: evita reintentar antes de tiempo
    cards().forEach((c, i) => {
      c.classList.add('lose');
      if (diag.badPulses.includes(i)) { // figura que hizo fallar: queda brillante y con alerta
        c.classList.add('flag');
        c.insertAdjacentHTML('beforeend', ALERT_SVG);
        c.querySelector('.alert').animate([{ transform: 'scale(0) rotate(-40deg)', opacity: 0 }, { transform: 'scale(1.5) rotate(10deg)', offset: .55, opacity: 1 }, { transform: 'scale(1) rotate(0)' }],
          { duration: 520, delay: 300 + i * 40, fill: 'backwards', easing: 'ease-out' });
      }
    });
    stumble(); playError();
    if (grew) {
      const p = game.state().pattern;
      $('pattern').className = p.length <= 8 ? 'p8' : 'p12';
      const el = document.createElement('div');
      el.className = 'card lose';
      el.innerHTML = `<img src="${IMG[p[p.length - 1]]}" alt="">`;
      $('pattern').appendChild(el);
      el.animate([{ transform: 'scale(0) rotate(-90deg)', opacity: 0 }, { transform: 'scale(1.3) rotate(8deg)', offset: .6, opacity: 1 },
        { transform: 'scale(1) rotate(0)' }], { duration: 550, delay: 350, fill: 'backwards', easing: 'ease-out' });
    }
    setTimeout(() => startAttempt(), 3200); // MISMO ejercicio (con un pulso más en el nivel 4)
  }
}

// Hora del toque: la del evento (momento real del input) si es coherente; si no, performance.now().
function hitTime(e) {
  const now = performance.now(), ts = e && e.timeStamp;
  return (ts > 0 && Math.abs(now - ts) < 1000) ? Math.min(ts, now) : now;
}

function tap(e) {
  e?.preventDefault();
  const t = hitTime(e); // SIEMPRE antes de cualquier otra cosa (p. ej. crear el audio)
  unlockAudio();
  if ($('play').hidden || locked || applying || jp || listening) return;
  if (selecting) exitSelect(false); // tocar TAP cancela la selección de tarjeta y cuenta como golpe
  rec.hit(t);
  updateListen();
  if (rec.count() === 1) renderCards();
  setMsg(rec.count() >= totalHits ? 'Listo…' : 'Seguí…', 'hint');
}

const btn = $('tap');
btn.addEventListener('pointerdown', tap);
btn.addEventListener('contextmenu', e => e.preventDefault());
addEventListener('keydown', e => {
  if (e.code !== 'Space' || e.repeat) return;
  if (jp) { e.preventDefault(); if (jp.phase === 'ready') pullLever(); else pressStop(); return; } // en el jackpot, Espacio = palanca / detener
  tap(e);
});
$('jpLever').addEventListener('pointerdown', e => { e.preventDefault(); unlockAudio(); pullLever(); });
$('jpStop').addEventListener('pointerdown', e => { e.preventDefault(); unlockAudio(); pressStop(); });
SLOTS.yellow.addEventListener('click', () => onCardClick('yellow'));
SLOTS.red.addEventListener('click', () => onCardClick('red'));
$('pattern').addEventListener('click', e => {
  if (!selecting || applying) return;
  const card = e.target.closest('.card'); if (!card) return;
  const i = cards().indexOf(card);
  if (i < 0 || (selecting === 'yellow' && game.state().pattern[i] === 1)) return;
  applyCard(selecting, i);
});
$('listen').addEventListener('click', async () => {
  unlockAudio();
  if (listened || listening || locked || applying || jp || $('play').hidden || rec.count() > 0) return;
  listened = true; listening = true; updateListen();
  const p = game.state().pattern, beat = 715;
  setMsg('Escuchá…', 'hint');
  playPatternSound(p, beat / 1000);
  for (let i = 0; i < p.length; i++) {
    cards()[i]?.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.18)', offset: .3 }, { transform: 'scale(1)' }], { duration: beat * .8 });
    await sleep(beat);
  }
  listening = false; setMsg('Tocá cuando quieras empezar', 'hint'); updateListen();
});
$('nextLevel').addEventListener('click', () => { unlockAudio(); game.nextLevel(); show(); });
$('restart').addEventListener('click', () => { unlockAudio(); game.restart(); show(); });
show();
