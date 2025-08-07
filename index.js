const express = require('express');
const cors = require('cors');
const { SerialPort } = require('serialport');
const path = require('path');
const fs = require('fs');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require('socket.io');
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    credentials: true
  }
});
require('dotenv').config();

// Servir archivos estáticos de la carpeta 'build'
app.use(express.static(path.join(__dirname, 'build')));

// Configuración de CORS para las solicitudes HTTP
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  credentials: true
}));
app.use(express.json());

// Variable para almacenar datos en memoria (temporal, hasta que MongoDB esté configurado)
const datosHumedad = [];
const datosProduccion = [];

// Función para cargar datos desde archivo JSON
const cargarDatosDesdeArchivo = () => {
  try {
    // Cargar datos de producción
    if (fs.existsSync('./datos_produccion.json')) {
      const datos = JSON.parse(fs.readFileSync('./datos_produccion.json', 'utf8'));
      datosProduccion.push(...datos);
      console.log(`📁 Cargados ${datos.length} registros de producción desde archivo`);
    }
    
    // Cargar datos de sensores
    if (fs.existsSync('./datos_sensores.json')) {
      const datosSensores = JSON.parse(fs.readFileSync('./datos_sensores.json', 'utf8'));
      datosHumedad.push(...datosSensores);
      console.log(`📁 Cargados ${datosSensores.length} registros de sensores desde archivo`);
    }
  } catch (error) {
    console.error('Error cargando datos desde archivo:', error);
  }
};

// Función para guardar datos a archivo JSON
const guardarDatosAArchivo = () => {
  try {
    fs.writeFileSync('./datos_produccion.json', JSON.stringify(datosProduccion, null, 2));
    fs.writeFileSync('./datos_sensores.json', JSON.stringify(datosHumedad, null, 2));
    console.log(`💾 Guardados ${datosProduccion.length} registros de producción y ${datosHumedad.length} registros de sensores a archivo`);
  } catch (error) {
    console.error('Error guardando datos a archivo:', error);
  }
};

// Función para generar datos iniciales de sensores si no existen
const generarDatosIniciales = () => {
  if (datosHumedad.length === 0) {
    console.log('📊 Generando datos iniciales de sensores...');
    const ahora = new Date();
    
    // Generar 20 registros de las últimas 10 horas (cada 30 minutos)
    for (let i = 19; i >= 0; i--) {
      const fecha = new Date(ahora.getTime() - (i * 30 * 60 * 1000)); // 30 minutos atrás
      
      const registro = {
        humedadSuelo: Math.round((Math.random() * 20 + 40) * 10) / 10, // 40-60%
        temperaturaDS: Math.round((Math.random() * 10 + 20) * 10) / 10, // 20-30°C
        temperaturaBME: Math.round((Math.random() * 10 + 22) * 10) / 10, // 22-32°C
        presion: Math.round(Math.random() * 50 + 1000), // 1000-1050 hPa
        humedadAire: Math.round((Math.random() * 30 + 50) * 10) / 10, // 50-80%
        luminosidad: Math.round(Math.random() * 800 + 200), // 200-1000 lx
        lluvia: Math.random() > 0.8 ? Math.round(Math.random() * 5 * 10) / 10 : 0, // 20% probabilidad de lluvia
        alerta: Math.random() > 0.9, // 10% probabilidad de alerta
        fecha: fecha,
        __v: 0
      };
      
      datosHumedad.push(registro);
    }
    
    console.log(`✅ Generados ${datosHumedad.length} registros iniciales de sensores`);
    guardarDatosAArchivo(); // Guardar los datos generados
  }
};

// Cargar datos al iniciar
cargarDatosDesdeArchivo();
generarDatosIniciales();

// Inicializar MongoDB si está disponible
let mongoose;
let Humedad;
let Production;
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
      humedadSuelo: Number,
      temperaturaDS: Number,
      temperaturaBME: Number,
      presion: Number,
      humedadAire: Number,
      luminosidad: Number,
      lluvia: Number,
      alerta: Boolean,
      fecha: { type: Date, default: Date.now }
    });

    // Esquema para producción de cacao
    const productionSchema = new mongoose.Schema({
      fecha_cosecha: { type: Date, required: true },
      parcela: { 
        type: String, 
        enum: ['Parcela Norte', 'Parcela Sur'], 
        required: true 
      },
      variedad_cacao: { 
        type: String, 
        enum: ['Criollo', 'Forastero', 'Trinitario', 'Nacional'], 
        required: true 
      },
      cantidad_kg: { type: Number, required: true },
      calidad: { 
        type: String, 
        enum: ['Premium', 'Estándar', 'Baja'], 
        default: 'Estándar' 
      },
      humedad_porcentaje: { type: Number, required: true },
      precio_kg: { type: Number, required: true },
      metodo_secado: { 
        type: String, 
        enum: ['Natural', 'Secador solar', 'Secador mecánico'], 
        default: 'Natural' 
      },
      tiempo_secado_horas: { type: Number },
      temperatura_secado: { type: Number },
      humedad_final: { type: Number },
      observaciones: { type: String },
      fecha_registro: { type: Date, default: Date.now }
    });

    Humedad = mongoose.model('Humedad', humedadSchema);
    Production = mongoose.model('Production', productionSchema);

    // Migrar datos en memoria a MongoDB si existen
    if (datosProduccion.length > 0) {
      console.log(`🔄 Migrando ${datosProduccion.length} registros de producción a MongoDB...`);
      Production.insertMany(datosProduccion.map(dato => ({
        ...dato,
        _id: undefined // Dejar que MongoDB genere el _id
      }))).then(() => {
        console.log('✅ Migración completada');
        datosProduccion.length = 0; // Limpiar memoria
      }).catch(err => {
        console.error('❌ Error en migración:', err);
      });
    }
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

// Configuración del puerto Serial
let port;
// Buffer para acumular datos de sensores individuales
let sensorDataBuffer = {};
let lastSensorUpdate = Date.now();
const SENSOR_TIMEOUT = 5000; // 5 segundos para completar todos los sensores

// Función para guardar datos acumulados
const saveAccumulatedData = async () => {
  if (Object.keys(sensorDataBuffer).length > 0) {
    const completeData = {
      ...sensorDataBuffer,
      fecha: new Date()
    };
    
    console.log(`📡 Guardando datos acumulados:`, completeData);
    
    // Guardar en MongoDB si está disponible, o en memoria si no
    if (Humedad) {
      const nuevaLectura = new Humedad(completeData);
      await nuevaLectura.save();
      console.log(`💾 Datos registrados en MongoDB`);
      
      // Emitir el nuevo dato a todos los clientes conectados
      io.emit('nueva-lectura', { ...completeData, fecha: nuevaLectura.fecha });
    } else {
      datosHumedad.unshift(completeData);
      if (datosHumedad.length > 100) datosHumedad.pop();
      console.log(`💾 Datos registrados en memoria`);
      
      // Guardar en archivo para persistencia
      guardarDatosAArchivo();
      
      // Emitir el nuevo dato a todos los clientes conectados
      io.emit('nueva-lectura', completeData);
    }
    
    // Limpiar buffer
    sensorDataBuffer = {};
  }
};

// Timer para guardar datos acumulados periódicamente
setInterval(async () => {
  const now = Date.now();
  if (now - lastSensorUpdate > SENSOR_TIMEOUT && Object.keys(sensorDataBuffer).length > 0) {
    await saveAccumulatedData();
  }
}, 1000);

try {
  port = new SerialPort({
    path: process.env.USB_PORT || 'COM10', // Puerto predeterminado para Windows
    baudRate: 115200,
  });

  let buffer = '';

  port.on('data', async (data) => {
    // Añadir los datos recibidos al buffer
    buffer += data.toString();
    
    // Buscar líneas completas en el buffer
    let lines = buffer.split('\n');
    
    // Si tenemos al menos una línea completa (terminada en \n)
    if (lines.length > 1) {
      // La última línea podría estar incompleta, se guarda para el próximo procesamiento
      buffer = lines.pop();
      
      for (const line of lines) {
        // Usar la función parseSensorData para procesar la línea
        const parsedData = parseSensorData(line);
        
        // Solo procesar si tenemos datos válidos
        if (parsedData && Object.keys(parsedData).length > 0) {
          console.log(`📡 Datos del sensor detectados:`, parsedData);
          
          // Agregar los datos al buffer de sensores
          Object.assign(sensorDataBuffer, parsedData);
          lastSensorUpdate = Date.now();
          
          console.log(`📊 Buffer de sensores actualizado:`, sensorDataBuffer);
          
          // Verificar si tenemos todos los campos esperados en el buffer
          const expectedFields = ['humedadSuelo', 'temperaturaDS', 'temperaturaBME', 'presion', 'humedadAire', 'luminosidad', 'lluvia', 'alerta'];
          const bufferHasAllFields = expectedFields.every(field => sensorDataBuffer.hasOwnProperty(field));
          
          if (bufferHasAllFields) {
            await saveAccumulatedData();
          }
        }
      }
    }
  });

  port.on('error', (err) => {
    console.error('❌ Error en el puerto serial:', err.message);
  });
} catch (error) {
  console.error(`❌ Error al inicializar el puerto serial: ${error.message}`);
  console.log('⚠️ La aplicación continuará sin lectura desde USB');
}

// API Endpoints
app.get('/api', (req, res) => {
  res.json({ 
    message: '¡Hola desde el backend!',
    status: {
      mongodb: !!Humedad ? 'conectado' : 'desconectado',
      serialPort: !!port ? 'conectado' : 'desconectado',
      websocket: 'conectado'
    }
  });
});

app.post('/api/humedad', async (req, res) => {
  try {
    const sensorData = req.body;
    
    // Guardar en MongoDB si está disponible, o en memoria si no
    if (Humedad) {
      const nueva = new Humedad(sensorData);
      await nueva.save();
      
      // Emitir el nuevo dato a todos los clientes conectados
      io.emit('nueva-lectura', { ...sensorData, fecha: nueva.fecha });
      
      res.status(201).json(nueva);
    } else {
      const nueva = { ...sensorData, fecha: new Date() };
      datosHumedad.unshift(nueva);
      if (datosHumedad.length > 100) datosHumedad.pop();
      
      // Guardar en archivo para persistencia
      guardarDatosAArchivo();
      
      // Emitir el nuevo dato a todos los clientes conectados
      io.emit('nueva-lectura', nueva);
      
      res.status(201).json(nueva);
    }
  } catch (error) {
    res.status(500).json({ message: 'Error al guardar datos del sensor' });
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

// Endpoint adicional para datos de sensores (alias de /api/humedad)
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
    res.status(500).json({ message: 'Error al obtener datos de sensores' });
  }
});

// Endpoints para producción de cacao
app.post('/api/production', async (req, res) => {
  try {
    const {
      fecha_cosecha,
      parcela,
      variedad_cacao,
      cantidad_kg,
      calidad,
      humedad_porcentaje,
      precio_kg,
      metodo_secado,
      tiempo_secado_horas,
      temperatura_secado,
      humedad_final,
      observaciones
    } = req.body;

    // Guardar en MongoDB si está disponible, o en memoria si no
    if (Production) {
      const nuevaProduccion = new Production({
        fecha_cosecha: new Date(fecha_cosecha),
        parcela,
        variedad_cacao,
        cantidad_kg: parseFloat(cantidad_kg),
        calidad,
        humedad_porcentaje: parseFloat(humedad_porcentaje),
        precio_kg: parseFloat(precio_kg),
        metodo_secado,
        tiempo_secado_horas: tiempo_secado_horas ? parseFloat(tiempo_secado_horas) : undefined,
        temperatura_secado: temperatura_secado ? parseFloat(temperatura_secado) : undefined,
        humedad_final: humedad_final ? parseFloat(humedad_final) : undefined,
        observaciones
      });

      await nuevaProduccion.save();
      res.status(201).json(nuevaProduccion);
    } else {
      const nuevaProduccion = {
        _id: Date.now().toString(),
        fecha_cosecha: new Date(fecha_cosecha),
        parcela,
        variedad_cacao,
        cantidad_kg: parseFloat(cantidad_kg),
        calidad,
        humedad_porcentaje: parseFloat(humedad_porcentaje),
        precio_kg: parseFloat(precio_kg),
        metodo_secado,
        tiempo_secado_horas: tiempo_secado_horas ? parseFloat(tiempo_secado_horas) : undefined,
        temperatura_secado: temperatura_secado ? parseFloat(temperatura_secado) : undefined,
        humedad_final: humedad_final ? parseFloat(humedad_final) : undefined,
        observaciones,
        fecha_registro: new Date()
      };

      datosProduccion.unshift(nuevaProduccion);
      if (datosProduccion.length > 100) datosProduccion.pop(); // Mantener solo los últimos 100 registros
      
      // Guardar a archivo después de cada inserción
      guardarDatosAArchivo();
      
      res.status(201).json(nuevaProduccion);
    }
  } catch (error) {
    console.error('Error al crear registro de producción:', error);
    res.status(500).json({ message: 'Error al crear registro de producción' });
  }
});

app.get('/api/production', async (req, res) => {
  try {
    // Obtener de MongoDB si está disponible, o de memoria si no
    if (Production) {
      const registros = await Production.find().sort({ fecha_registro: -1 });
      res.json(registros);
    } else {
      res.json(datosProduccion);
    }
  } catch (error) {
    console.error('Error al obtener registros de producción:', error);
    res.status(500).json({ message: 'Error al obtener registros de producción' });
  }
});

app.get('/api/production/stats', async (req, res) => {
  try {
    // Obtener de MongoDB si está disponible, o de memoria si no
    const registros = Production ? await Production.find() : datosProduccion;
    
    // Estadísticas básicas
    const totalProduccion = registros.reduce((sum, reg) => sum + reg.cantidad_kg, 0);
    const totalIngresos = registros.reduce((sum, reg) => sum + (reg.cantidad_kg * reg.precio_kg), 0);
    const precioPromedio = totalProduccion > 0 ? totalIngresos / totalProduccion : 0;
    
    // Distribución por calidad
    const calidadCounts = registros.reduce((acc, reg) => {
      acc[reg.calidad] = (acc[reg.calidad] || 0) + 1;
      return acc;
    }, {});
    
    const calidadPremium = calidadCounts['Premium'] || 0;
    const porcentajePremium = registros.length > 0 ? (calidadPremium / registros.length) * 100 : 0;

    // Producción por mes (todos los registros, agrupados por mes)
    const produccionMensual = registros
      .reduce((acc, reg) => {
        const mes = reg.fecha_cosecha.toISOString().slice(0, 7); // YYYY-MM
        if (!acc[mes]) {
          acc[mes] = { cantidad: 0, ingresos: 0 };
        }
        acc[mes].cantidad += reg.cantidad_kg;
        acc[mes].ingresos += reg.cantidad_kg * reg.precio_kg;
        return acc;
      }, {});

    const stats = {
      total_produccion: totalProduccion,
      total_ingresos: totalIngresos,
      precio_promedio: precioPromedio,
      porcentaje_premium: porcentajePremium,
      total_registros: registros.length,
      produccion_mensual: Object.entries(produccionMensual).map(([mes, datos]) => ({
        mes,
        cantidad: datos.cantidad,
        ingresos: datos.ingresos
      }))
    };

    res.json(stats);
  } catch (error) {
    console.error('Error al obtener estadísticas:', error);
    res.status(500).json({ message: 'Error al obtener estadísticas' });
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

function parseSensorData(raw) {
  const map = {
    HS: 'humedadSuelo',
    T1: 'temperaturaDS',
    T2: 'temperaturaBME',
    P: 'presion',
    HA: 'humedadAire',
    Lux: 'luminosidad',
    Rain: 'lluvia',
    Alert: 'alerta'
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
      } else if (key === 'Alert') {
        value = value.toUpperCase().includes('SI') || value.toUpperCase().includes('YES');
      }
      
      // Validar que el valor sea un número válido (excepto para alerta)
      if (key !== 'Alert' && (isNaN(value) || value === null || value === undefined)) {
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
        } else if (key === 'Alert') {
          value = value.toUpperCase().includes('SI') || value.toUpperCase().includes('YES');
        }
        
        // Validar que el valor sea un número válido (excepto para alerta)
        if (key !== 'Alert' && (isNaN(value) || value === null || value === undefined)) {
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

