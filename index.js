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

// Servir archivos estáticos de la carpeta 'build'
app.use(express.static(path.join(__dirname, 'build')));

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
      valor: Number,
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

// Configuración del puerto Serial
let port;
try {
  port = new SerialPort({
    path: process.env.USB_PORT || 'COM3', // Puerto predeterminado para Windows
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
        // Buscar el patrón "Humedad: XX%" usando expresión regular
        const match = line.match(/Humedad:\s+(\d+)%/);
        
        if (match && match[1]) {
          const valor = parseInt(match[1], 10);
          console.log(`📡 Porcentaje de humedad detectado: ${valor}%`);
          
          // Guardar en MongoDB si está disponible, o en memoria si no
          if (Humedad) {
            const nuevaLectura = new Humedad({ valor });
            await nuevaLectura.save();
            console.log(`💾 Humedad registrada en MongoDB: ${valor}%`);
            
            // Emitir el nuevo dato a todos los clientes conectados
            io.emit('nueva-lectura', { valor, fecha: nuevaLectura.fecha });
          } else {
            const nuevoDato = { valor, fecha: new Date() };
            datosHumedad.unshift(nuevoDato);
            if (datosHumedad.length > 100) datosHumedad.pop(); // Mantener solo los últimos 100 registros
            console.log(`💾 Humedad registrada en memoria: ${valor}%`);
            
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
    const valor = req.body.valor;
    
    // Guardar en MongoDB si está disponible, o en memoria si no
    if (Humedad) {
      const nueva = new Humedad({ valor });
      await nueva.save();
      
      // Emitir el nuevo dato a todos los clientes conectados
      io.emit('nueva-lectura', { valor, fecha: nueva.fecha });
      
      res.status(201).json(nueva);
    } else {
      const nueva = { valor, fecha: new Date() };
      datosHumedad.unshift(nueva);
      if (datosHumedad.length > 100) datosHumedad.pop();
      
      // Emitir el nuevo dato a todos los clientes conectados
      io.emit('nueva-lectura', nueva);
      
      res.status(201).json(nueva);
    }
  } catch (error) {
    res.status(500).json({ message: 'Error al guardar humedad' });
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

// Manejar cualquier otra ruta y devolver el index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'build', 'index.html'));
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`🚀 Servidor escuchando en http://localhost:${PORT}`);
});

