import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { posix } from 'node:path';
import { fileURLToPath } from 'node:url';

// Rutas relativas a la raíz del repo (un nivel arriba de tests/), con «/», sin importar desde dónde se corra.
const ROOT = fileURLToPath(new URL('../', import.meta.url));
const read = (ruta) => readFileSync(ROOT + ruta, 'utf8');
// Cada archivo bajo una carpeta, como ruta relativa a la raíz con «/».
const archivos = (carpeta) =>
  readdirSync(ROOT + carpeta, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile())
    .map((e) => posix.join(e.parentPath.replaceAll('\\', '/'), e.name).slice(ROOT.length));
const PAGINAS = ['index.html', 'aviso-de-privacidad.html', 'oferta.html'];

// Lo que un archivo pide al cargarse: src, href y srcset en HTML; url() y @import en CSS; los import estáticos y
// import('…') con texto fijo en JS (sin comentarios: ui.js trae un ejemplo de import en el suyo). Se quedan fuera
// las ligas externas, mailto:, data: y #anclas.
function referencias(ruta) {
  let codigo = read(ruta);
  const valores = [];
  if (ruta.endsWith('.html')) {
    for (const [, v] of codigo.matchAll(/\s(?:src|href)="([^"]*)"/g)) valores.push(v);
    for (const [, v] of codigo.matchAll(/\ssrcset="([^"]*)"/g)) valores.push(...v.split(',').map((c) => c.trim().split(/\s+/)[0]));
  } else if (ruta.endsWith('.css')) {
    codigo = codigo.replace(/url\(\s*(['"])data:[\s\S]*?\1\s*\)/g, ''); // un SVG en data: trae su propio url(%23m)
    for (const [, v] of codigo.matchAll(/(?:url\(|@import)\s*['"]?([^'")\s;]+)/g)) valores.push(v);
  } else {
    codigo = codigo.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    for (const [, v] of codigo.matchAll(/\b(?:from\s*|import\s*\(?\s*)['"]([^'"]+)['"]/g)) valores.push(v);
  }
  return valores
    .filter((v) => v && !/^(?:[a-z][a-z0-9+.-]*:|#|\/\/)/i.test(v))
    .map((v) => posix.normalize(posix.join(posix.dirname(ruta), v.split(/[?#]/)[0])));
}

// Las páginas y, siguiendo sus referencias, cada CSS y JS local que cargan: { archivo: [lo que pide] }.
function cargados() {
  const vistos = new Map();
  const pendientes = [...PAGINAS];
  while (pendientes.length) {
    const ruta = pendientes.pop();
    if (vistos.has(ruta)) continue;
    const pide = referencias(ruta);
    vistos.set(ruta, pide);
    pendientes.push(...pide.filter((r) => /\.(?:css|m?js)$/.test(r) && existsSync(ROOT + r)));
  }
  return vistos;
}

test('todo lo que se carga existe', () => {
  for (const [ruta, pide] of cargados()) {
    for (const r of pide) assert.ok(existsSync(ROOT + r), `${ruta} pide ${r}, que no existe`);
  }
});

// Spec 6: las fotos que no se ven al abrir cargan hasta que el visitante se acerca. Ningún JS servido las pasa a eager
// (el system.js del kit lo hacía; desde el spec 12 ya no se usa). La única excepción es la copia que galeria.js abre en
// grande, que se pide con un clic.
test('ningún JS servido adelanta las fotos diferidas', () => {
  const scripts = [...cargados().keys()].filter((ruta) => /\.m?js$/.test(ruta));
  assert.ok(scripts.includes('js/sitio.js'), 'ninguna página carga js/sitio.js');
  for (const ruta of scripts) {
    const lineas = read(ruta).split('\n').filter((l) =>
      /(?:\.loading\s*=|setAttribute\(\s*['"]loading['"]\s*,)\s*['"]eager['"]|removeAttribute\(\s*['"]loading['"]\s*\)/.test(l));
    assert.deepEqual(lineas.filter((l) => !l.includes('foto.removeAttribute')).map((l) => l.trim()), [], ruta);
  }
});

// Restricciones globales: ninguna imagen servida pasa de 250 KB, aunque no esté en img/manifest.json (la de 640 de la portada).
test('ninguna imagen que se carga pasa de 250 KB', () => {
  const imagenes = [...new Set([...cargados().values()].flat())].filter((ruta) => /\.(?:webp|png|jpe?g|avif|gif)$/.test(ruta));
  assert.ok(imagenes.includes('img/vantif/editorial-chipinque-640.webp'), 'no encontró la foto de portada de celular');
  for (const ruta of imagenes) assert.ok(statSync(ROOT + ruta).size <= 256000, `${ruta} mide ${statSync(ROOT + ruta).size} bytes`);
});

// Ningún CSS o JS se queda en el repo sin que una página lo cargue (antes se revisaba el kit en assets/; desde el
// spec 12 el CSS y el JS son propios), y el kit no vuelve.
test('no sobra CSS ni JS', () => {
  const usados = new Set([...cargados().values()].flat());
  assert.ok(!existsSync(ROOT + 'assets'), 'volvió la carpeta assets/ del kit');
  assert.deepEqual([...archivos('css'), ...archivos('js')].filter((ruta) => !usados.has(ruta)), []);
});

// Restricciones globales: ningún HTML que quede en el repo, servido o no, nombra marcas ajenas ni lo que se quitó.
test('ningún html del repo trae contenido prohibido', () => {
  const htmls = archivos('').filter((ruta) => ruta.endsWith('.html') && !/(^|\/)(\.git|node_modules)\//.test(ruta));
  assert.ok(htmls.includes('index.html'), 'no encontró las páginas');
  for (const ruta of htmls) {
    assert.doesNotMatch(read(ruta), /ghost|dymatize|picapiedra|dropshipping|suplementos/i, ruta);
  }
});
