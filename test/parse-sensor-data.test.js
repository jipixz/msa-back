// Pruebas del parser de líneas seriales del gateway LoRa (node --test, sin dependencias).
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseSensorData } = require('../lib/parse-sensor-data');

test('paquete completo en una línea: todas las claves mapeadas a campos de Mongo', () => {
  const r = parseSensorData('HS:41% | T1:26.8C | T2:29.1C | P:1009hPa | HA:81.0% | Lux:18400lx | Rain:0% | RainBool:NO | Nodo:3');
  assert.deepEqual(r, {
    humedadSuelo: 41, temperaturaDS: 26.8, temperaturaBME: 29.1, presion: 1009,
    humedadAire: 81, luminosidad: 18400, lluvia: 0, rainDigital: false, nodo: 3
  });
});

test('RainBool: SI → true, NO → false (decisión: la clave es RainBool, no RainD)', () => {
  assert.equal(parseSensorData('HS:40% | RainBool:SI').rainDigital, true);
  assert.equal(parseSensorData('HS:40% | RainBool: NO').rainDigital, false);
  assert.equal(parseSensorData('HS:40% | RainD:SI').rainDigital, undefined);
});

test('valores "nan" de sensores fallidos se descartan y el resto se conserva', () => {
  const r = parseSensorData('HS:55% | T1:nanC | T2:nanC | P:nanhPa | HA:nan% | Lux:nanlx | Rain:10% | RainBool:NO | Nodo:0 | Err:DS18B20,BME280');
  assert.equal(r.humedadSuelo, 55);
  assert.equal(r.lluvia, 10);
  assert.equal(r.nodo, 0);
  for (const campo of ['temperaturaDS', 'temperaturaBME', 'presion', 'humedadAire', 'luminosidad']) {
    assert.equal(campo in r, false, `${campo} no debería guardarse`);
  }
});

test('claves desconocidas (Err, RSSI) se ignoran', () => {
  assert.equal(parseSensorData('RSSI:-97.00,SNR:6.50'), null);
  assert.equal('Err' in (parseSensorData('HS:40% | Err:BME280') || {}), false);
});

test('firmware anterior: "Nodo: 0" en una línea aparte se parsea solo', () => {
  assert.deepEqual(parseSensorData('Nodo: 0'), { nodo: 0 });
});

test('líneas vacías, basura y retornos de carro no rompen el parser', () => {
  assert.equal(parseSensorData(''), null);
  assert.equal(parseSensorData('ets Jul 29 2019 12:21:46'), null);
  assert.equal(parseSensorData('HS:40%\r').humedadSuelo, 40);
});

// Decisión: valores fuera del rango físico se descartan (la auditoría encontró 700 % guardado
// en Mongo por un ADC al aire). El resto del paquete se conserva.
test('humedad fuera de 0–100 % se descarta (dato imposible)', () => {
  assert.equal(parseSensorData('HS:700%'), null);
  const r = parseSensorData('HS:700% | T1:26.1C | Nodo:2');
  assert.equal('humedadSuelo' in r, false);
  assert.equal(r.temperaturaDS, 26.1);
  assert.equal(r.nodo, 2);
});

test('rangos: presión 99 hPa y temperatura -127 °C (DS18B20 desconectado) se descartan', () => {
  assert.deepEqual(parseSensorData('HS:40% | T1:-127.0C | P:99hPa'), { humedadSuelo: 40 });
});

test('límites incluidos: 0 % y 100 % son válidos', () => {
  assert.equal(parseSensorData('HS:0%').humedadSuelo, 0);
  assert.equal(parseSensorData('HS:100%').humedadSuelo, 100);
});
