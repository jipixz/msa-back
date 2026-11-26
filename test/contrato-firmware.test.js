// Contrato firmware ↔ backend: cada línea real del gateway (test/fixtures/paquetes-firmware.txt)
// debe producir lo esperado. Si el firmware cambia de formato, esta prueba avisa.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { parseSensorData } = require('../lib/parse-sensor-data');

const lineas = fs.readFileSync(path.join(__dirname, 'fixtures', 'paquetes-firmware.txt'), 'utf8')
  .split(/\r?\n/)
  .filter((l) => l.trim() && !l.startsWith('#'));

test('hay al menos 4 líneas de ejemplo en el contrato', () => {
  assert.ok(lineas.length >= 4, `solo hay ${lineas.length}`);
});

test('cada paquete con "|" trae humedad del suelo, lluvia y RainBool', () => {
  for (const l of lineas.filter((x) => x.includes('|'))) {
    const r = parseSensorData(l);
    assert.ok(r, `no se pudo parsear: ${l}`);
    assert.equal(typeof r.humedadSuelo, 'number', l);
    assert.equal(typeof r.lluvia, 'number', l);
    assert.equal(typeof r.rainDigital, 'boolean', l);
  }
});

test('el formato de fase 1 incluye el nodo en la misma línea', () => {
  const fase1 = lineas.filter((l) => l.includes('| Nodo:'));
  assert.ok(fase1.length >= 1);
  for (const l of fase1) assert.equal(typeof parseSensorData(l).nodo, 'number', l);
});

test('la línea de métricas de radio solo produce rssi y snr (ningún dato de sensores)', () => {
  for (const l of lineas.filter((x) => x.startsWith('RSSI:'))) {
    assert.deepEqual(Object.keys(parseSensorData(l)).sort(), ['rssi', 'snr']);
  }
});
