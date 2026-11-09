// Comportamiento compartido de index.html y del aviso (spec 12). Sin librerías: todo es una mejora sobre una página
// que ya funciona sin JavaScript (el menú se abre con su botón, el resto solo agrega movimiento discreto).
const conMovimiento = matchMedia('(prefers-reduced-motion: no-preference)').matches;

// El script del <head> esconde lo que aparece al bajar y pone un plazo de 4 s; ya llegamos, así que se cancela.
clearTimeout(window.__revelar);

/* 1. Navegación: el menú de celular y la barra más sólida al bajar */
const nav = document.querySelector('.nav');
if (nav) {
  const boton = nav.querySelector('.nav__toggle');
  const cerrar = () => {
    nav.classList.remove('is-open');
    boton?.setAttribute('aria-expanded', 'false');
  };
  boton?.addEventListener('click', () => {
    const abierto = nav.classList.toggle('is-open');
    boton.setAttribute('aria-expanded', String(abierto));
    // los enlaces van antes del botón en el HTML: sin esto, Tab saltaría del botón al contenido con el menú abierto
    if (abierto) nav.querySelector('.nav__links a')?.focus();
  });
  nav.addEventListener('focusout', (e) => { if (nav.classList.contains('is-open') && !nav.contains(e.relatedTarget)) cerrar(); });
  nav.addEventListener('click', (e) => { if (e.target.closest('.nav__links a')) cerrar(); });
  document.addEventListener('click', (e) => { if (nav.classList.contains('is-open') && !nav.contains(e.target)) cerrar(); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && nav.classList.contains('is-open')) { cerrar(); boton?.focus(); }
  });
  const alBajar = () => nav.classList.toggle('is-scrolled', scrollY > 24);
  alBajar();
  addEventListener('scroll', alBajar, { passive: true });
}

/* 2. Lo que aparece al bajar: una sola vez, cuando entra a la pantalla */
const aparecen = document.querySelectorAll('[data-reveal]');
if ('IntersectionObserver' in window) {
  const io = new IntersectionObserver((entradas) => {
    for (const e of entradas) {
      if (!e.isIntersecting) continue;
      e.target.classList.add('is-in');
      io.unobserve(e.target);
    }
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.06 });
  aparecen.forEach((el) => io.observe(el));
} else {
  aparecen.forEach((el) => el.classList.add('is-in'));
}

/* 3. El muro de fotos: cada fila se copia las veces que pida la pantalla y corre en bucle (las copias se esconden a
   los lectores de pantalla y salen del orden del tabulador). Se detiene con el mouse encima, con el foco dentro, con el botón de pausa
   (WCAG 2.2.2) y cuando la sección no se ve. Con movimiento reducido se queda como fila que se desliza a mano. */
const trabajo = document.getElementById('trabajo');
if (trabajo && conMovimiento) {
  for (const fila of trabajo.querySelectorAll('[data-marquee]')) {
    const pista = fila.querySelector('.marquee__track');
    const juego = pista.querySelector('.marquee__set');
    const ancho = juego.getBoundingClientRect().width;
    // copias suficientes para que, al correr un juego completo, la pantalla nunca quede con hueco (4K incluida)
    const copias = Math.max(2, Math.ceil(innerWidth / ancho) + 1);
    for (let i = 1; i < copias; i++) {
      const copia = juego.cloneNode(true);
      copia.setAttribute('aria-hidden', 'true');
      copia.querySelectorAll('button, a').forEach((el) => { el.tabIndex = -1; });
      copia.querySelectorAll('[id]').forEach((el) => el.removeAttribute('id'));
      pista.append(copia);
    }
    fila.style.setProperty('--copias', String(copias));
    // unos 40 px por segundo, sea cual sea el ancho de la fila
    fila.style.setProperty('--dur', `${Math.max(40, Math.round(ancho / 40))}s`);
    fila.classList.add('is-running');
    // con el teclado, la fila se detiene en su inicio y el navegador lleva a la vista la foto enfocada; al salir el
    // foco, vuelve a su lugar (si queda desplazada, el bucle deja un hueco)
    fila.addEventListener('focusin', (e) => {
      if (!e.target.matches(':focus-visible')) return;
      fila.classList.add('is-teclado');
      // el navegador ya desplazó la fila con la pista animada; sin la animación, la foto se vuelve a traer a la vista
      requestAnimationFrame(() => e.target.scrollIntoView({ block: 'nearest', inline: 'center' }));
    });
    fila.addEventListener('focusout', (e) => {
      if (fila.contains(e.relatedTarget)) return;
      fila.classList.remove('is-teclado');
      fila.scrollLeft = 0;
    });
  }
  const pausa = trabajo.querySelector('.marquee-toggle');
  if (pausa) {
    pausa.hidden = false;
    pausa.addEventListener('click', () => pausa.setAttribute('aria-pressed', String(trabajo.classList.toggle('is-paused'))));
  }
  if ('IntersectionObserver' in window) {
    new IntersectionObserver((entradas) => trabajo.classList.toggle('is-offscreen', !entradas.at(-1).isIntersecting)).observe(trabajo);
  }
}
