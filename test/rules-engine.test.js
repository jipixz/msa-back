// Motor de reglas del notifier: condiciones, nodos, cooldown y plantillas.
const test = require('node:test');
const assert = require('node:assert/strict');
const { evaluateRule, isInCooldown, buildMessage, renderTemplate } = require('../notifier/rules-engine');
const reglasPorDefecto = require('../notifier/default-rules');

const sueloSeco = { enabled: true, nodes: [], match: 'all', conditions: [{ field: 'humedadSuelo', op: '<', value: 30 }], cooldownMinutes: 60 };

test('suelo seco: dispara con 21 % y no con 41 %', () => {
  assert.equal(evaluateRule({ humedadSuelo: 21, nodo: 4 }, sueloSeco), true);
  assert.equal(evaluateRule({ humedadSuelo: 41, nodo: 3 }, sueloSeco), false);
});

test('un campo ausente (sensor fallido) nunca dispara la regla', () => {
  assert.equal(evaluateRule({ nodo: 7 }, sueloSeco), false);
});

test('regla deshabilitada o sin condiciones no dispara', () => {
  assert.equal(evaluateRule({ humedadSuelo: 1 }, { ...sueloSeco, enabled: false }), false);
  assert.equal(evaluateRule({ humedadSuelo: 1 }, { ...sueloSeco, conditions: [] }), false);
});

test('filtro por nodos', () => {
  const soloN4 = { ...sueloSeco, nodes: [4] };
  assert.equal(evaluateRule({ humedadSuelo: 10, nodo: 4 }, soloN4), true);
  assert.equal(evaluateRule({ humedadSuelo: 10, nodo: 2 }, soloN4), false);
});

test('match "any" vs "all" y operadores between/outside/is_true', () => {
  const r = { enabled: true, match: 'any', conditions: [{ field: 'temperaturaBME', op: 'outside', value: [21, 32] }, { field: 'rainDigital', op: 'is_true' }] };
  assert.equal(evaluateRule({ temperaturaBME: 35 }, r), true);
  assert.equal(evaluateRule({ temperaturaBME: 25, rainDigital: true }, r), true);
  assert.equal(evaluateRule({ temperaturaBME: 25, rainDigital: false }, r), false);
  assert.equal(evaluateRule({ temperaturaBME: 25 }, { ...r, match: 'all', conditions: [{ field: 'temperaturaBME', op: 'between', value: [21, 32] }] }), true);
});

test('cooldown: dentro de la ventana sí, fuera no', () => {
  assert.equal(isInCooldown({ cooldownMinutes: 60, lastTriggered: new Date(Date.now() - 10 * 60e3) }), true);
  assert.equal(isInCooldown({ cooldownMinutes: 60, lastTriggered: new Date(Date.now() - 61 * 60e3) }), false);
  assert.equal(isInCooldown({ cooldownMinutes: 60 }), false);
});

test('plantillas: enteros sin decimales, flotantes con uno, faltantes vacíos', () => {
  assert.equal(renderTemplate('N{{nodo}} {{humedadSuelo}}% {{temperaturaBME}}°C {{nada}}', { nodo: 4, humedadSuelo: 21, temperaturaBME: 27.94 }), 'N4 21% 27.9°C ');
  assert.equal(buildMessage({ name: 'X', message: {} }, {}).title, 'X');
});

test('reglas por defecto: claves únicas y todas con condiciones válidas', () => {
  const claves = reglasPorDefecto.map((r) => r.key);
  assert.equal(new Set(claves).size, claves.length, 'claves repetidas');
  for (const r of reglasPorDefecto) {
    assert.ok(Array.isArray(r.conditions) && r.conditions.length > 0, r.key);
    assert.ok(r.cooldownMinutes > 0, `${r.key} sin cooldown`);
  }
});

test('decisión: el umbral de riego de las reglas por defecto es 30 % (igual que el firmware y la UI)', () => {
  const seco = reglasPorDefecto.find((r) => r.conditions.some((c) => c.field === 'humedadSuelo' && c.op === '<'));
  assert.ok(seco, 'no hay regla de suelo seco');
  assert.equal(seco.conditions.find((c) => c.field === 'humedadSuelo').value, 30);
});
