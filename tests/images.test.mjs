import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const MAX_BYTES = 256000;
const readManifest = () => JSON.parse(readFileSync('img/manifest.json', 'utf8'));

// Ancho en píxeles leído del encabezado RIFF/WebP (formatos VP8, VP8L y VP8X).
function webpWidth(ruta) {
  const b = readFileSync(ruta);
  assert.equal(b.toString('ascii', 0, 4) + b.toString('ascii', 8, 12), 'RIFFWEBP', ruta);
  const chunk = b.toString('ascii', 12, 16);
  if (chunk === 'VP8 ') return b.readUInt16LE(26) & 0x3fff;
  if (chunk === 'VP8L') return (b.readUInt32LE(21) & 0x3fff) + 1;
  if (chunk === 'VP8X') return b.readUIntLE(24, 3) + 1;
  throw new Error(`${ruta}: bloque WebP desconocido «${chunk}»`);
}

test('manifest tiene las 19 fotos', () => {
  const manifest = readManifest();
  assert.equal(manifest.length, 19);
  const porProyecto = {};
  for (const foto of manifest) {
    porProyecto[foto.project] = (porProyecto[foto.project] ?? 0) + 1;
    assert.deepEqual(Object.keys(foto.files), ['480', '960', '1600'], foto.slug);
    assert.ok(Number.isInteger(foto.width) && Number.isInteger(foto.height), foto.slug);
  }
  assert.deepEqual(porProyecto, { vantif: 12, mallas: 4, moda: 2, forge: 1 });
});

test('ninguna imagen pasa de 250 KB', () => {
  const rutas = [
    ...readManifest().flatMap((foto) => Object.values(foto.files)),
    ...readdirSync('img/brand').map((nombre) => `img/brand/${nombre}`),
    'img/og.jpg',
    'favicon-32.png',
    'apple-touch-icon.png',
  ];
  for (const ruta of rutas) {
    assert.ok(statSync(ruta).size <= MAX_BYTES, `${ruta} mide ${statSync(ruta).size} bytes`);
  }
});

test('widths reales coinciden con los archivos', () => {
  for (const foto of readManifest()) {
    for (const [clave, ruta] of Object.entries(foto.files)) {
      assert.equal(webpWidth(ruta), foto.widths[clave], ruta);
      assert.ok(foto.widths[clave] <= Number(clave), `${ruta}: ${foto.widths[clave]} > ${clave}`);
    }
  }
});

test('no hay suplementos', () => {
  for (const foto of readManifest()) {
    assert.ok(!foto.project.includes('suplementos'), foto.slug);
    for (const ruta of Object.values(foto.files)) assert.ok(!ruta.includes('suplementos'), ruta);
  }
});

test('no quedan PNG pesados en el repo', () => {
  const rastreados = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean);
  const fotosViejas = /^(assets\/(vantif|mallas|moda|forge|suplementos)|brand)\//;
  assert.deepEqual(rastreados.filter((ruta) => fotosViejas.test(ruta)), []);
  // assets/ queda fuera: una tarea posterior copia ahí el kit de diseño.
  const pngPesados = rastreados.filter(
    (ruta) => ruta.endsWith('.png') && !ruta.startsWith('assets/') && statSync(ruta).size > 300000,
  );
  assert.deepEqual(pngPesados, []);
});
