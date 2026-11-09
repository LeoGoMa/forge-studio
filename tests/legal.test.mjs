import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readPage, section, attr, tags, text } from './helpers.mjs';

const EMAIL = 'forgestudio.work@gmail.com';
const SITIO = 'https://leogoma.github.io/forge-studio/';
const aviso = () => readPage('aviso-de-privacidad.html');
const block = (html, name) => new RegExp(`<${name}\\b[^>]*>[\\s\\S]*?</${name}>`).exec(html)?.[0] ?? '';

test('aviso completo', () => {
  const html = aviso();
  // El nombre del responsable va solo en el span#responsable (spec 11); release/ revisa que ya no sea el marcador.
  const responsable = html.match(/<span id="responsable">([^<]*)<\/span>/g) ?? [];
  assert.equal(responsable.length, 1, 'debe haber un solo <span id="responsable">');
  assert.ok(text(responsable[0]), 'el responsable está vacío');
  const fuera = html.replace(responsable[0], '');
  assert.ok(!fuera.includes('NOMBRE COMPLETO'), 'el marcador del nombre aparece fuera de su span');
  assert.ok(html.includes(EMAIL), 'falta el correo');

  const encabezados = (html.match(/<h2\b[^>]*>[\s\S]*?<\/h2>/g) ?? []).map(text);
  for (const tema of ['Datos que recabamos', 'Para qué los usamos', 'Con quién los compartimos', 'Tus derechos', 'Cambios a este aviso']) {
    assert.ok(encabezados.includes(tema), `falta el encabezado «${tema}»`);
  }

  const todo = text(html);
  for (const palabra of ['DENUE', 'INEGI', 'Última actualización: 6 de noviembre de 2026']) {
    assert.ok(todo.includes(palabra), palabra);
  }
  // Terceros (rulings 5 y 9; spec 11: Meta por Instagram), dentro de su sección: en la página entera «Instagram» ya
  // sale en el pie.
  const terceros = text(section(html, 'terceros'));
  for (const tercero of ['Google', 'Gmail', 'Meta, cuando nos escribes por Instagram.']) {
    assert.ok(terceros.includes(tercero), `los terceros no nombran «${tercero}»`);
  }
  // Lo que pide el Google Form actual (ruling 3; su «WhatsApp» es el número de quien lo llena, spec 10), en la
  // sección de datos, y lo que nos escriban por los canales de contacto (spec 11).
  const datos = text(section(html, 'datos')).toLowerCase();
  for (const dato of ['marca', 'giro', 'redes sociales', 'servicio que busca', 'objetivo', 'presupuesto', 'plazo', 'motivo', 'nombre', 'whatsapp', 'lo que nos escribas por instagram o por correo']) {
    assert.ok(datos.includes(dato), `la lista de datos no trae «${dato}»`);
  }
  const derechos = text(section(html, 'derechos')).toLowerCase();
  for (const derecho of ['acceso', 'rectificación', 'cancelación', 'oposición', 'no te volvamos a contactar']) {
    assert.ok(derechos.includes(derecho), `los derechos no traen «${derecho}»`);
  }
  // La nota va al final, después del último tema.
  const nota = 'Sin domicilio publicado por ahora; contacto por correo';
  assert.ok(todo.indexOf(nota) > todo.indexOf('Cambios a este aviso'), 'falta la nota del domicilio al final');
});

test('aviso con el sistema, encabezado y pie del sitio', () => {
  const html = aviso();
  // el mismo CSS y JS que index (spec 12)
  assert.ok(tags(html, 'link').some((t) => attr(t, 'href') === 'css/sitio.css'), 'no carga css/sitio.css');
  assert.ok(tags(html, 'script').some((t) => attr(t, 'src') === 'js/sitio.js' && attr(t, 'type') === 'module'), 'no carga js/sitio.js');
  assert.equal(attr(tags(html, 'html')[0], 'data-type'), 'service');
  assert.equal(attr(tags(html, 'link').find((t) => attr(t, 'rel') === 'canonical') ?? '', 'href'), `${SITIO}aviso-de-privacidad.html`);

  const header = block(html, 'header');
  for (const id of ['servicios', 'precios', 'trabajo']) assert.match(header, new RegExp(`href="\\./#${id}"`), `el menú no lleva a ./#${id}`);
  assert.ok(text(header).includes('Cotiza por correo'), 'el encabezado no trae «Cotiza por correo»');
  const ctas = html.match(/<a\b[^>]*\sdata-cta="contacto"[^>]*>/g) ?? [];
  assert.ok(ctas.length > 0, 'no hay botón de contacto');
  for (const cta of ctas) assert.match(attr(cta, 'href') ?? '', /^mailto:forgestudio\.work@gmail\.com\?subject=\S+$/, cta);
  const script = tags(html, 'script').find((t) => attr(t, 'src') === 'js/contacto.js');
  assert.equal(attr(script ?? '', 'type'), 'module', 'falta js/contacto.js como módulo');

  // para cuando se comparte la liga (spec 9), como en index
  const og = (p) => attr(tags(html, 'meta').find((t) => attr(t, 'property') === `og:${p}`) ?? '', 'content');
  assert.equal(og('title'), 'Aviso de privacidad · Forge Studio');
  assert.ok(og('description')?.trim(), 'falta og:description');
  assert.match(og('image') ?? '', /img\/og\.jpg$/);

  const footer = block(html, 'footer');
  assert.ok(footer.includes(EMAIL), 'el pie no trae el correo');
  assert.match(footer, /href="aviso-de-privacidad\.html"/);
  // el resto del pie (Instagram, sin teléfono ni responsable, spec 11) lo revisa «el pie: …» en contacto.test.mjs
  assert.equal(tags(html, 'img').filter((t) => !/^img\/brand\//.test(attr(t, 'src') ?? '')).length, 0, 'el aviso no lleva fotos');
});

test('oferta redirige conservando query y hash', () => {
  const html = readPage('oferta.html');
  for (const pieza of ['location.replace(', 'location.search', 'location.hash']) assert.ok(html.includes(pieza), pieza);
  assert.equal(attr(tags(html, 'link').find((t) => attr(t, 'rel') === 'canonical') ?? '', 'href'), SITIO);

  // El refresh es el respaldo sin JavaScript: solo dentro de <noscript>, o se adelantaría al script y tiraría la query.
  const refresh = /<meta\b[^>]*http-equiv="refresh"[^>]*>/g;
  const dentro = (html.match(/<noscript>[\s\S]*?<\/noscript>/g) ?? []).join('').match(refresh) ?? [];
  assert.ok(dentro.length > 0, 'falta el meta refresh dentro de <noscript>');
  assert.equal((html.match(refresh) ?? []).length, dentro.length, 'hay un meta refresh fuera de <noscript>');
  assert.match(attr(dentro[0], 'content') ?? '', /^0;\s*url=\.\/$/);

  // El script de verdad, con la liga vieja de Instagram.
  const codigo = (html.match(/<script\b[^>]*>([\s\S]*?)<\/script>/g) ?? []).map((s) => s.replace(/^<script\b[^>]*>|<\/script>$/g, '')).join('\n');
  let destino;
  const location = { search: '?utm_source=ig&utm_medium=social', hash: '#precios', replace: (url) => { destino = url; } };
  vm.runInNewContext(codigo, { location });
  assert.equal(destino, './?utm_source=ig&utm_medium=social#precios');
});

test('aviso simplificado', () => {
  const md = readPage('../docs/plantillas/aviso-simplificado.md');
  assert.ok(md.length < 600, `mide ${md.length} caracteres`);
  assert.ok(md.includes(`${SITIO}aviso-de-privacidad.html`), 'no liga al aviso integral');
});
