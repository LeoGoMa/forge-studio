// Comprueba las correcciones de la revisión: teclado en el muro, cierre del diálogo, menú con teclado, 4K y
// movimiento reducido. Uso, con la página servida en local: node tools/probar-teclado.mjs http://localhost:8765/
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const url = process.argv[2] ?? 'http://localhost:8765/';
const PUERTO = 9334;
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', `--remote-debugging-port=${PUERTO}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), 'forja-kb-'))}`, '--hide-scrollbars', '--no-first-run', 'about:blank'], { stdio: 'ignore' });
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
let ws, id = 0;
const pend = new Map();
const cdp = (method, params = {}) => new Promise((ok, mal) => { const n = ++id; pend.set(n, { ok, mal }); ws.send(JSON.stringify({ id: n, method, params })); });
const ev = async (e) => (await cdp('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true })).result.value;
const tecla = async (key, code, vk, shift = false) => {
  const mods = shift ? 8 : 0;
  await cdp('Input.dispatchKeyEvent', { type: 'rawKeyDown', key, code, windowsVirtualKeyCode: vk, modifiers: mods });
  await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: vk, modifiers: mods });
};
const tab = () => tecla('Tab', 'Tab', 9);
const enter = async () => {
  await cdp('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
  await cdp('Input.dispatchKeyEvent', { type: 'char', key: 'Enter', code: 'Enter', text: '\r', windowsVirtualKeyCode: 13 });
  await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
};
const clic = async (x, y) => {
  await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
  await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
};
const out = [];
const ok = (n, c, d = '') => out.push(`${c ? 'OK  ' : 'FALLA'} ${n}${d ? ` — ${d}` : ''}`);
const abrir = async (w, h, mobile = false) => {
  await cdp('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile });
  await cdp('Page.navigate', { url });
  await espera(3000);
};

try {
  let lista;
  for (let i = 0; i < 40; i++) { try { lista = await (await fetch(`http://127.0.0.1:${PUERTO}/json/list`)).json(); break; } catch { await espera(250); } }
  ws = new WebSocket(lista.find((t) => t.type === 'page').webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r));
  ws.addEventListener('message', (m) => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { const p = pend.get(d.id); pend.delete(d.id); d.error ? p.mal(new Error(d.error.message)) : p.ok(d.result); } });
  await cdp('Page.enable'); await cdp('Runtime.enable');

  // 1. teclado en el muro: después de que la fila corrió un rato, Tab hasta las fotos
  await abrir(1440, 900);
  await ev(`document.getElementById('trabajo').scrollIntoView({ behavior: 'instant' })`);
  await espera(6000);
  await ev(`document.querySelector('.marquee-toggle').focus()`);
  await tab();
  await espera(400);
  let r = await ev(`(() => { const a = document.activeElement, f = a.closest('.marquee'), b = a.getBoundingClientRect(); return { gal: a.classList.contains('gal__btn'), teclado: f?.classList.contains('is-teclado'), left: Math.round(b.left), right: Math.round(b.right) }; })()`);
  ok('Tab entra a la primera foto del muro', r.gal, JSON.stringify(r));
  ok('la fila se detiene en su inicio con el teclado', r.teclado);
  ok('la foto enfocada se ve en la pantalla', r.left >= 0 && r.right <= 1440, `${r.left}..${r.right}`);
  for (let i = 0; i < 6; i++) await tab();
  await espera(400);
  r = await ev(`(() => { const b = document.activeElement.getBoundingClientRect(); return { left: Math.round(b.left), right: Math.round(b.right), gal: document.activeElement.classList.contains('gal__btn') }; })()`);
  ok('seis Tab después, la foto enfocada sigue a la vista', r.gal && r.left >= 0 && r.right <= 1440, JSON.stringify(r));
  const pad = await ev(`getComputedStyle(document.querySelector('.marquee')).paddingTop`);
  ok('la fila deja aire para el anillo de foco', pad === '6px', pad);
  // Enter abre la foto; «Cerrar» con el teclado y el foco vuelve a la foto, a la vista
  await enter(); await espera(500);
  ok('Enter abre la foto en grande', await ev(`document.getElementById('foto').open`));
  await tecla('Escape', 'Escape', 27); await espera(500);
  r = await ev(`(() => { const a = document.activeElement, b = a.getBoundingClientRect(); return { gal: a.classList.contains('gal__btn'), left: Math.round(b.left), right: Math.round(b.right) }; })()`);
  ok('al cerrar, el foco vuelve a la foto y se ve', r.gal && r.left >= 0 && r.right <= 1440, JSON.stringify(r));
  // al salir del muro, la fila vuelve a correr sin quedar desplazada
  await ev(`document.querySelector('.cierre a').focus()`); await espera(300);
  r = await ev(`[...document.querySelectorAll('.marquee')].map(f => ({ sl: f.scrollLeft, t: f.classList.contains('is-teclado'), a: getComputedStyle(f.querySelector('.marquee__track')).animationName }))`);
  ok('al salir el foco, las filas vuelven a correr desde su lugar', r.every((f) => f.sl === 0 && !f.t && f.a === 'marquee'), JSON.stringify(r));

  // 2. con el mouse: abrir una foto, esperar, cerrar con «Cerrar»: la fila no queda desplazada
  await ev(`document.getElementById('trabajo').scrollIntoView({ behavior: 'instant' })`); await espera(800);
  const m = await ev(`(() => { const b = [...document.querySelectorAll('.marquee__set[aria-hidden] .gal__btn')].find(b => { const r = b.getBoundingClientRect(); return r.left > 100 && r.right < innerWidth - 100 && r.top > 0; }) || document.querySelector('.gal__btn'); const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
  await clic(m.x, m.y); await espera(3000);
  const cerrar = await ev(`(() => { const r = document.querySelector('#foto button').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
  await clic(cerrar.x, cerrar.y); await espera(400);
  r = await ev(`[...document.querySelectorAll('.marquee')].map(f => f.scrollLeft)`);
  ok('cerrar la foto no desplaza la fila', r.every((s) => s === 0), JSON.stringify(r));

  // 3. menú del celular con teclado
  await abrir(390, 844, true);
  await ev(`document.querySelector('.nav__toggle').focus()`);
  await enter(); await espera(400);
  ok('Enter abre el menú y el foco pasa al primer enlace', await ev(`document.querySelector('.nav').classList.contains('is-open') && document.activeElement.matches('.nav__links a:first-child')`));
  // un Tab por cada enlace después del primero, sin importar cuántos tenga el menú
  for (let i = 1, n = await ev(`document.querySelectorAll('.nav__links a').length`); i < n; i++) await tab();
  await espera(100);
  ok('Tab recorre los enlaces del menú', await ev(`document.activeElement.matches('.nav__links a:last-child')`));
  await tab(); await tab(); await tab(); await espera(300);
  r = await ev(`({ dentro: document.querySelector('.nav').contains(document.activeElement), abierto: document.querySelector('.nav').classList.contains('is-open') })`);
  ok('al salir el foco de la barra, el menú se cierra', !r.dentro && !r.abierto, JSON.stringify(r));

  // 4. 4K: copias suficientes, sin hueco
  await abrir(3840, 2160);
  r = await ev(`[...document.querySelectorAll('.marquee')].map(f => ({ copias: getComputedStyle(f).getPropertyValue('--copias'), juego: Math.round(f.querySelector('.marquee__set').getBoundingClientRect().width), sets: f.querySelectorAll('.marquee__set').length }))`);
  ok('en 4K cada fila cubre la pantalla durante todo el ciclo', r.every((f) => f.sets * f.juego - f.juego >= 3840 && String(f.sets) === f.copias.trim()), JSON.stringify(r));

  // 5. movimiento reducido
  await cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await abrir(1440, 900);
  r = await ev(`({ scroll: getComputedStyle(document.documentElement).scrollBehavior, corre: document.querySelectorAll('.marquee.is-running').length })`);
  ok('con movimiento reducido: sin desplazamiento suave y el muro quieto', r.scroll === 'auto' && r.corre === 0, JSON.stringify(r));
} catch (e) {
  out.push(`FALLA el script: ${e.stack}`);
} finally {
  console.log(out.join('\n'));
  ws?.close();
  chrome.kill();
}
