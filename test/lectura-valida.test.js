// Qué lecturas del gateway se guardan en el historial (lib/lectura-valida.js).
const test = require('node:test');
const assert = require('node:assert/strict');
const { esLecturaReal, sinSensores } = require('../lib/lectura-valida');
const { parseSensorData } = require('../lib/parse-sensor-data');
const { evaluateRule, buildMessage } = require('../notifier/rules-engine');
const reglas = require('../notifier/default-rules');

const real = (linea) => ({ ...parseSensorData(linea), source: 'real_sensor', fecha: new Date() });

test('lectura completa: se guarda', () => {
  assert.equal(esLecturaReal(real('HS:45|T1:25.3|T2:26.1|P:1008|HA:80.2|Lux:18400|Rain:0|RainBool:0|Nodo:3|Seq:152')), true);
});

test('falla solo el BME280: se guarda con suelo, lluvia y luz, y anota el sensor', () => {
  const d = real('HS:45|T1:25.3|T2:nan|P:nan|HA:nan|Lux:18400|Rain:0|RainBool:0|Nodo:3|Seq:153|Err:BME280');
  assert.equal(esLecturaReal(d), true);
  assert.equal(d.humedadSuelo, 45);
  assert.equal(d.temperaturaDS, 25.3);
  assert.equal('temperaturaBME' in d, false);
  assert.deepEqual(d.sensoresFallidos, ['BME280']);
});

test('fallan todos los sensores digitales (arnés desconectado): no se guarda', () => {
  const d = real('HS:100|T1:nan|T2:nan|P:nan|HA:nan|Lux:nan|Rain:99|RainBool:1|Nodo:1|Seq:2|Err:DS18B20,BME280,BH1750');
  assert.equal(sinSensores(d), true);
  assert.equal(esLecturaReal(d), false);
});

test('Err solo acepta nombres de sensores conocidos', () => {
  assert.deepEqual(parseSensorData('HS:45|Nodo:1|Err:BME280,<script>,DS18B20').sensoresFallidos, ['BME280', 'DS18B20']);
  assert.equal('sensoresFallidos' in parseSensorData('HS:45|Nodo:1|Err:xyz'), false);
});

test('datos de prueba o sin mediciones: no se guardan', () => {
  assert.equal(esLecturaReal({ humedadSuelo: 40, source: 'real_sensor', isDummy: true }), false);
  assert.equal(esLecturaReal({ humedadSuelo: 40, source: 'generado' }), false);
  assert.equal(esLecturaReal({ nodo: 2, source: 'real_sensor' }), false);
});

test('regla "Sensor sin respuesta": se dispara con Err y nombra los sensores', () => {
  const regla = reglas.find((r) => r.key === 'sensor_sin_respuesta');
  const d = real('HS:45|T1:nan|Nodo:3|Err:DS18B20,BH1750');
  assert.equal(evaluateRule(d, regla), true);
  assert.match(buildMessage(regla, d).body, /DS18B20, BH1750/);
  assert.equal(evaluateRule(real('HS:45|Nodo:3'), regla), false);
});
