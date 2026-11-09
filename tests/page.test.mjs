import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readPage, section, attr, tags, text } from './helpers.mjs';

const page = () => readPage('index.html');
const IDS = ['inicio', 'servicios', 'precios', 'trabajo', 'casos', 'proceso', 'contacto'];
const EMAIL = 'forgestudio.work@gmail.com';

// Primer bloque <name …>…</name>.
const block = (html, name) => {
  const m = new RegExp(`<${name}\\b[^>]*>[\\s\\S]*?</${name}>`).exec(html);
  assert.ok(m, `falta <${name}>`);
  return m[0];
};
const metaContent = (html, key, value) => attr(tags(html, 'meta').find((t) => attr(t, key) === value) ?? '', 'content');

test('orden de secciones', () => {
  const ids = tags(block(page(), 'main'), 'section').map((t) => attr(t, 'id'));
  // Orden relativo de los siete: se permiten ids extra entre ellos (p. ej. precios-web).
  assert.deepEqual(ids.filter((id) => IDS.includes(id)), IDS);
});

test('metas del tipo', () => {
  const html = page();
  assert.equal(attr(tags(html, 'html')[0], 'data-type'), 'service');
  assert.equal(metaContent(html, 'name', 'page-type'), 'service');
  assert.equal(metaContent(html, 'name', 'site-kind'), 'other');
});

test('título y descripción', () => {
  const html = page();
  assert.match(text(block(html, 'title')), /Forge Studio/);
  assert.ok(metaContent(html, 'name', 'description')?.trim(), 'falta meta description');
  assert.match(metaContent(html, 'property', 'og:image') ?? '', /img\/og\.jpg$/);
});

test('h1 aprobado', () => {
  const html = page();
  assert.equal(tags(html, 'h1').length, 1);
  assert.equal(text(block(html, 'h1')), 'Más ventas con contenido IA. Menos trabajo manual con sistemas a la medida.');
});

test('datos de confianza', () => {
  const inicio = text(section(page(), 'inicio'));
  for (const dato of ['Equipo en México', 'Propuesta y precio en 48 horas', 'Herramientas de IA incluidas en el contenido']) {
    assert.ok(inicio.includes(dato), dato);
  }
});

test('navegación', () => {
  const header = block(page(), 'header');
  for (const id of ['servicios', 'precios', 'trabajo']) assert.match(header, new RegExp(`href="#${id}"`));
  assert.ok(text(header).includes('Cotiza por correo'));
  assert.match(header, /\sdata-cta="contacto"/, 'el botón del encabezado no es de contacto');
});

test('cada data-cta tiene href mailto en el HTML', () => {
  const ctas = page().match(/<[a-z]+\b[^>]*\sdata-cta="[^"]*"[^>]*>/g) ?? [];
  assert.ok(ctas.length > 0, 'no hay botones de contacto');
  for (const cta of ctas) {
    assert.match(attr(cta, 'href') ?? '', new RegExp(`^mailto:${EMAIL.replaceAll('.', '\\.')}\\?subject=\\S+$`), cta);
  }
});

test('pie', () => {
  const footer = block(page(), 'footer');
  assert.ok(footer.includes(EMAIL), 'falta el correo');
  assert.ok(footer.includes('@forgestudio.work.ai'), 'falta la cuenta de Instagram');
  assert.match(footer, /href="aviso-de-privacidad\.html"/);
  assert.ok(footer.includes('© 2026'), 'falta © 2026');
  for (const domicilio of ['Calle', 'Col.', 'C.P.']) assert.ok(!footer.includes(domicilio), domicilio);
  // sin teléfono ni nombre del responsable (spec 11): lo revisa «el pie: …» en contacto.test.mjs, en las dos páginas
  // El spec 4.9 fija lo que lleva el pie: ninguna línea de presentación inventada.
  assert.ok(!text(footer).includes('Marketing con IA y sistemas a la medida'), 'el pie trae una línea que no está en el spec');
});

// Sin viñeta, VoiceOver deja de anunciar una lista como lista; role="list" la conserva (como en el aviso).
test('las listas del contenido conservan role="list"', () => {
  for (const pagina of ['index.html', 'aviso-de-privacidad.html']) {
    const main = block(readPage(pagina), 'main');
    const listas = [...tags(main, 'ul'), ...tags(main, 'ol')];
    assert.ok(listas.length > 0, pagina);
    for (const lista of listas) assert.equal(attr(lista, 'role'), 'list', `${pagina}: ${lista}`);
  }
});

test('foto de portada', () => {
  const img = tags(section(page(), 'inicio'), 'img')
    .find((t) => /^img\/vantif\/editorial-chipinque-\d+\.webp$/.test(attr(t, 'src') ?? ''));
  assert.ok(img, 'la portada no usa editorial-chipinque');
  assert.equal(attr(img, 'fetchpriority'), 'high');
  assert.equal(attr(img, 'loading'), undefined);
  // srcset, ancho y alto salen del manifiesto de la tarea 1 (descriptor w = ancho real).
  // shortcut: no quita anchos repetidos porque esta foto tiene tres distintos; la galería (tarea 3) sí debe.
  const manifest = JSON.parse(readFileSync(new URL('../img/manifest.json', import.meta.url), 'utf8'));
  const foto = manifest.find((f) => f.slug === 'editorial-chipinque');
  const srcset = Object.entries(foto.files).map(([clave, ruta]) => `${ruta} ${foto.widths[clave]}w`).join(', ');
  assert.equal(attr(img, 'srcset'), srcset);
  assert.equal(attr(img, 'width'), String(foto.width));
  assert.equal(attr(img, 'height'), String(foto.height));
});
