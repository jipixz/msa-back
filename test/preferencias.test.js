// Preferencias de interfaz por usuario: solo se aceptan datos con la forma esperada.
const test = require('node:test');
const assert = require('node:assert/strict');
const { validarPreferencias } = require('../lib/preferencias');

const BASE = { estilo: 'c01-senal', variante: 'claro', modo: 'claro' };

test('acepta una preferencia completa y normaliza los colores', () => {
  const r = validarPreferencias({ ...BASE, per: { 'c06-suizo': { fondo: 'oled', acento: '#FF5F1F', acento2: null } } });
  assert.deepEqual(r, { ...BASE, per: { 'c06-suizo': { fondo: 'oled', acento: '#ff5f1f', acento2: null } } });
});

test('per es opcional', () => {
  assert.deepEqual(validarPreferencias(BASE), { ...BASE, per: {} });
});

test('descarta campos desconocidos', () => {
  const r = validarPreferencias({ ...BASE, role: 'admin', $where: '1' });
  assert.equal('role' in r, false);
  assert.equal('$where' in r, false);
});

for (const [nombre, malo] of [
  ['sin objeto', null],
  ['arreglo', []],
  ['estilo con inyección', { ...BASE, estilo: '{"$gt":""}' }],
  ['modo inválido', { ...BASE, modo: 'sepia' }],
  ['fondo desconocido', { ...BASE, per: { 'c01-senal': { fondo: 'rosa', acento: null, acento2: null } } }],
  ['color no hex', { ...BASE, per: { 'c01-senal': { fondo: 'oled', acento: 'red', acento2: null } } }],
  ['id de estilo inválido en per', { ...BASE, per: { '__proto__x': { fondo: 'oled' } } }],
  ['demasiado grande', { ...BASE, relleno: 'x'.repeat(9000) }],
]) {
  test(`rechaza: ${nombre}`, () => {
    assert.equal(validarPreferencias(malo), null);
  });
}

test('rechaza más de 40 estilos personalizados', () => {
  const per = {};
  for (let i = 0; i < 41; i++) per[`c${String(i).padStart(2, '0')}-x${'a'.repeat(2)}`] = { fondo: 'estilo', acento: null, acento2: null };
  assert.equal(validarPreferencias({ ...BASE, per }), null);
});
