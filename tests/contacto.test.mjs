import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readPage, section, attr, tags, text } from './helpers.mjs';
import { CONTACT } from '../js/config.js';
import { refFromSearch, contactHref, applyContactLinks } from '../js/contacto.js';

const EMAIL = 'forgestudio.work@gmail.com';
const MAILTO = `mailto:${EMAIL}?subject=Quiero%20cotizar`;
const MAILTO_IG = `mailto:${EMAIL}?subject=` + encodeURIComponent('Quiero cotizar (ref: ig)');
const IG_PERFIL = 'https://www.instagram.com/forgestudio.work.ai/';
const IG_MENSAJE = 'https://ig.me/m/forgestudio.work.ai';
const PAGINAS = ['index.html', 'aviso-de-privacidad.html'];
const ligas = (html) => html.match(/<a\b[^>]*>[\s\S]*?<\/a>/g) ?? [];
const abre = (liga) => tags(liga, 'a')[0];

test('refFromSearch lee utm_source', () => {
  assert.equal(refFromSearch('?utm_source=ig&utm_medium=social'), 'ig');
  assert.equal(refFromSearch(''), '');
  assert.equal(refFromSearch('?utm_source=qr-visitas'), 'qr-visitas');
  assert.equal(refFromSearch('?utm_source=IG'), 'ig'); // «en minúsculas»: se normaliza
});

test('refFromSearch rechaza basura', () => {
  assert.equal(refFromSearch('?utm_source=%3Cscript%3E'), '');
  assert.equal(refFromSearch('?utm_source=' + 'a'.repeat(21)), '');
  assert.equal(refFromSearch('?utm_source=' + 'a'.repeat(20)), 'a'.repeat(20));
  assert.equal(refFromSearch('?utm_source=ig%20(x)'), '');
  assert.equal(refFromSearch('?utm_source='), '');
});

test('contactHref es el correo con el origen en el asunto', () => {
  assert.equal(contactHref({ email: EMAIL, ref: 'ig' }), MAILTO_IG);
  // sin origen, el mismo href que ya trae el HTML
  assert.equal(contactHref({ email: EMAIL, ref: '' }), MAILTO);
});

test('config.js solo trae el correo', () => {
  // spec 11: sin número de WhatsApp ni teléfono
  assert.deepEqual(CONTACT, { email: EMAIL });
});

// DOM de juguete (ruling 2): solo lo que applyContactLinks usa. querySelectorAll devuelve los botones
// únicamente con el selector de contacto, así una consulta distinta no reescribe nada y la prueba falla.
function pagina(cuantos) {
  const botones = Array.from({ length: cuantos }, () => {
    const attrs = new Map([['href', MAILTO], ['data-cta', 'contacto']]);
    return { getAttribute: (n) => attrs.get(n) ?? null, setAttribute: (n, v) => attrs.set(n, String(v)) };
  });
  return { botones, querySelectorAll: (sel) => (sel === '[data-cta="contacto"]' ? botones : []) };
}

test('applyContactLinks deja el correo con el origen en cada botón', () => {
  const p = pagina(6); // encabezado, portada, dos tarjetas de servicio, precios y cierre
  applyContactLinks(p, CONTACT, '?utm_source=ig');
  for (const b of p.botones) {
    assert.equal(b.getAttribute('href'), MAILTO_IG);
    assert.equal(b.getAttribute('target'), null);
    assert.equal(b.getAttribute('rel'), null);
  }
});

test('applyContactLinks sin origen deja el href del HTML', () => {
  const p = pagina(1);
  applyContactLinks(p, CONTACT, '');
  assert.equal(p.botones[0].getAttribute('href'), MAILTO);
});

test('proceso y cierre', () => {
  const html = readPage('index.html');
  // &nbsp; deja «50 %» en un renglón; aquí cuenta como el espacio que ve el visitante
  const proceso = text(section(html, 'proceso')).replaceAll('&nbsp;', ' ');
  for (const frase of [
    'Nos cuentas por correo o Instagram qué necesitas',
    'Si son fotos, te hacemos 1 de muestra gratis; si es un sistema, te enseñamos una demo.',
    'Te mandamos propuesta y precio en 48 horas',
    'Los paquetes mensuales se pagan al inicio de cada mes',
    '50 % de anticipo y 50 % al entregar',
  ]) assert.ok(proceso.includes(frase), frase);

  const cierre = ligas(section(html, 'contacto'));
  const boton = cierre.find((l) => attr(abre(l), 'data-cta') === 'contacto');
  assert.ok(boton, 'el cierre no tiene botón data-cta');
  assert.equal(text(boton), 'Cotiza tu proyecto por correo');
  // las dos opciones secundarias salen del sitio en otra pestaña y no son data-cta
  for (const [href, etiqueta] of [['https://forms.gle/pt5meVAJtz9bDCRE7', 'O llena el formulario corto'], [IG_MENSAJE, 'Escríbenos por Instagram']]) {
    const liga = cierre.find((l) => attr(abre(l), 'href') === href);
    assert.ok(liga, `falta la liga a ${href}`);
    assert.equal(text(liga), etiqueta);
    assert.equal(attr(abre(liga), 'data-cta'), undefined, `${href} es secundaria, no un data-cta`);
    assert.match(attr(abre(liga), 'rel') ?? '', /\bnoopener\b/, href);
    assert.equal(attr(abre(liga), 'target'), '_blank', href);
  }
});

test('proceso sin texto fuera del spec', () => {
  // spec 4.7 fija el texto de los pasos; la línea del paso 1 que se agregó no viene de ahí
  assert.ok(!text(section(readPage('index.html'), 'proceso')).includes('Tu marca, el servicio que buscas'));
});

test('la página carga contacto.js como módulo', () => {
  const script = tags(readPage('index.html'), 'script').find((t) => attr(t, 'src') === 'js/contacto.js');
  assert.ok(script, 'falta <script src="js/contacto.js">');
  assert.equal(attr(script, 'type'), 'module');
});

// Dónde puede decir «WhatsApp» cada página, y qué frase: el servicio de bots que se vende (spec 4 y 5: servicios,
// precios y la descripción) y, en el aviso, el dato que pide el Google Form (spec 10). Como canal de contacto ya no
// existe (spec 11).
const WHATSAPP_PERMITIDO = {
  'index.html': [
    [(html) => tags(html, 'meta').find((t) => attr(t, 'name') === 'description'), /bots de WhatsApp/g],
    [(html) => section(html, 'servicios'), /bots de WhatsApp/g],
    [(html) => section(html, 'precios'), /Bot de WhatsApp con IA/g],
  ],
  'aviso-de-privacidad.html': [[(html) => section(html, 'datos'), /<li>WhatsApp<\/li>/g]],
};

test('WhatsApp ya no es canal de contacto', () => {
  for (const pagina of PAGINAS) {
    let html = readPage(pagina);
    for (const pieza of ['wa.me', '[TELÉFONO]', 'data-telefono']) assert.ok(!html.includes(pieza), `${pagina} trae ${pieza}`);
    for (const [zona, frase] of WHATSAPP_PERMITIDO[pagina]) {
      const trozo = zona(html);
      assert.ok(trozo, `${pagina}: falta la zona de ${frase}`);
      html = html.replace(trozo, () => trozo.replace(frase, ''));
    }
    const resto = html.split('\n').filter((linea) => /whatsapp/i.test(linea)).map((linea) => linea.trim());
    assert.deepEqual(resto, [], `${pagina} menciona WhatsApp fuera del servicio de bots y del formulario`);
  }
});

test('los botones de contacto abren el correo con su texto aprobado', () => {
  const TEXTOS = ['Cotiza por correo', '¿No ves lo que necesitas? Cotízalo por correo', 'Cotiza tu proyecto por correo'];
  for (const pagina of PAGINAS) {
    const html = readPage(pagina);
    const botones = ligas(html).filter((l) => attr(abre(l), 'data-cta') !== undefined);
    assert.ok(botones.length > 0, `${pagina} no tiene botones de contacto`);
    // sin JavaScript también funcionan: el mailto ya viene en el HTML
    assert.equal(botones.length, (html.match(/\sdata-cta="/g) ?? []).length, `${pagina}: un data-cta que no es <a>`);
    for (const boton of botones) {
      assert.equal(attr(abre(boton), 'data-cta'), 'contacto', boton);
      assert.equal(attr(abre(boton), 'href'), MAILTO, boton);
      assert.ok(TEXTOS.includes(text(boton)), `${pagina}: «${text(boton)}»`);
    }
  }
});

test('el pie: Forge Studio, correo, Instagram, aviso y © 2026', () => {
  for (const pagina of PAGINAS) {
    const footer = /<footer\b[^>]*>[\s\S]*?<\/footer>/.exec(readPage(pagina))?.[0] ?? '';
    assert.ok(text(footer).includes('Forge Studio'), `${pagina}: falta Forge Studio`);
    assert.ok(ligas(footer).some((l) => attr(abre(l), 'href') === `mailto:${EMAIL}` && text(l) === EMAIL), `${pagina}: falta el correo`);
    const ig = ligas(footer).find((l) => attr(abre(l), 'href') === IG_PERFIL);
    assert.ok(ig, `${pagina}: el pie no liga al perfil de Instagram`);
    assert.equal(text(ig), '@forgestudio.work.ai');
    assert.match(attr(abre(ig), 'rel') ?? '', /\bnoopener\b/, `${pagina}: Instagram sin rel="noopener"`);
    assert.match(footer, /href="aviso-de-privacidad\.html"/, `${pagina}: falta la liga al aviso`);
    assert.ok(footer.includes('© 2026'), `${pagina}: falta © 2026`);
    // spec 11: sin teléfono, y el nombre del responsable solo en el aviso
    for (const dato of ['data-telefono', 'data-responsable', 'NOMBRE COMPLETO']) assert.ok(!footer.includes(dato), `${pagina}: el pie trae ${dato}`);
  }
});
