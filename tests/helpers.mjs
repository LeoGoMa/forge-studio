import { readFileSync } from 'node:fs';

// Las páginas viven en la raíz del repo, un nivel arriba de tests/, sin importar desde dónde se corra.
export const readPage = (name) => readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');

// Valor de un atributo dentro de una etiqueta de apertura (undefined si no está).
export const attr = (tag, name) => new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1];
// Etiquetas de apertura de un elemento, en orden.
export const tags = (html, name) => html.match(new RegExp(`<${name}\\b[^>]*>`, 'g')) ?? [];
// Texto sin etiquetas y con los espacios colapsados.
export const text = (html) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

// Devuelve el <section id="…">…</section> completo, contando secciones anidadas, o lanza un error.
export function section(html, id) {
  const open = new RegExp(`<section\\b[^>]*\\sid="${id}"[^>]*>`).exec(html);
  if (!open) throw new Error(`no existe <section id="${id}">`);
  const tags = /<\/?section\b[^>]*>/g;
  tags.lastIndex = open.index + open[0].length;
  let depth = 1;
  for (let m; (m = tags.exec(html)); ) {
    depth += m[0].startsWith('</') ? -1 : 1;
    if (depth === 0) return html.slice(open.index, m.index + m[0].length);
  }
  throw new Error(`<section id="${id}"> no se cierra`);
}
