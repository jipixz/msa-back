// /access/return solo puede regresar al front: nunca un open redirect.
const test = require('node:test');
const assert = require('node:assert/strict');
const { safeReturnUrl } = require('../lib/access');

const FRONT = 'https://msafront.jipixz.com';

test('regresa a una página del front con su ruta y query', () => {
  assert.equal(safeReturnUrl(`${FRONT}/predictions?x=1`, FRONT), `${FRONT}/predictions?x=1`);
});

for (const malo of [
  'https://google.com',
  'https://evil.com/',
  'https://msafront.jipixz.com.evil.com/',
  'https://msafront.jipixz.com@evil.com/',
  '//evil.com',
  'javascript:alert(1)',
  'http://msafront.jipixz.com/',
  '',
  undefined
]) {
  test(`rechaza ${JSON.stringify(malo)} y manda a la portada`, () => {
    assert.equal(safeReturnUrl(malo, FRONT), FRONT);
  });
}
