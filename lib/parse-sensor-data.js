// Parser de las líneas que el gateway LoRa manda por Serial (formato del firmware:
// "HS:45% | T1:25.3C | T2:26.1C | P:1008hPa | HA:80.2% | Lux:1234lx | Rain:0% | RainBool:NO | Nodo:0").
// Extraído de index.js para poder probarlo sin abrir el puerto serial.
function parseSensorData(raw) {
  const map = {
    HS: 'humedadSuelo',
    T1: 'temperaturaDS',
    T2: 'temperaturaBME',
    P: 'presion',
    HA: 'humedadAire',
    Lux: 'luminosidad',
    Rain: 'lluvia',
    RainBool: 'rainDigital', // Lluvia digital (sí/no); el nodo la manda como RainBool
    Nodo: 'nodo' // Nuevo campo para identificar el nodo
  };

  const result = {};
  
  // Limpiar la línea de caracteres no deseados
  const cleanedRaw = raw.replace(/[\r\n\t]/g, '').trim();
  
  // Intentar parsear como línea completa con separadores |
  if (cleanedRaw.includes('|')) {
    const parts = cleanedRaw.split('|').map(p => p.trim());
    
    for (const part of parts) {
      const colonIndex = part.indexOf(':');
      if (colonIndex === -1) continue;
      
      const key = part.substring(0, colonIndex).trim();
      const valueRaw = part.substring(colonIndex + 1).trim();
      
      if (!map[key]) continue;
      let value = valueRaw;

      // Limpieza y conversión de valores
      if (key === 'HS' || key === 'HA' || key === 'Rain') {
        value = parseFloat(value.replace('%', ''));
      } else if (key === 'T1' || key === 'T2') {
        value = parseFloat(value.replace('C', ''));
      } else if (key === 'P') {
        value = parseInt(value.replace('hPa', ''));
      } else if (key === 'Lux') {
        value = parseInt(value.replace('lx', ''));
      } else if (key === 'RainBool') {
        value = value.toUpperCase().includes('SI') || value.toUpperCase().includes('YES') || value === '1' || value === 'true';
      } else if (key === 'Nodo') {
        value = parseInt(value);
      }
      
      // Validar que el valor sea un número válido (excepto para rainDigital)
      if (key !== 'RainBool' && (isNaN(value) || value === null || value === undefined)) {
        continue; // Saltar valores inválidos
      }
      
      result[map[key]] = value;
    }
  } else {
    // Intentar parsear como dato individual (formato: "KEY:VALUE")
    const colonIndex = cleanedRaw.indexOf(':');
    if (colonIndex !== -1) {
      const key = cleanedRaw.substring(0, colonIndex).trim();
      const valueRaw = cleanedRaw.substring(colonIndex + 1).trim();
      
      if (map[key]) {
        let value = valueRaw;
        
        // Limpieza y conversión de valores
        if (key === 'HS' || key === 'HA' || key === 'Rain') {
          value = parseFloat(value.replace('%', ''));
        } else if (key === 'T1' || key === 'T2') {
          value = parseFloat(value.replace('C', ''));
        } else if (key === 'P') {
          value = parseInt(value.replace('hPa', ''));
        } else if (key === 'Lux') {
          value = parseInt(value.replace('lx', ''));
        } else if (key === 'RainBool') {
          value = value.toUpperCase().includes('SI') || value.toUpperCase().includes('YES') || value === '1' || value === 'true';
        } else if (key === 'Nodo') {
          value = parseInt(value);
        }
        
        // Validar que el valor sea un número válido (excepto para rainDigital)
        if (key !== 'RainBool' && (isNaN(value) || value === null || value === undefined)) {
          return null; // Valor inválido
        }
        
        result[map[key]] = value;
      }
    }
  }

  // Solo retornar si tenemos al menos algunos datos válidos
  if (Object.keys(result).length === 0) {
    return null;
  }

  return result;
}

module.exports = { parseSensorData };
