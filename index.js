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
    if (fs.existsSync('./datos_produccion.json')) {
      const datos = JSON.parse(fs.readFileSync('./datos_produccion.json', 'utf8'));
      datosProduccion.push(...datos);
      console.log(`📁 Cargados ${datos.length} registros desde archivo`);
    }
  } catch (error) {
    console.error('Error cargando datos desde archivo:', error);
  }
};

// Función para guardar datos a archivo JSON
const guardarDatosAArchivo = () => {
  try {
    fs.writeFileSync('./datos_produccion.json', JSON.stringify(datosProduccion, null, 2));
    console.log(`💾 Guardados ${datosProduccion.length} registros a archivo`);
  } catch (error) {
    console.error('Error guardando datos a archivo:', error);
  }
};

// Cargar datos al iniciar
cargarDatosDesdeArchivo();

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
          
          // Guardar en MongoDB si está disponible, o en memoria si no
          if (Humedad) {
            const nuevaLectura = new Humedad(parsedData);
            await nuevaLectura.save();
            console.log(`💾 Datos registrados en MongoDB`);
            
            // Emitir el nuevo dato a todos los clientes conectados
            io.emit('nueva-lectura', { ...parsedData, fecha: nuevaLectura.fecha });
          } else {
            const nuevoDato = { ...parsedData, fecha: new Date() };
            datosHumedad.unshift(nuevoDato);
            if (datosHumedad.length > 100) datosHumedad.pop(); // Mantener solo los últimos 100 registros
            console.log(`💾 Datos registrados en memoria`);
            
            // Emitir el nuevo dato a todos los clientes conectados
            io.emit('nueva-lectura', nuevoDato);
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
  const parts = raw.split('|').map(p => p.trim());

  for (const part of parts) {
    const [key, valueRaw] = part.split(':').map(s => s.trim());
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

  // Solo retornar si tenemos al menos algunos datos válidos
  if (Object.keys(result).length === 0) {
    return null;
  }

  // Agregar fecha y otros campos
  result.fecha = new Date();
  result.__v = 0;

  return result;
}

// Ejemplo de uso:
const raw = "HS:11% | T1:21.1C | T2:25.8C | P:1018hPa | HA:29.6% | Lux:810lx | Rain:0% | Alert: SI";
const doc = parseSensorData(raw);
// Ahora puedes guardar 'doc' en MongoDB

