// Lo que falta antes de publicar: el nombre completo del responsable, que Leo todavía no da (spec 10). Desde el
// spec 11 no hay número de WhatsApp ni teléfono, y el nombre va solo en el aviso. Estas pruebas fallan mientras siga
// el marcador y pasan cuando esté el nombre. Se corren aparte, fuera de tests/:
//   node --test "release/*.test.mjs"
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readPage } from '../tests/helpers.mjs';

const NOMBRE = '[NOMBRE COMPLETO DEL RESPONSABLE]';

test('el aviso tiene nombre', () => {
  assert.ok(!readPage('aviso-de-privacidad.html').includes(NOMBRE), `aviso-de-privacidad.html todavía dice ${NOMBRE}`);
});

test('el aviso simplificado tiene nombre', () => {
  assert.ok(!readPage('../docs/plantillas/aviso-simplificado.md').includes(NOMBRE), `docs/plantillas/aviso-simplificado.md todavía dice ${NOMBRE}`);
});
