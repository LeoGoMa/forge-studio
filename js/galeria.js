// La foto de la galería en grande, en el <dialog> nativo #foto. Esc y el botón «Cerrar» (form method="dialog")
// lo cierran solos; aquí va abrirlo con la foto entera, cerrarlo con un clic fuera de ella y devolver el foco a la
// miniatura que lo abrió (Safari no enfoca un botón al hacerle clic, así que el navegador no lo haría siempre).
const dialogo = document.getElementById('foto');
let miniatura = null;

document.getElementById('trabajo').addEventListener('click', (evento) => {
  const boton = evento.target.closest('.gal__btn');
  if (!boton) return;
  const foto = boton.querySelector('img').cloneNode();
  foto.removeAttribute('loading');
  foto.removeAttribute('style'); // el encuadre de la miniatura; en grande se ve la foto completa
  foto.sizes = '100vw';
  dialogo.append(foto);
  miniatura = boton;
  dialogo.showModal();
});

// un clic en el fondo (::backdrop) llega al propio <dialog>; en la foto o en el botón, no
dialogo.addEventListener('click', (evento) => {
  if (evento.target === dialogo) dialogo.close();
});

dialogo.addEventListener('close', () => {
  dialogo.querySelector('img')?.remove();
  miniatura?.focus({ preventScroll: true }); // la fila corre: desplazarla dejaba un hueco en el bucle
});
