// ¿Se guarda una lectura del gateway? Antes se exigía el BME280 (temperatura y humedad del
// aire): si solo fallaba ese sensor se perdían la humedad del suelo, la lluvia y lo demás.
// Ahora se guarda si hay al menos una medición válida, con dos excepciones:
//  - datos generados o de prueba (isDummy / generated / source distinto de real_sensor);
//  - el nodo reporta que fallaron TODOS sus sensores digitales (DS18B20, BME280 y BH1750):
//    eso indica el arnés de sensores desconectado, y entonces los analógicos (suelo, lluvia)
//    son un pin al aire (p. ej. HS:100, Rain:99) y no deben llegar al historial.

const MEDICIONES = ['humedadSuelo', 'temperaturaDS', 'temperaturaBME', 'presion', 'humedadAire', 'luminosidad', 'lluvia'];
const SENSORES_DIGITALES = ['DS18B20', 'BME280', 'BH1750'];

function sinSensores(data) {
  const fallidos = Array.isArray(data.sensoresFallidos) ? data.sensoresFallidos : [];
  return SENSORES_DIGITALES.every((s) => fallidos.includes(s));
}

function esLecturaReal(data) {
  if (!data || data.isDummy || data.generated || data.source !== 'real_sensor') return false;
  if (sinSensores(data)) return false;
  return MEDICIONES.some((c) => typeof data[c] === 'number' && Number.isFinite(data[c]));
}

module.exports = { esLecturaReal, sinSensores, MEDICIONES, SENSORES_DIGITALES };
