// Prueba de interacción de la página nueva con Chrome sin ventana y CDP (sin dependencias: WebSocket de Node 22+).
// Uso, con la página servida en local (python -m http.server 8765):
//   node tools/probar-interaccion.mjs http://localhost:8765/ shots/forja/interaccion
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const [url = 'http://localhost:8765/', salida = 'shots/forja/interaccion'] = process.argv.slice(2);
mkdirSync(salida, { recursive: true });
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PUERTO = 9333;
const perfil = mkdtempSync(join(tmpdir(), 'forja-cdp-'));
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PUERTO}`, `--user-data-dir=${perfil}`, '--hide-scrollbars', '--no-first-run', 'about:blank'], { stdio: 'ignore' });
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

let ws, id = 0;
const pendientes = new Map();
const eventos = [];
const cdp = (method, params = {}) => new Promise((ok, mal) => {
  const n = ++id;
  pendientes.set(n, { ok, mal });
  ws.send(JSON.stringify({ id: n, method, params }));
});
const evalua = async (expr) => (await cdp('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result.value;
const foto = async (nombre, clip) => {
  const { data } = await cdp('Page.captureScreenshot', { format: 'png', ...(clip ? { clip: { ...clip, scale: 1 } } : {}) });
  writeFileSync(join(salida, nombre), Buffer.from(data, 'base64'));
};
const mouse = (x, y) => cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
const clic = async (x, y) => {
  await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
  await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
};
const centro = (sel) => evalua(`(() => { const r = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width, h: r.height, top: r.y }; })()`);

const resultados = [];
const revisa = (nombre, cond, detalle = '') => resultados.push(`${cond ? 'OK  ' : 'FALLA'} ${nombre}${detalle ? ` — ${detalle}` : ''}`);

try {
  let lista;
  for (let i = 0; i < 40; i++) {
    try { lista = await (await fetch(`http://127.0.0.1:${PUERTO}/json/list`)).json(); break; } catch { await espera(250); }
  }
  const pagina = lista.find((t) => t.type === 'page');
  ws = new WebSocket(pagina.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r));
  ws.addEventListener('message', (m) => {
    const d = JSON.parse(m.data);
    if (d.id && pendientes.has(d.id)) { const p = pendientes.get(d.id); pendientes.delete(d.id); d.error ? p.mal(new Error(d.error.message)) : p.ok(d.result); }
    else if (d.method) eventos.push(d);
  });
  await cdp('Page.enable'); await cdp('Runtime.enable'); await cdp('Log.enable');

  // ---------- escritorio ----------
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await cdp('Page.navigate', { url });
  await espera(3500);
  revisa('sitio.js corrió (sin plazo de 4 s vencido)', await evalua(`!document.documentElement.classList.contains('revelar-todo')`));
  revisa('el muro corre en sus dos filas', await evalua(`document.querySelectorAll('.marquee.is-running').length === 2`));
  revisa('cada fila tiene su copia escondida', await evalua(`[...document.querySelectorAll('.marquee__track')].every(t => t.children.length === 2 && t.children[1].getAttribute('aria-hidden') === 'true')`));
  revisa('las copias no entran al tabulador', await evalua(`[...document.querySelectorAll('.marquee__set[aria-hidden] button')].every(b => b.tabIndex === -1)`));
  revisa('la galería sigue teniendo 19 fotos para lectores de pantalla', await evalua(`document.querySelectorAll('.marquee__set:not([aria-hidden]) .gal__btn').length`) === 19);
  revisa('botón de pausa visible', await evalua(`!document.querySelector('.marquee-toggle').hidden`));

  // versión clara: nada sigue al cursor
  revisa('sin luces ni capas que sigan al cursor', await evalua(`!document.querySelector('[data-follow], [data-depth], .spot')`));
  await foto('portada.png');

  // tarjeta de servicio con el mouse encima
  await evalua(`document.getElementById('servicios').scrollIntoView({ behavior: 'instant' })`); await espera(1200);
  const svc = await centro('.svc');
  await mouse(svc.x - 120, svc.y - 60); await espera(800);
  const sube = await evalua(`getComputedStyle(document.querySelector('.svc')).transform`);
  revisa('la tarjeta de servicio sube con el mouse', sube !== 'none', sube);
  await foto('servicios-hover.png');

  // fila de precios con el mouse encima
  await evalua(`document.getElementById('precios').scrollIntoView({ behavior: 'instant' })`); await espera(1200);
  const fila = await centro('.rows > li:nth-child(2)');
  await mouse(fila.x, fila.y); await espera(600);
  await foto('precios-hover.png');

  // galería: pausa, y foto en grande
  await evalua(`document.getElementById('trabajo').scrollIntoView({ behavior: 'instant' })`); await espera(1200);
  const pausa = await centro('.marquee-toggle');
  await clic(pausa.x, pausa.y); await espera(300);
  revisa('el botón pausa el muro', await evalua(`document.getElementById('trabajo').classList.contains('is-paused') && document.querySelector('.marquee-toggle').getAttribute('aria-pressed') === 'true'`));
  const estado = await evalua(`getComputedStyle(document.querySelector('.marquee__track')).animationPlayState`);
  revisa('la animación queda en pausa', estado === 'paused', estado);
  await clic(pausa.x, pausa.y); await espera(200);
  revisa('el botón la reanuda', await evalua(`!document.getElementById('trabajo').classList.contains('is-paused')`));
  const miniatura = await evalua(`(() => { const b = [...document.querySelectorAll('.marquee__set:not([aria-hidden]) .gal__btn')].find(b => { const r = b.getBoundingClientRect(); return r.left > 100 && r.right < innerWidth - 100 && r.top > 0; }); const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
  await clic(miniatura.x, miniatura.y); await espera(700);
  revisa('la foto se abre en grande', await evalua(`document.getElementById('foto').open && !!document.querySelector('#foto img')`));
  await foto('galeria-dialogo.png');
  await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await espera(400);
  revisa('Esc la cierra', await evalua(`!document.getElementById('foto').open`));

  // el cierre
  await evalua(`document.getElementById('contacto').scrollIntoView({ behavior: 'instant', block: 'center' })`); await espera(1200);
  await foto('cierre.png');

  // todo quedó visible después de recorrer
  await evalua(`window.scrollTo(0, document.body.scrollHeight)`); await espera(1500);
  await evalua(`window.scrollTo(0, 0)`); await espera(300);
  const escondidos = await evalua(`[...document.querySelectorAll('[data-reveal]')].filter(e => !e.classList.contains('is-in')).map(e => e.className).join(' | ')`);
  revisa('todo lo que aparece al bajar se mostró', escondidos === '', escondidos);

  // ---------- celular ----------
  await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await cdp('Emulation.setTouchEmulationEnabled', { enabled: true });
  await cdp('Page.navigate', { url });
  await espera(3000);
  const boton = await centro('.nav__toggle');
  await clic(boton.x, boton.y); await espera(500);
  revisa('el menú del celular abre', await evalua(`document.querySelector('.nav').classList.contains('is-open') && document.querySelector('.nav__toggle').getAttribute('aria-expanded') === 'true'`));
  revisa('el menú se ve', await evalua(`getComputedStyle(document.querySelector('.nav__links')).visibility === 'visible'`));
  await espera(800);
  await foto('celular-menu.png');
  await clic(195, 700); await espera(400);
  revisa('un toque fuera lo cierra', await evalua(`!document.querySelector('.nav').classList.contains('is-open')`));
  revisa('sin desborde horizontal en 390', await evalua(`document.documentElement.scrollWidth <= innerWidth`), String(await evalua('document.documentElement.scrollWidth')));

  const errores = eventos.filter((e) => e.method === 'Runtime.exceptionThrown' || (e.method === 'Log.entryAdded' && e.params.entry.level === 'error'))
    .map((e) => e.params.exceptionDetails?.exception?.description ?? e.params.entry?.text);
  revisa('sin errores en la consola', errores.length === 0, errores.join(' | '));
} catch (e) {
  resultados.push(`FALLA el script: ${e.stack}`);
} finally {
  console.log(resultados.join('\n'));
  ws?.close();
  chrome.kill();
}
