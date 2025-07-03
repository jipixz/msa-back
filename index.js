const express = require('express');
const cors = require('cors');
const { SerialPort } = require('serialport');
const path = require('path');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require('socket.io');
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});
require('dotenv').config();

// Comentar esta línea ya que no tienes archivos estáticos en el backend
// app.use(express.static(path.join(__dirname, 'build')));

app.use(cors());
app.use(express.json());

// Variable para almacenar datos en memoria (temporal, hasta que MongoDB esté configurado)
const datosHumedad = [];

// Inicializar MongoDB si está disponible
let mongoose;
let Humedad;
try {
  mongoose = require('mongoose');
  
  // MongoDB connection
  mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/humedad-cacao', {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  }).then(() => {
    console.log('✅ Conectado a MongoDB');
    
    // Esquema
    const humedadSchema = new mongoose.Schema({
      humedadSuelo: Number,      // HS - Sensor capacitivo
      temperaturaDS: Number,     // T1 - DS18B20
      temperaturaBME: Number,    // T2 - BME280
      presion: Number,           // P - BME280
      humedadAire: Number,       // HA - BME280
      luminosidad: Number,       // Lux - BH1750
      lluvia: Number,            // Rain - YL-83
      alerta: Boolean,           // Alert - Valor booleano
      fecha: { type: Date, default: Date.now }
    });
    Humedad = mongoose.model('Humedad', humedadSchema);
  }).catch(err => {
    console.error('❌ Error al conectar con MongoDB:', err);
    console.log('⚠️ Funcionando en modo de almacenamiento en memoria');
  });
} catch (error) {
  console.error('❌ Error al cargar MongoDB:', error);
  console.log('⚠️ Funcionando en modo de almacenamiento en memoria');
}

// WebSocket connection
io.on('connection', (socket) => {
  console.log('🔌 Nuevo cliente conectado');
  
  socket.on('disconnect', () => {
    console.log('🔌 Cliente desconectado');
  });
});

// Variables para la conexión serial
let port = null;
let serialConnected = false;
let reconnectTimer = null;
const RECONNECT_INTERVAL = 5000; // Tiempo entre intentos de reconexión (5 segundos)
let buffer = '';

// Variable para registrar la última vez que se recibieron datos
let lastDataReceived = null;
let rawDataLog = [];
const MAX_RAW_LOG_SIZE = 20; // Mantener solo las últimas 20 entradas

// Función para configurar el puerto serial
function setupSerialPort() {
  try {
    const serialPath = process.env.USB_PORT || '/dev/ttyUSB0'; // Puerto predeterminado para Linux
    
    console.log(`🔄 Intentando conectar al puerto serial: ${serialPath}`);
    
    port = new SerialPort({
      path: serialPath,
      baudRate: 115200,
    });

    port.on('open', () => {
      serialConnected = true;
      console.log(`✅ Conexión establecida con el puerto serial: ${serialPath}`);
      
      // Si había un temporizador de reconexión, lo eliminamos
      if (reconnectTimer) {
        clearInterval(reconnectTimer);
        reconnectTimer = null;
      }
    });

    port.on('data', async (data) => {
      // Registrar el momento en que se recibieron datos
      lastDataReceived = new Date();
      
      // Mostrar los datos recibidos en formato crudo (hexadecimal y texto)
      let hexData = '';
      for (let i = 0; i < data.length; i++) {
        hexData += data[i].toString(16).padStart(2, '0') + ' ';
      }
      
      /* console.log('🔍 DATOS CRUDOS:');
      console.log(`🔍 HEX: ${hexData}`);
      console.log(`🔍 TEXTO: "${data.toString()}"`); */
      
      // Añadir los datos recibidos al buffer
      const rawData = data.toString();
      buffer += rawData;
      
      // Buscar líneas completas en el buffer
      let lines = buffer.split('\n');
      // Si tenemos al menos una línea completa (terminada en \n)
      if (lines.length > 1) {
        // La última línea podría estar incompleta, se guarda para el próximo procesamiento
        buffer = lines.pop();
        
        //console.log(`🔍 Procesando ${lines.length} líneas completas`);
        
        for (const line of lines) {
          // Ignorar mensajes de control de RadioLib, RSSI y SNR
          if (line.includes("[RadioLib]") || line.includes("RSSI:") || line.includes("SNR:")) {
            //console.log("ℹ️ Mensaje de control ignorado");
            continue;
          }
          
          // Si es una línea de datos (comienza con "RX:")
          if (line.includes("RX:") || line.includes("HS:")) {
            // Limpiar el prefijo RX: si existe
            let cleanLine = line;
            if (line.includes("RX:")) {
              cleanLine = line.replace("RX:", "").trim();
            }
            console.log(`📡 Datos recibidos: "${cleanLine}"`);
            
            // Limpiar caracteres especiales que pueden aparecer en los valores
            const sanitizedLine = cleanLine.replace(/[^\x20-\x7E]/g, '');
            
            // Expresiones regulares para el nuevo formato
            const humMatch = sanitizedLine.match(/HS:?\s*(\d+(?:\.\d+)?)\s*%/i);
            const temp1Match = sanitizedLine.match(/T1:?\s*(-?\d+(?:\.\d+)?)\s*C/i);
            const temp2Match = sanitizedLine.match(/T2:?\s*(-?\d+(?:\.\d+)?)\s*C/i);
            const presionMatch = sanitizedLine.match(/P:?\s*(\d+(?:\.\d+)?)\s*(?:h|H)?[Pp][Aa]/i);
            const humAireMatch = sanitizedLine.match(/HA:?\s*(\d+(?:\.\d+)?)\s*%/i);
            const luxMatch = sanitizedLine.match(/Lux:?\s*(\d+(?:\.\d+)?)\s*lx/i);
            const rainMatch = sanitizedLine.match(/Rain:?\s*(\d+(?:\.\d+)?)\s*%/i);
            const alertMatch = sanitizedLine.match(/Alert:?\s*(SI|NO)/i);
            
            // Filtrar valores no válidos (-127, nan, etc.)
            const isValidValue = (val) => {
              if (val === null || val === undefined) return false;
              if (isNaN(val)) return false;
              // -127 suele ser un valor de error para sensores como DS18B20
              if (val === -127 || val === -127.0) return false;
              return true;
            };
            
            // Registrar solo la información importante
            const datosEncontrados = [];
            if (humMatch) datosEncontrados.push(`HS: ${humMatch[1]}%`);
            if (temp1Match && isValidValue(parseFloat(temp1Match[1]))) datosEncontrados.push(`T1:${temp1Match[1]}C`);
            if (temp2Match && isValidValue(parseFloat(temp2Match[1]))) datosEncontrados.push(`T2:${temp2Match[1]}C`);
            if (presionMatch && isValidValue(parseFloat(presionMatch[1]))) datosEncontrados.push(`P:${presionMatch[1]}hPa`);
            if (humAireMatch && isValidValue(parseFloat(humAireMatch[1]))) datosEncontrados.push(`HA:${humAireMatch[1]}%`);
            if (luxMatch && isValidValue(parseFloat(luxMatch[1]))) datosEncontrados.push(`Lux: ${luxMatch[1]}lx`);
            if (rainMatch && isValidValue(parseFloat(rainMatch[1]))) datosEncontrados.push(`Rain:${rainMatch[1]}%`);
            if (alertMatch) datosEncontrados.push(`Alert: ${alertMatch[1]}`);
            
            if (datosEncontrados.length > 0) {
              console.log(`📊 Valores válidos detectados: ${datosEncontrados.join(', ')}`);
            }
            
            // Si encontramos al menos la humedad del suelo o algún otro valor, procesamos
            if (humMatch || temp1Match || temp2Match || presionMatch || humAireMatch || luxMatch || rainMatch || alertMatch) {
              // Extraer valores
              const humedadSuelo = humMatch ? parseFloat(humMatch[1]) : null;
              
              // Verificar que los valores son válidos (no son NaN o -127)
              const temperaturaDS = temp1Match && isValidValue(parseFloat(temp1Match[1])) 
                ? parseFloat(temp1Match[1]) 
                : null;
              
              const temperaturaBME = temp2Match && isValidValue(parseFloat(temp2Match[1])) 
                ? parseFloat(temp2Match[1]) 
                : null;
              
              const presion = presionMatch && isValidValue(parseFloat(presionMatch[1])) 
                ? parseFloat(presionMatch[1]) 
                : null;
              
              const humedadAire = humAireMatch && isValidValue(parseFloat(humAireMatch[1])) 
                ? parseFloat(humAireMatch[1]) 
                : null;
              
              const luminosidad = luxMatch && isValidValue(parseFloat(luxMatch[1])) 
                ? parseFloat(luxMatch[1]) 
                : null;
              
              const lluvia = rainMatch && isValidValue(parseFloat(rainMatch[1])) 
                ? parseFloat(rainMatch[1]) 
                : null;
              
              // Para la alerta, convertir "SI" a true y "NO" a false
              const alerta = alertMatch 
                ? alertMatch[1].toUpperCase() === 'SI' 
                : null;
              
              console.log(`📡 Datos procesados: 
                Humedad suelo: ${humedadSuelo !== null ? humedadSuelo + '%' : 'N/A'}, 
                Temp DS: ${temperaturaDS !== null ? temperaturaDS + '°C' : 'N/A'}, 
                Temp BME: ${temperaturaBME !== null ? temperaturaBME + '°C' : 'N/A'}, 
                Presión: ${presion !== null ? presion + 'hPa' : 'N/A'}, 
                Humedad aire: ${humedadAire !== null ? humedadAire + '%' : 'N/A'},
                Luminosidad: ${luminosidad !== null ? luminosidad + 'lx' : 'N/A'},
                Lluvia: ${lluvia !== null ? lluvia + '%' : 'N/A'},
                Alerta: ${alerta !== null ? (alerta ? 'SI' : 'NO') : 'N/A'}`);
              
              // Guardar en MongoDB si está disponible, o en memoria si no
              if (Humedad) {
                // Crear un objeto solo con los valores válidos
                const datosLectura = {};
                
                // Añadir solo los valores válidos
                if (humedadSuelo !== null) datosLectura.humedadSuelo = humedadSuelo;
                if (temperaturaDS !== null) datosLectura.temperaturaDS = temperaturaDS;
                if (temperaturaBME !== null) datosLectura.temperaturaBME = temperaturaBME;
                if (presion !== null) datosLectura.presion = presion;
                if (humedadAire !== null) datosLectura.humedadAire = humedadAire;
                if (luminosidad !== null) datosLectura.luminosidad = luminosidad;
                if (lluvia !== null) datosLectura.lluvia = lluvia;
                if (alerta !== null) datosLectura.alerta = alerta;
                
                const nuevaLectura = new Humedad(datosLectura);
                await nuevaLectura.save();
                console.log(`💾 Datos registrados en MongoDB`);
                
                // Emitir el nuevo dato a todos los clientes conectados
                io.emit('nueva-lectura', { 
                  ...datosLectura,
                  fecha: nuevaLectura.fecha 
                });
              } else {
                // Crear un objeto solo con los valores válidos
                const datosLectura = { fecha: new Date() };
                
                // Añadir solo los valores válidos
                if (humedadSuelo !== null) datosLectura.humedadSuelo = humedadSuelo;
                if (temperaturaDS !== null) datosLectura.temperaturaDS = temperaturaDS;
                if (temperaturaBME !== null) datosLectura.temperaturaBME = temperaturaBME;
                if (presion !== null) datosLectura.presion = presion;
                if (humedadAire !== null) datosLectura.humedadAire = humedadAire;
                if (luminosidad !== null) datosLectura.luminosidad = luminosidad;
                if (lluvia !== null) datosLectura.lluvia = lluvia;
                if (alerta !== null) datosLectura.alerta = alerta;
                
                datosHumedad.unshift(datosLectura);
                if (datosHumedad.length > 100) datosHumedad.pop();
                console.log(`💾 Datos registrados en memoria`);
                
                // Emitir el nuevo dato a todos los clientes conectados
                io.emit('nueva-lectura', datosLectura);
              }
            }
          } else {
            // Intentar encontrar al menos algún dato en cualquier parte de la línea
            console.log(`⚠️ No se pudo parsear el formato estándar. Intentando alternativas...`);
            
            // Verificar si hay algún patrón de número en la línea
            const simpleNumber = line.match(/(\d+)%/);
            if (simpleNumber && simpleNumber[1]) {
              const humedadSuelo = parseFloat(simpleNumber[1]);
              console.log(`📡 Detectado valor simple de humedad: ${humedadSuelo}%`);
              
              // Guardar en MongoDB si está disponible, o en memoria si no
              if (Humedad) {
                const nuevaLectura = new Humedad({ humedadSuelo });
                await nuevaLectura.save();
                console.log(`💾 Humedad simple registrada en MongoDB`);
                
                // Emitir el nuevo dato a todos los clientes conectados
                io.emit('nueva-lectura', { humedadSuelo, fecha: nuevaLectura.fecha });
              } else {
                const nuevoDato = { humedadSuelo, fecha: new Date() };
                datosHumedad.unshift(nuevoDato);
                if (datosHumedad.length > 100) datosHumedad.pop();
                console.log(`💾 Humedad simple registrada en memoria`);
                
                // Emitir el nuevo dato a todos los clientes conectados
                io.emit('nueva-lectura', nuevoDato);
              }
            }
          }
        }
      }
      
      // Guardar en el log de datos crudos
      rawDataLog.unshift({
        timestamp: lastDataReceived,
        hex: hexData,
        text: data.toString()
      });

      // Mantener el tamaño del log limitado
      if (rawDataLog.length > MAX_RAW_LOG_SIZE) {
        rawDataLog.pop();
      }
    });

    port.on('error', (err) => {
      console.error(`❌ Error en el puerto serial: ${err.message}`);
      handleSerialDisconnection(err);
    });

    port.on('close', () => {
      console.log('❌ Conexión al puerto serial cerrada');
      handleSerialDisconnection();
    });

  } catch (error) {
    console.error(`❌ Error al inicializar el puerto serial: ${error.message}`);
    handleSerialDisconnection(error);
  }
}

// Función para manejar la desconexión y configurar la reconexión
function handleSerialDisconnection(error) {
  if (error) {
    console.error(`⚠️ Desconexión del puerto serial: ${error.message}`);
  }
  
  serialConnected = false;
  
  // Limpiar el puerto si existe
  if (port) {
    try {
      port.close();
    } catch (closeError) {
      // Ignorar errores al cerrar
    }
    port = null;
  }
  
  // Si no hay un temporizador de reconexión activo, configurar uno
  if (!reconnectTimer) {
    console.log(`🔄 Programando reconexión al puerto serial en ${RECONNECT_INTERVAL/1000} segundos...`);
    reconnectTimer = setInterval(() => {
      if (!serialConnected) {
        setupSerialPort();
      } else if (reconnectTimer) {
        clearInterval(reconnectTimer);
        reconnectTimer = null;
      }
    }, RECONNECT_INTERVAL);
  }
}

// Iniciar la conexión serial al arrancar
setupSerialPort();

// API Endpoints
app.get('/api', (req, res) => {
  res.json({ 
    message: '¡Hola desde el backend!',
    status: {
      mongodb: !!Humedad ? 'conectado' : 'desconectado',
      serialPort: serialConnected ? 'conectado' : 'desconectado',
      websocket: 'conectado'
    }
  });
});

app.post('/api/humedad', async (req, res) => {
  try {
    const { humedadSuelo, temperaturaDS, temperaturaBME, presion, humedadAire } = req.body;
    
    // Guardar en MongoDB si está disponible, o en memoria si no
    if (Humedad) {
      const nueva = new Humedad({ 
        humedadSuelo, 
        temperaturaDS, 
        temperaturaBME, 
        presion, 
        humedadAire 
      });
      await nueva.save();
      
      // Emitir el nuevo dato a todos los clientes conectados
      io.emit('nueva-lectura', { 
        humedadSuelo, 
        temperaturaDS, 
        temperaturaBME, 
        presion, 
        humedadAire, 
        fecha: nueva.fecha 
      });
      
      res.status(201).json(nueva);
    } else {
      const nueva = { 
        humedadSuelo, 
        temperaturaDS, 
        temperaturaBME, 
        presion, 
        humedadAire, 
        fecha: new Date() 
      };
      datosHumedad.unshift(nueva);
      if (datosHumedad.length > 100) datosHumedad.pop();
      
      // Emitir el nuevo dato a todos los clientes conectados
      io.emit('nueva-lectura', nueva);
      
      res.status(201).json(nueva);
    }
  } catch (error) {
    res.status(500).json({ message: 'Error al guardar datos' });
  }
});

app.get('/api/humedad', async (req, res) => {
  try {
    // Obtener de MongoDB si está disponible, o de memoria si no
    if (Humedad) {
      const datos = await Humedad.find().sort({ fecha: -1 }).limit(100);
      res.json(datos);
    } else {
      res.json(datosHumedad);
    }
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener datos' });
  }
});

// Agregar este endpoint después de /api/humedad
app.get('/api/datos-sensores', async (req, res) => {
  try {
    // Obtener de MongoDB si está disponible, o de memoria si no
    if (Humedad) {
      const datos = await Humedad.find().sort({ fecha: -1 }).limit(100);
      res.json(datos);
    } else {
      res.json(datosHumedad);
    }
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener datos' });
  }
});

// Ruta para obtener estadísticas de los datos
app.get('/api/estadisticas', async (req, res) => {
  try {
    // Obtener estadísticas de MongoDB si está disponible, o de memoria si no
    if (Humedad) {
      // Contar total de registros
      const totalRegistros = await Humedad.countDocuments();
      
      // Obtener último registro
      const ultimoRegistro = await Humedad.findOne().sort({ fecha: -1 });
      
      // Calcular promedios para cada tipo de dato
      const promedioHumedad = await Humedad.aggregate([
        { $match: { humedadSuelo: { $exists: true, $ne: null } } },
        { $group: { _id: null, promedio: { $avg: "$humedadSuelo" } } }
      ]);
      
      const promedioTempDS = await Humedad.aggregate([
        { $match: { temperaturaDS: { $exists: true, $ne: null } } },
        { $group: { _id: null, promedio: { $avg: "$temperaturaDS" } } }
      ]);
      
      const promedioTempBME = await Humedad.aggregate([
        { $match: { temperaturaBME: { $exists: true, $ne: null } } },
        { $group: { _id: null, promedio: { $avg: "$temperaturaBME" } } }
      ]);
      
      const promedioPresion = await Humedad.aggregate([
        { $match: { presion: { $exists: true, $ne: null } } },
        { $group: { _id: null, promedio: { $avg: "$presion" } } }
      ]);
      
      const promedioHumAire = await Humedad.aggregate([
        { $match: { humedadAire: { $exists: true, $ne: null } } },
        { $group: { _id: null, promedio: { $avg: "$humedadAire" } } }
      ]);
      
      const promedioLuminosidad = await Humedad.aggregate([
        { $match: { luminosidad: { $exists: true, $ne: null } } },
        { $group: { _id: null, promedio: { $avg: "$luminosidad" } } }
      ]);
      
      const promedioLluvia = await Humedad.aggregate([
        { $match: { lluvia: { $exists: true, $ne: null } } },
        { $group: { _id: null, promedio: { $avg: "$lluvia" } } }
      ]);
      
      // Contar alertas
      const totalAlertasSI = await Humedad.countDocuments({ alerta: true });
      
      // Compilar resultados
      const estadisticas = {
        totalRegistros,
        ultimaLectura: ultimoRegistro,
        promedios: {
          humedadSuelo: promedioHumedad.length > 0 ? Math.round(promedioHumedad[0].promedio * 10) / 10 : null,
          temperaturaDS: promedioTempDS.length > 0 ? Math.round(promedioTempDS[0].promedio * 10) / 10 : null,
          temperaturaBME: promedioTempBME.length > 0 ? Math.round(promedioTempBME[0].promedio * 10) / 10 : null,
          presion: promedioPresion.length > 0 ? Math.round(promedioPresion[0].promedio * 10) / 10 : null,
          humedadAire: promedioHumAire.length > 0 ? Math.round(promedioHumAire[0].promedio * 10) / 10 : null,
          luminosidad: promedioLuminosidad.length > 0 ? Math.round(promedioLuminosidad[0].promedio * 10) / 10 : null,
          lluvia: promedioLluvia.length > 0 ? Math.round(promedioLluvia[0].promedio * 10) / 10 : null
        },
        alertas: {
          total: totalAlertasSI,
          porcentaje: totalRegistros > 0 ? Math.round((totalAlertasSI / totalRegistros) * 1000) / 10 : 0
        }
      };
      
      res.json(estadisticas);
    } else {
      // Calcular estadísticas desde memoria
      const totalRegistros = datosHumedad.length;
      const ultimoRegistro = datosHumedad.length > 0 ? datosHumedad[0] : null;
      
      // Función para calcular promedio
      const calcularPromedio = (campo) => {
        const valoresValidos = datosHumedad.filter(item => item[campo] !== undefined && item[campo] !== null);
        if (valoresValidos.length === 0) return null;
        
        const suma = valoresValidos.reduce((total, item) => total + item[campo], 0);
        return Math.round((suma / valoresValidos.length) * 10) / 10;
      };
      
      // Contar alertas
      const totalAlertasSI = datosHumedad.filter(item => item.alerta === true).length;
      
      const estadisticas = {
        totalRegistros,
        ultimaLectura: ultimoRegistro,
        promedios: {
          humedadSuelo: calcularPromedio('humedadSuelo'),
          temperaturaDS: calcularPromedio('temperaturaDS'),
          temperaturaBME: calcularPromedio('temperaturaBME'),
          presion: calcularPromedio('presion'),
          humedadAire: calcularPromedio('humedadAire'),
          luminosidad: calcularPromedio('luminosidad'),
          lluvia: calcularPromedio('lluvia')
        },
        alertas: {
          total: totalAlertasSI,
          porcentaje: totalRegistros > 0 ? Math.round((totalAlertasSI / totalRegistros) * 1000) / 10 : 0
        }
      };
      
      res.json(estadisticas);
    }
  } catch (error) {
    console.error('Error al obtener estadísticas:', error);
    res.status(500).json({ message: 'Error al obtener estadísticas' });
  }
});

app.get('*', (req, res) => {
  // En lugar de servir index.html, devolver un mensaje de API
  res.status(404).json({ 
    message: 'API endpoint no encontrado. Este es el backend de la API de sensores.',
    availableEndpoints: [
      '/api/datos-sensores',
      '/api/humedad',
      '/api/estadisticas', 
      '/api/serial/status',
      '/api/serial/reconnect',
      '/api/serial/raw-data'
    ]
  });
});

// Ruta para forzar un intento de reconexión
app.post('/api/serial/reconnect', (req, res) => {
  if (serialConnected) {
    res.json({ success: true, message: 'El puerto serial ya está conectado' });
    return;
  }
  
  console.log('🔄 Forzando reconexión al puerto serial...');
  
  // Limpiar el temporizador existente si hay uno
  if (reconnectTimer) {
    clearInterval(reconnectTimer);
    reconnectTimer = null;
  }
  
  // Intentar conectar inmediatamente
  setupSerialPort();
  
  res.json({ success: true, message: 'Intento de reconexión iniciado' });
});

// Ruta para verificar el estado de la conexión serial
app.get('/api/serial/status', (req, res) => {
  res.json({
    connected: serialConnected,
    reconnecting: reconnectTimer !== null,
    port: serialConnected ? port.path : null,
    bufferSize: buffer.length,
    lastDataReceived: lastDataReceived || null
  });
});

// Ruta para obtener los últimos datos crudos recibidos
app.get('/api/serial/raw-data', (req, res) => {
  res.json({
    lastReceived: lastDataReceived,
    log: rawDataLog
  });
});

// Ruta para enviar datos de prueba al puerto serial (solo para debug)
app.post('/api/serial/test', (req, res) => {
  if (!serialConnected) {
    return res.status(400).json({ success: false, message: 'Puerto serial no conectado' });
  }
  
  try {
    // Simular recepción de datos con formato conocido
    const testData = Buffer.from("HS:85% | T1:24.5C | T2:25.2C | P:1013.2hPa | HA:68.4% | Lux: 250lx | Rain:0% | Alert: NO\n");
    port.emit('data', testData);
    
    res.json({ 
      success: true, 
      message: 'Datos de prueba enviados al procesador' 
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: `Error al enviar datos de prueba: ${error.message}` 
    });
  }
});

// Manejar cualquier otra ruta y devolver el index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'build', 'index.html'));
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`🚀 Servidor escuchando en http://localhost:${PORT}`);
});

