// Los botones de contacto ([data-cta="contacto"]) traen en el HTML un mailto que funciona sin JavaScript. Aquí se les
// agrega al asunto la etiqueta del canal de donde llegó el visitante (utm_source), por ejemplo «(ref: ig)» (spec 7),
// sin ninguna herramienta de analítica.
import { CONTACT } from './config.js';

// utm_source llega de la URL: solo pasa una etiqueta corta de letras, números y guiones, en minúsculas.
export function refFromSearch(search) {
  const ref = (new URLSearchParams(search).get('utm_source') ?? '').toLowerCase();
  return /^[a-z0-9-]{1,20}$/.test(ref) ? ref : '';
}

export function contactHref({ email, ref }) {
  return `mailto:${email}?subject=${encodeURIComponent('Quiero cotizar' + (ref ? ` (ref: ${ref})` : ''))}`;
}

export function applyContactLinks(root, config, search) {
  const href = contactHref({ email: config.email, ref: refFromSearch(search) });
  for (const link of root.querySelectorAll('[data-cta="contacto"]')) link.setAttribute('href', href);
}

// En Node (las pruebas importan este módulo) no hay document.
if (typeof document !== 'undefined') applyContactLinks(document, CONTACT, location.search);
