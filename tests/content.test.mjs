import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readPage, section, attr, tags, text } from './helpers.mjs';

const page = () => readPage('index.html');
const manifest = () => JSON.parse(readPage('img/manifest.json'));

// Etiquetas honestas del spec 6, en el orden de la galería.
const ETIQUETAS = {
  vantif: 'Cliente · Contenido creado con IA',
  mallas: 'Cliente · Página web y edición de fotos con IA',
  moda: 'Editorial propia · Concepto',
  forge: 'Identidad propia',
};

// Cada [nombre, precio] aparece en orden después de `desde`, con su precio antes del nombre siguiente
// (o antes de `hasta`, en el último par): así un precio no puede quedar en la fila de otro paquete.
function enOrden(texto, desde, pares, hasta) {
  let cursor = texto.indexOf(desde);
  assert.ok(cursor >= 0, `falta «${desde}»`);
  const fin = hasta ? texto.indexOf(hasta, cursor) : texto.length;
  assert.ok(fin >= 0, `falta «${hasta}» después de «${desde}»`);
  pares.forEach(([nombre, precio], i) => {
    const n = texto.indexOf(nombre, cursor);
    assert.ok(n >= 0 && n < fin, `falta «${nombre}» después de «${desde}»`);
    const siguiente = i + 1 < pares.length ? texto.indexOf(pares[i + 1][0], n) : fin;
    const tramo = texto.slice(n + nombre.length, siguiente < 0 ? fin : siguiente);
    assert.ok(tramo.includes(precio), `«${nombre}» no lleva «${precio}»`);
    cursor = n + nombre.length;
  });
}

// srcset de una foto según el ruling 2: el ancho real como descriptor y sin candidatos del mismo ancho.
function srcsetDe(foto) {
  const anchos = new Set();
  return Object.entries(foto.files)
    .filter(([clave]) => !anchos.has(foto.widths[clave]) && anchos.add(foto.widths[clave]))
    .map(([clave, ruta]) => `${ruta} ${foto.widths[clave]}w`)
    .join(', ');
}

// Los grupos de la galería, cada uno desde su etiqueta de apertura con data-project hasta el siguiente.
const grupos = (trabajo) => trabajo.split(/(?=<[a-z]+\b[^>]*\sdata-project=")/).slice(1);

test('dos tarjetas de servicio', () => {
  enOrden(text(section(page(), 'servicios')), 'Marketing con IA', [
    ['Marketing con IA', 'Paquete mensual desde $5,000; catálogos y anuncios por proyecto'],
    ['Web y sistemas a la medida', 'Páginas desde $4,000; sistemas desde $12,000'],
  ]);
});

test('precios de marketing', () => {
  enOrden(text(section(page(), 'precios')), 'Marketing con IA', [
    ['Arranque IA', 'Desde $5,000 al mes'],
    ['Catálogo con IA', 'Desde $120 por foto'],
    ['Anuncios con IA', 'Desde $3,500 por 5 videos'],
    ['Gestión de anuncios en Meta', 'Desde $2,500 al mes'],
  ], 'Web y sistemas a la medida');
});

test('precios de web y sistemas', () => {
  enOrden(text(section(page(), 'precios')), 'Web y sistemas a la medida', [
    ['Landing page', 'Desde $4,000'],
    ['Tienda en línea', 'Desde $8,000'],
    ['Bot de WhatsApp con IA', 'Desde $12,000 más $1,500 al mes'],
    ['App web a la medida', 'Desde $15,000'],
    ['Sistema de inventario', 'Desde $35,000'],
    ['Mantenimiento', 'Desde $1,500 al mes'],
  ]);
});

test('nota de precios', () => {
  const precios = section(page(), 'precios');
  for (const frase of ['Precios en pesos mexicanos.', 'Si necesitas factura, se agrega IVA.']) {
    assert.ok(text(precios).includes(frase), frase);
  }
  const ctas = precios.match(/<a\b[^>]*\sdata-cta="contacto"[^>]*>[\s\S]*?<\/a>/g) ?? [];
  assert.ok(ctas.some((a) => text(a) === '¿No ves lo que necesitas? Cotízalo por correo'), 'falta el botón de cotizar');
});

test('galería completa y liviana', () => {
  const fotos = manifest();
  const porSrcset = new Map(fotos.map((foto) => [srcsetDe(foto), foto]));
  const vistas = new Set();
  for (const img of tags(section(page(), 'trabajo'), 'img')) {
    const foto = porSrcset.get(attr(img, 'srcset'));
    assert.ok(foto, `srcset que no sale del manifiesto: ${img}`);
    vistas.add(foto.slug);
    assert.ok(attr(img, 'alt')?.trim(), `${foto.slug}: sin alt`);
    assert.equal(attr(img, 'width'), String(foto.width), `${foto.slug}: width`);
    assert.equal(attr(img, 'height'), String(foto.height), `${foto.slug}: height`);
    assert.equal(attr(img, 'loading'), 'lazy', `${foto.slug}: loading`);
    // sin sizes el navegador supone 100vw y baja la foto de 1600 para cada miniatura
    assert.ok(attr(img, 'sizes')?.trim(), `${foto.slug}: sin sizes`);
    assert.ok(Object.values(foto.files).includes(attr(img, 'src')), `${foto.slug}: src fuera del manifiesto`);
    const rutas = [attr(img, 'src'), ...attr(img, 'srcset').split(',').map((c) => c.trim().split(/\s+/)[0])];
    for (const ruta of rutas) assert.ok(!ruta.endsWith('.png'), ruta);
  }
  assert.deepEqual([...vistas].sort(), fotos.map((foto) => foto.slug).sort());
});

test('etiquetas honestas', () => {
  const lista = grupos(section(page(), 'trabajo'));
  assert.deepEqual(lista.map((g) => attr(g, 'data-project')), Object.keys(ETIQUETAS));
  for (const grupo of lista) {
    const proyecto = attr(grupo, 'data-project');
    // la etiqueta va en el encabezado del grupo, antes de sus fotos (nunca como pie de foto)
    assert.ok(text(grupo.slice(0, grupo.indexOf('<img'))).includes(ETIQUETAS[proyecto]), `${proyecto}: falta «${ETIQUETAS[proyecto]}» en el encabezado`);
    for (const img of tags(grupo, 'img')) {
      assert.match(attr(img, 'src'), new RegExp(`^img/${proyecto}/`), `${proyecto}: foto de otro proyecto`);
      // data-source="client" solo en el trabajo para clientes: Moda y Forge son trabajo propio
      assert.equal(attr(img, 'data-source') === 'client', ETIQUETAS[proyecto].startsWith('Cliente'), `${proyecto}: data-source="${attr(img, 'data-source')}"`);
    }
  }
  const mallas = lista.find((g) => attr(g, 'data-project') === 'mallas');
  assert.ok(!/generad/i.test(mallas), 'Mallas Sombra son fotos reales editadas, no generadas');
});

// Fotos donde aparece un modelo (o sus manos); todos fueron creados con IA (ruling del controlador, confirmado por Leo).
const CON_MODELO = [
  'editorial-banff', 'editorial-chipinque', 'vantif-01', 'post-core-tee', 'post-olive-tee', 'post-quarter-zip',
  'macro-quartzip-logo', 'runway-gabardina-charcoal', 'runway-rayas-azul', 'editorial-fs-pendant',
];

test('el alt dice que el modelo fue creado con IA', () => {
  const imgs = tags(page(), 'img');
  for (const slug of CON_MODELO) {
    const deLaFoto = imgs.filter((img) => new RegExp(`^img/[a-z]+/${slug}-\\d+\\.webp$`).test(attr(img, 'src') ?? ''));
    assert.ok(deLaFoto.length > 0, `${slug}: no aparece en la página`);
    for (const img of deLaFoto) assert.match(attr(img, 'alt') ?? '', /cread[oa] con IA/i, `${slug}: el alt no dice que el modelo es de IA`);
  }
});

test('la foto se abre en grande con dialog', () => {
  const html = page();
  const trabajo = section(html, 'trabajo');
  // cada foto vive en un botón, así se abre también con el teclado
  assert.equal((trabajo.match(/<button type="button"[^>]*>\s*<img\b/g) ?? []).length, tags(trabajo, 'img').length);
  const dialogo = /<dialog\b[^>]*>[\s\S]*?<\/dialog>/.exec(trabajo)?.[0];
  assert.ok(dialogo, 'falta el <dialog>');
  assert.match(dialogo, /<button\b[^>]*>\s*Cerrar\s*<\/button>/);
  assert.match(html, /<script type="module" src="js\/galeria\.js"><\/script>/);
});

test('casos', () => {
  const casos = text(section(page(), 'casos'));
  for (const cliente of ['Vantif', 'Mallas Sombra']) assert.ok(casos.includes(cliente), cliente);
  assert.doesNotMatch(casos, /cl[ií]nica/i);
});

test('no aparece contenido prohibido', () => {
  const html = page().toLowerCase();
  for (const palabra of ['ghost', 'dymatize', 'picapiedra', 'dropshipping', 'suplementos', 'marcas activas', 'piezas producidas']) {
    assert.ok(!html.includes(palabra), palabra);
  }
});
