import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateAttempt, patternToGrid, generateExercise } from '../src/engine.js';
import { diagnoseAttempt, failureText, pulseOfHits } from '../src/diagnose.js';

const SOL = 1, BARCO = 2, MARI = 4;
const sols = n => Array(n).fill(SOL);
const diag = (pat, hits) => { const res = evaluateAttempt(pat, hits); return { res, d: diagnoseAttempt(pat, hits, res) }; };
const gauss = () => { let u = 0; while (!u) u = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * Math.random()); };
function player(pat, sigma, wobble, drift = 0, unit = 150) { // jugador con ruido al tocar, tempo algo inestable y deriva opcional
  const g = patternToGrid(pat); let t = 1000; const hits = [t + gauss() * sigma];
  for (let i = 1; i < g.length; i++) { t += (g[i] - g[i - 1]) * unit * (1 + gauss() * wobble + drift * i); hits.push(t + gauss() * sigma); }
  return hits.sort((a, b) => a - b);
}

test('golpes -> figura: cada golpe sabe a qué figura pertenece', () => {
  assert.deepEqual(pulseOfHits([SOL, BARCO, MARI]), [0, 1, 1, 2, 2, 2, 2]);
  assert.deepEqual(pulseOfHits([MARI, SOL]), [0, 0, 0, 0, 1]);
});

test('timing: marca solo la figura del golpe corrido, no las que estuvieron bien', () => {
  const { res, d } = diag(sols(6), [0, 500, 650, 1500, 2000, 2500]); // el 3er golpe se adelantó mucho
  assert.equal(res.ok, false); assert.equal(res.reason, 'timing');
  assert.deepEqual(d.badPulses, [2]);
  assert.equal(d.side, 'early');
});

test('timing: un golpe tarde marca esa figura y dice "atrasadas"', () => {
  const pat = sols(6), hits = [0, 500, 1000, 1500, 2400, 2500]; // el 5º golpe llega muy tarde
  const res = evaluateAttempt(pat, hits);
  assert.equal(res.ok, false);
  const d = diagnoseAttempt(pat, hits, res);
  assert.deepEqual(d.badPulses, [4]);
  assert.equal(d.side, 'late');
  assert.match(failureText(d), /atrasadas/);
});

test('timing con grafías de varios golpes: marca la figura correcta', () => {
  // [SOL, MARI, SOL]: golpes en 0 | 4,5,6,7 | 8 (unidad 125 ms => 0, 500, 625, 750, 875, 1000)
  const pat = [SOL, MARI, SOL];
  const hits = [0, 500, 625, 750, 1500, 1625]; // el 5º golpe (último del marinero) llega tardísimo
  const res = evaluateAttempt(pat, hits);
  assert.equal(res.ok, false);
  const d = diagnoseAttempt(pat, hits, res);
  assert.ok(d.badPulses.includes(1) || d.badPulses.includes(2));
  assert.ok(!d.badPulses.includes(0));
});

test('tendencia: se va apurando hacia el final', () => {
  const hits = [0, 500, 1000, 1450, 1830, 2130, 2350, 2500]; // intervalos cada vez más cortos
  const { res, d } = diag(sols(8), hits);
  assert.equal(res.ok, false);
  assert.equal(d.tendency, 'rushing');
  assert.equal(failureText(d), 'Te fuiste apurando hacia el final.');
  assert.ok(d.badPulses.every(p => p >= 4), `figuras marcadas: ${d.badPulses}`);
});

test('tendencia: se va atrasando hacia el final', () => {
  const hits = [0, 500, 1000, 1550, 2170, 2870, 3650, 4550]; // intervalos cada vez más largos
  const { res, d } = diag(sols(8), hits);
  assert.equal(res.ok, false);
  assert.equal(d.tendency, 'dragging');
  assert.equal(failureText(d), 'Te fuiste atrasando hacia el final.');
});

test('sin tendencia: un golpe suelto corrido no se reporta como apuro/atraso', () => {
  const hits = [0, 500, 1000, 1500, 2450, 2500, 3000, 3500];
  const r = evaluateAttempt(sols(8), hits);
  assert.equal(r.ok, false);
  const dd = diagnoseAttempt(sols(8), hits, r);
  assert.equal(dd.tendency, null);
  assert.deepEqual(dd.badPulses, [4]);
});

test('un solo golpe adelantado NO se reporta como tendencia (caso real: 3er golpe adelantado)', () => {
  const pat = sols(6), hits = [100, 600, 750, 1600, 2100, 2600];
  const res = evaluateAttempt(pat, hits);
  assert.equal(res.ok, false);
  const d = diagnoseAttempt(pat, hits, res);
  assert.equal(d.tendency, null);
  assert.deepEqual(d.badPulses, [2]);
  assert.equal(failureText(d), 'Las figuras marcadas salieron adelantadas.');
});

test('golpes muy tarde al final: se marcan las figuras correctas y se las describe como atrasadas', () => {
  const pat = [SOL, BARCO, MARI, SOL], hits = [100, 600, 850, 1100, 1225, 1350, 2100, 2600];
  const res = evaluateAttempt(pat, hits);
  assert.equal(res.ok, false);
  const d = diagnoseAttempt(pat, hits, res);
  assert.equal(d.side, 'late');
  assert.deepEqual(d.badPulses, [2, 3]);
});

test('falta un golpe en el medio: marca la figura donde faltó', () => {
  const { res, d } = diag(sols(4), [0, 1000, 1500]); // se salteó el 2º golpe
  assert.equal(res.reason, 'missing');
  assert.equal(d.detail, 'missing-one');
  assert.deepEqual(d.badPulses, [1]);
});

test('falta el último golpe: marca la última figura', () => {
  const { d } = diag(sols(4), [0, 500, 1000]);
  assert.equal(d.detail, 'missing-one');
  assert.deepEqual(d.badPulses, [3]);
});

test('faltan varios golpes: marca desde la primera figura que no se tocó', () => {
  const { d } = diag(sols(4), [0, 500]);
  assert.equal(d.detail, 'missing-many');
  assert.deepEqual(d.badPulses, [2]);
  assert.match(failureText(d), /desde la figura marcada/);
});

test('sobra un golpe en el medio: marca la figura donde se coló', () => {
  const { res, d } = diag(sols(4), [0, 500, 750, 1000, 1500]);
  assert.equal(res.reason, 'extra');
  assert.equal(d.detail, 'extra-one');
  assert.deepEqual(d.badPulses, [2]);
});

test('sobra un golpe al final: marca la última figura', () => {
  const { d } = diag(sols(4), [0, 500, 1000, 1500, 2000]);
  assert.equal(d.detail, 'extra-one');
  assert.deepEqual(d.badPulses, [3]);
});

test('sobran varios: marca la última figura', () => {
  const { d } = diag(sols(4), [0, 500, 1000, 1500, 2000, 2500]);
  assert.equal(d.detail, 'extra-many');
  assert.deepEqual(d.badPulses, [3]);
});

test('toda falla de timing marca al menos una figura y devuelve texto', () => {
  let fails = 0;
  for (let i = 0; i < 3000 && fails < 400; i++) {
    const pat = generateExercise(8), g = patternToGrid(pat), unit = 150;
    const hits = g.map(x => 1000 + x * unit + (Math.random() - .5) * 420).sort((a, b) => a - b);
    const res = evaluateAttempt(pat, hits);
    if (res.ok) continue;
    fails++;
    const d = diagnoseAttempt(pat, hits, res);
    assert.ok(d.badPulses.length >= 1, 'al menos una figura marcada');
    assert.ok(d.badPulses.every(p => p >= 0 && p < pat.length));
    assert.ok(failureText(d).length > 10);
  }
  assert.ok(fails > 50);
});

test('el diagnóstico no inventa figuras: con un solo golpe malo, marca justo esa', () => {
  let single = 0, tot = 0;
  for (let i = 0; i < 500; i++) {
    const pat = sols(8), hits = patternToGrid(pat).map(x => 1000 + x * 125);
    const k = 2 + Math.floor(Math.random() * 5); hits[k] += 420; // un golpe muy tarde (nunca cruza al siguiente)
    const res = evaluateAttempt(pat, hits); if (res.ok) continue;
    tot++; const d = diagnoseAttempt(pat, hits, res); if (d.badPulses.length === 1 && d.badPulses[0] === k) single++;
  }
  assert.ok(tot > 100 && single / tot > 0.9, `${single}/${tot}`);
});

test('tendencia: jugadores sin deriva que fallan casi nunca reciben "apuro/atraso" falso', () => {
  for (const sigma of [40, 60]) {
    let n = 0, fp = 0;
    for (let i = 0; i < 2500; i++) {
      const pat = generateExercise(10), hits = player(pat, sigma, .04), res = evaluateAttempt(pat, hits);
      if (res.ok) continue;
      n++; if (diagnoseAttempt(pat, hits, res).tendency) fp++;
    }
    assert.ok(n > 300 && fp / n < 0.03, `σ=${sigma}: ${fp}/${n}`);
  }
});

test('tendencia: una deriva gradual real se detecta (apurar y atrasar)', () => {
  for (const dir of [-1, 1]) {
    let n = 0, det = 0;
    for (let i = 0; i < 1500; i++) {
      const pat = generateExercise(10), hits = player(pat, 25, .02, dir * .08), res = evaluateAttempt(pat, hits);
      if (res.ok) continue;
      n++; if (diagnoseAttempt(pat, hits, res).tendency === (dir < 0 ? 'rushing' : 'dragging')) det++;
    }
    assert.ok(n > 300 && det / n > 0.95, `dir ${dir}: ${det}/${n}`);
  }
});

test('tendencia: un golpe suelto muy corrido no se confunde con tendencia', () => {
  let n = 0, fp = 0;
  for (let i = 0; i < 2000; i++) {
    const pat = generateExercise(10), hits = player(pat, 10, .01), k = 2 + Math.floor(Math.random() * 6);
    hits[k] += 0.7 * 600 * (Math.random() < .5 ? 1 : -1); hits.sort((a, b) => a - b);
    const res = evaluateAttempt(pat, hits); if (res.ok) continue;
    n++; if (diagnoseAttempt(pat, hits, res).tendency) fp++;
  }
  assert.ok(n > 300 && fp / n < 0.03, `${fp}/${n}`);
});
