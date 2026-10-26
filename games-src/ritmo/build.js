// Genera ritmo.html: un único archivo autocontenido (JS + imágenes inline) = versión FINAL.
import fs from 'node:fs';

const strip = f => fs.readFileSync(f, 'utf8')
  .replace(/^import[\s\S]*?from\s+'[^']+';?\s*$/gm, '').replace(/^export (const|function) /gm, '$1 ');
const SRC = ['config', 'engine', 'score', 'game', 'levels', 'diagnose', 'jackpot', 'reel', 'audio', 'ui'];
const b64 = n => 'data:image/png;base64,' + fs.readFileSync(`assets/${n}.png`).toString('base64');

const js = SRC.map(n => strip(`src/${n}.js`)).join('\n');
let html = fs.readFileSync('index.html', 'utf8')
  .replace('<script type="module" src="src/ui.js"></script>', () => `<script>\n${js}\n</script>`);
for (const n of ['sol', 'barco', 'marinero', 'pattern']) html = html.replaceAll(`'assets/${n}.png'`, () => `'${b64(n)}'`);

// Guardia: ninguna ruta relativa a assets/ puede quedar (se rompería al publicar el archivo suelto)
const left = html.match(/assets\/[\w.-]+/g);
if (left) throw new Error(`quedaron rutas sin incrustar: ${[...new Set(left)].join(', ')}`);
fs.writeFileSync('ritmo.html', html);
console.log('ritmo.html', (html.length / 1024).toFixed(0) + ' KB');
