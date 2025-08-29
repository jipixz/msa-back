const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const { SerialPort } = require('serialport');
const nodemailer = require('nodemailer');
const path = require('path');
const fs = require('fs');
const app = express();
const http = require('http');
const server = http.createServer(app);
require('dotenv').config();
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';
const { Server } = require('socket.io');
const io = new Server(server, {
  cors: {
    origin: CLIENT_URL,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    credentials: true
  }
});

// Servir archivos estáticos de la carpeta 'build'
app.use(express.static(path.join(__dirname, 'build')));

// Configuración de CORS para las solicitudes HTTP
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:5173',
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// Agregar headers de codificación UTF-8
app.use((req, res, next) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  next();
});
app.use(passport.initialize());

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

// Función para generar datos iniciales de sensores SOLO para visualización
const generarDatosIniciales = () => {
  if (datosHumedad.length === 0) {
    console.log('📊 Generando datos iniciales de sensores SOLO para visualización...');
    console.log('⚠️ Estos datos NO se guardarán en MongoDB ni afectarán las predicciones');
    
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
        __v: 0,
        isDummy: true, // Marcar como datos ficticios
        source: 'demo', // Indicar que es para demostración
        generated: true // Indicar que fue generado automáticamente
      };
      
      datosHumedad.push(registro);
    }
    
    console.log(`✅ Generados ${datosHumedad.length} registros de DEMOSTRACIÓN`);
    console.log(`📊 Estos datos solo se usan para visualización inicial`);
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
let User;
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

    // Esquema de usuarios para autenticación
    const userSchema = new mongoose.Schema({
      email: { type: String, required: true, unique: true },
      name: { type: String },
      passwordHash: { type: String }, // solo para provider local
      provider: { type: String, enum: ['local', 'google'], default: 'local' },
      googleId: { type: String },
      role: { type: String, enum: ['admin', 'user'], default: 'user' },
      isActive: { type: Boolean, default: true },
      avatarUrl: { type: String },
      passwordResetToken: { type: String },
      passwordResetExpires: { type: Date },
      createdAt: { type: Date, default: Date.now }
    });

    Humedad = mongoose.model('Humedad', humedadSchema);
    Production = mongoose.model('Production', productionSchema);
    User = mongoose.model('User', userSchema);

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

    // Crear usuario admin inicial si se define por variables de entorno
    (async () => {
      try {
        if (process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD) {
          const existing = await User.findOne({ email: process.env.ADMIN_EMAIL });
          if (!existing) {
            const hash = await bcrypt.hash(process.env.ADMIN_PASSWORD, 10);
            await User.create({
              email: process.env.ADMIN_EMAIL,
              name: 'Administrator',
              passwordHash: hash,
              provider: 'local',
              role: 'admin',
              isActive: true
            });
            console.log('👑 Usuario admin creado a partir de variables de entorno');
          }
        }
      } catch (e) {
        console.error('No se pudo crear el admin inicial:', e);
      }
    })();
  }).catch(err => {
    console.error('❌ Error al conectar con MongoDB:', err);
    console.log('⚠️ Funcionando en modo de almacenamiento en memoria');
  });
} catch (error) {
  console.error('❌ Error al cargar MongoDB:', error);
  console.log('⚠️ Funcionando en modo de almacenamiento en memoria');
}

// Utilidades de autenticación
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const signToken = (user) => {
  return jwt.sign(
    { uid: user._id.toString(), email: user.email, role: user.role, name: user.name, avatarUrl: user.avatarUrl },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
};

const setAuthCookie = (res, token) => {
  res.cookie('msa_token', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: !!process.env.COOKIE_SECURE || false,
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/',
  });
};

const clearAuthCookie = (res) => {
  res.clearCookie('msa_token', { path: '/' });
};

const requireAuth = async (req, res, next) => {
  try {
    const token = req.cookies.msa_token || (req.headers.authorization && req.headers.authorization.startsWith('Bearer ') ? req.headers.authorization.slice(7) : null);
    if (!token) return res.status(401).json({ message: 'No autenticado' });
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    next();
  } catch (e) {
    return res.status(401).json({ message: 'Token inválido' });
  }
};

const requireAdmin = (req, res, next) => {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Acceso denegado' });
  }
  next();
};

// Configurar Passport Google OAuth si hay MongoDB (User definido)
if (typeof GoogleStrategy === 'function') {
  passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID || 'unset',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || 'unset',
    callbackURL: (process.env.API_BASE_URL || 'http://localhost:5000') + '/auth/google/callback'
  }, async (accessToken, refreshToken, profile, done) => {
    try {
      if (!User) return done(null, false);
      const email = profile.emails && profile.emails[0] && profile.emails[0].value;
      if (!email) return done(null, false);
      // No permitir auto-registro: solo usuarios existentes pueden entrar
      let user = await User.findOne({ email });
      if (!user) {
        return done(null, false, { message: 'El acceso no está permitido para este correo' });
      }
      if (!user.isActive) {
        return done(null, false, { message: 'Usuario inactivo' });
      }
      // Actualizar googleId si no está
      if (!user.googleId) {
        user.googleId = profile.id;
        user.provider = 'google';
        await user.save();
      }
      return done(null, user);
    } catch (err) {
      return done(err);
    }
  }));
}

// Rutas de autenticación
app.post('/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ message: 'Correo y contraseña requeridos' });
    if (!User) return res.status(500).json({ message: 'Base de datos no disponible' });
    const user = await User.findOne({ email });
    if (!user) return res.status(401).json({ message: 'Credenciales inválidas' });
    if (!user.isActive) return res.status(403).json({ message: 'Usuario inactivo' });
    if (user.provider !== 'local' || !user.passwordHash) return res.status(400).json({ message: 'Este usuario debe iniciar con Google' });
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(401).json({ message: 'Credenciales inválidas' });
    const token = signToken(user);
    setAuthCookie(res, token);
    res.json({ message: 'Sesión iniciada', user: { email: user.email, name: user.name, role: user.role } });
  } catch (e) {
    res.status(500).json({ message: 'Error en login' });
  }
});

app.post('/auth/logout', (req, res) => {
  clearAuthCookie(res);
  res.json({ message: 'Sesión cerrada' });
});

app.get('/auth/me', requireAuth, async (req, res) => {
  try {
    if (!User) return res.status(500).json({ message: 'Base de datos no disponible' });
    const user = await User.findById(req.user.uid).select('email name role isActive avatarUrl');
    if (!user) return res.status(404).json({ message: 'Usuario no encontrado' });
    res.json({ user });
  } catch (e) {
    res.status(500).json({ message: 'Error obteniendo sesión' });
  }
});

// Recuperación de contraseña
const crypto = require('crypto');
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT) || 587,
  secure: process.env.SMTP_SECURE === 'true',
  auth: process.env.SMTP_USER && process.env.SMTP_PASS ? {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  } : undefined,
});

app.post('/auth/forgot', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: 'Correo requerido' });
    if (!User) return res.status(500).json({ message: 'Base de datos no disponible' });
    const user = await User.findOne({ email });
    if (!user || user.provider !== 'local') {
      // Responder 200 para no filtrar correos
      return res.json({ message: 'Si el correo existe, se enviarán instrucciones' });
    }
    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    user.passwordResetToken = tokenHash;
    user.passwordResetExpires = new Date(Date.now() + 1000 * 60 * 15); // 15min
    await user.save();
    const resetLink = `${CLIENT_URL}/reset?token=${token}`;
    const from = process.env.FROM_EMAIL || 'no-reply@example.com';
    if (process.env.SMTP_HOST && process.env.SMTP_USER) {
      await transporter.sendMail({
        from,
        to: user.email,
        subject: 'Recuperación de contraseña',
        text: `Para restablecer tu contraseña, visita: ${resetLink}`,
        html: `<p>Para restablecer tu contraseña, haz clic en el siguiente enlace:</p><p><a href="${resetLink}">${resetLink}</a></p>`
      });
    } else {
      console.log('🔗 Enlace de restablecimiento (modo sin SMTP):', resetLink);
    }
    res.json({ message: 'Si el correo existe, se enviarán instrucciones' });
  } catch (e) {
    res.status(500).json({ message: 'Error en recuperación' });
  }
});

app.post('/auth/reset', async (req, res) => {
  try {
    const { token, password } = req.body;
    if (!token || !password) return res.status(400).json({ message: 'Datos incompletos' });
    if (!User) return res.status(500).json({ message: 'Base de datos no disponible' });
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const user = await User.findOne({
      passwordResetToken: tokenHash,
      passwordResetExpires: { $gt: new Date() },
    });
    if (!user) return res.status(400).json({ message: 'Token inválido o expirado' });
    user.passwordHash = await bcrypt.hash(password, 10);
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    await user.save();
    res.json({ message: 'Contraseña actualizada' });
  } catch (e) {
    res.status(500).json({ message: 'Error restableciendo contraseña' });
  }
});

// Google OAuth endpoints
app.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'], session: false }));

app.get('/auth/google/callback', (req, res, next) => {
  passport.authenticate('google', { session: false }, (err, user, info) => {
    if (err || !user) {
      const reason = (info && info.message) || 'No autorizado';
      return res.redirect(`${CLIENT_URL}/login?error=${encodeURIComponent(reason)}`);
    }
    const token = signToken(user);
    setAuthCookie(res, token);
    return res.redirect(`${CLIENT_URL}/`);
  })(req, res, next);
});

// Rutas de administración (solo admin)
app.get('/admin/users', requireAuth, requireAdmin, async (req, res) => {
  try {
    if (!User) return res.status(500).json({ message: 'Base de datos no disponible' });
    const users = await User.find().select('email name role isActive provider createdAt avatarUrl');
    res.json({ users });
  } catch (e) {
    res.status(500).json({ message: 'Error listando usuarios' });
  }
});

app.post('/admin/users', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { email, name, role = 'user', password, isActive = true, provider = 'local' } = req.body;
    if (!email) return res.status(400).json({ message: 'Email requerido' });
    const emailRegex = /[^\s@]+@[^\s@]+\.[^\s@]+/;
    if (!emailRegex.test(email)) return res.status(400).json({ message: 'Email inválido' });
    if (provider === 'local' && !password) return res.status(400).json({ message: 'Contraseña requerida para usuario local' });
    if (!User) return res.status(500).json({ message: 'Base de datos no disponible' });
    const exists = await User.findOne({ email });
    if (exists) return res.status(409).json({ message: 'El usuario ya existe' });
    const defaultAvatars = [
      '/avatars/a1.svg','/avatars/a2.svg','/avatars/a3.svg','/avatars/a4.svg','/avatars/a5.svg',
      '/avatars/a6.svg','/avatars/a7.svg','/avatars/a8.svg','/avatars/a9.svg','/avatars/a10.svg'
    ];
    const randomAvatar = defaultAvatars[Math.floor(Math.random()*defaultAvatars.length)];
    const doc = { email, name, role, isActive, provider, avatarUrl: randomAvatar };
    if (provider === 'local') {
      doc.passwordHash = await bcrypt.hash(password, 10);
    }
    const created = await User.create(doc);
    res.status(201).json({ user: { email: created.email, name: created.name, role: created.role, isActive: created.isActive, provider: created.provider, avatarUrl: created.avatarUrl } });
  } catch (e) {
    res.status(500).json({ message: 'Error creando usuario' });
  }
});

app.put('/admin/users/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { email, name, role, isActive, avatarUrl, password } = req.body;
    if (!User) return res.status(500).json({ message: 'Base de datos no disponible' });
    
    const user = await User.findById(id);
    if (!user) return res.status(404).json({ message: 'Usuario no encontrado' });
    
    const updateData = {};
    if (email !== undefined) {
      const emailRegex = /[^\s@]+@[^\s@]+\.[^\s@]+/;
      if (!emailRegex.test(email)) return res.status(400).json({ message: 'Email inválido' });
      updateData.email = email;
    }
    if (name !== undefined) updateData.name = name;
    if (role !== undefined) updateData.role = role;
    if (isActive !== undefined) updateData.isActive = isActive;
    if (avatarUrl !== undefined) updateData.avatarUrl = avatarUrl;
    if (password !== undefined && password.trim()) {
      updateData.passwordHash = await bcrypt.hash(password, 10);
    }
    
    const updated = await User.findByIdAndUpdate(id, updateData, { new: true });
    res.json({ user: { email: updated.email, name: updated.name, role: updated.role, isActive: updated.isActive, provider: updated.provider, avatarUrl: updated.avatarUrl } });
  } catch (e) {
    res.status(500).json({ message: 'Error actualizando usuario' });
  }
});

// Endpoint para subir avatares personalizados
const multer = require('multer');
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'public/uploads/')
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9)
    cb(null, 'avatar-' + uniqueSuffix + '.' + file.originalname.split('.').pop())
  }
});
const upload = multer({ storage: storage });

app.post('/admin/upload-avatar', requireAuth, requireAdmin, upload.single('avatar'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No se subió ningún archivo' });
    }
    const avatarUrl = `/uploads/${req.file.filename}`;
    res.json({ avatarUrl });
  } catch (e) {
    res.status(500).json({ message: 'Error subiendo avatar' });
  }
});

// WebSocket connection
io.on('connection', (socket) => {
  console.log('🔌 Nuevo cliente conectado');
  
  socket.on('disconnect', () => {
    console.log('🔌 Cliente desconectado');
  });
});

// Configuración del puerto Serial
let port;
const SERIAL_RETRY_MS = Number(process.env.SERIAL_RETRY_MS || 30000); // 30 segundos por defecto
// Buffer para acumular datos de sensores individuales
let sensorDataBuffer = {};
let lastSensorUpdate = Date.now();
const SENSOR_TIMEOUT = 5000;
let serialReconnectTimer = null;
let isReconnecting = false;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 10; // Máximo 10 intentos antes de pausar

// Función para detectar si los datos son reales o ficticios
const isRealSensorData = (data) => {
  // Verificar si los datos provienen de sensores reales
  // Los datos ficticios tienen patrones aleatorios específicos
  const hasAllRequiredFields = data.humedadSuelo !== undefined && 
                              data.temperaturaBME !== undefined && 
                              data.humedadAire !== undefined &&
                              data.fecha !== undefined;
  
  // Verificar que no sean datos generados por generarDatosIniciales
  const isNotDummy = !data.isDummy && data.source === "real_sensor" && !data.generated;
  // Verificar que los valores estén en rangos realistas
  const realisticRanges = data.humedadSuelo >= 0 && data.humedadSuelo <= 100 &&
                         data.temperaturaBME >= -10 && data.temperaturaBME <= 50 &&
                         data.humedadAire >= 0 && data.humedadAire <= 100;
  return hasAllRequiredFields && isNotDummy && realisticRanges;
};

// Función para guardar datos acumulados
const saveAccumulatedData = async () => {
  if (Object.keys(sensorDataBuffer).length > 0) {
    const completeData = {
      ...sensorDataBuffer,
      fecha: new Date(),
      source: 'real_sensor', // Marcar como datos reales
      timestamp: Date.now()
    };
    
    console.log(`📡 Guardando datos acumulados:`, completeData);
    
    // SOLO guardar en MongoDB si los datos son reales
    if (Humedad && isRealSensorData(completeData)) {
      const nuevaLectura = new Humedad(completeData);
      await nuevaLectura.save();
      console.log(`💾 Datos REALES registrados en MongoDB`);
      
      // Emitir el nuevo dato a todos los clientes conectados
      io.emit('nueva-lectura', { ...completeData, fecha: nuevaLectura.fecha });
    } else if (Humedad) {
      console.log(`⚠️ Datos ficticios detectados - NO guardados en MongoDB`);
      console.log(`📊 Datos solo para visualización en tiempo real`);
      
      // Emitir datos para visualización pero no guardar en BD
      io.emit('nueva-lectura', { ...completeData, isDummy: true });
    } else {
      // Si no hay MongoDB, guardar en memoria solo datos reales
      if (isRealSensorData(completeData)) {
        datosHumedad.unshift(completeData);
        if (datosHumedad.length > 100) datosHumedad.pop();
        console.log(`💾 Datos REALES registrados en memoria`);
      } else {
        console.log(`⚠️ Datos ficticios - solo para visualización`);
      }
      
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

async function listAvailablePorts() {
  try {
    const ports = await SerialPort.list();
    if (ports.length === 0) {
      console.log('📋 No se encontraron puertos seriales disponibles');
    } else {
      console.log('📋 Puertos seriales disponibles:');
      ports.forEach(port => {
        console.log(`   - ${port.path} (${port.manufacturer || 'Sin fabricante'})`);
      });
    }
    return ports;
  } catch (error) {
    console.error('❌ Error al listar puertos:', error.message);
    return [];
  }
}

function scheduleSerialReconnect() {
  if (serialReconnectTimer || isReconnecting) {
    return; // Silenciosamente ignorar si ya hay una reconexión programada
  }
  
  reconnectAttempts++;
  
  if (reconnectAttempts > MAX_RECONNECT_ATTEMPTS) {
    console.log(`⏸️ Demasiados intentos de reconexión (${reconnectAttempts}). Pausando por 5 minutos...`);
    serialReconnectTimer = setTimeout(() => {
      reconnectAttempts = 0;
      serialReconnectTimer = null;
      scheduleSerialReconnect();
    }, 5 * 60 * 1000); // 5 minutos
    return;
  }
  
  console.log(`⏰ Intento ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS}: Reconectando en ${SERIAL_RETRY_MS/1000} segundos...`);
  serialReconnectTimer = setTimeout(() => {
    serialReconnectTimer = null;
    isReconnecting = true;
    connectSerialPort();
  }, SERIAL_RETRY_MS);
}

function connectSerialPort() {
  const desiredPath = process.env.USB_PORT || '/dev/ttyUSB0';
  
  // Verificar si el archivo del puerto existe
  if (!fs.existsSync(desiredPath)) {
    console.log(`⚠️ Puerto ${desiredPath} no encontrado.`);
    if (reconnectAttempts === 1) {
      // Solo listar puertos en el primer intento
      listAvailablePorts();
    }
    scheduleSerialReconnect();
    return;
  }
  
  // Limpiar conexión anterior si existe
  if (port) {
    try {
      port.removeAllListeners();
      if (port.isOpen) {
        port.close();
      }
    } catch (error) {
      // Ignorar errores al cerrar
    }
    port = null;
  }
  
  try {
    console.log(`🔌 Conectando a ${desiredPath}...`);
    port = new SerialPort({ path: desiredPath, baudRate: 115200 });

    let buffer = '';

    port.on('open', () => {
      console.log(`✅ Puerto serial conectado exitosamente`);
      isReconnecting = false;
      reconnectAttempts = 0; // Resetear contador de intentos
      if (serialReconnectTimer) {
        clearTimeout(serialReconnectTimer);
        serialReconnectTimer = null;
      }
    });

    port.on('data', async (data) => {
      buffer += data.toString();
      let lines = buffer.split('\n');
      if (lines.length > 1) {
        buffer = lines.pop();
        for (const line of lines) {
          const parsedData = parseSensorData(line);
          if (parsedData && Object.keys(parsedData).length > 0) {
            // Solo loggear datos importantes, no todos los datos
            if (parsedData.alerta) {
              console.log(`🚨 ALERTA detectada:`, parsedData);
            }
            Object.assign(sensorDataBuffer, parsedData);
            lastSensorUpdate = Date.now();
            const expectedFields = ['humedadSuelo', 'temperaturaDS', 'temperaturaBME', 'presion', 'humedadAire', 'luminosidad', 'lluvia', 'alerta'];
            const bufferHasAllFields = expectedFields.every(field => Object.prototype.hasOwnProperty.call(sensorDataBuffer, field));
            if (bufferHasAllFields) {
              await saveAccumulatedData();
            }
          }
        }
      }
    });

    port.on('close', () => {
      console.log('⚠️ Puerto serial desconectado');
      isReconnecting = false;
      scheduleSerialReconnect();
    });

    port.on('error', (err) => {
      console.error('❌ Error en puerto serial:', err.message);
      isReconnecting = false;
      try { 
        if (port) {
          port.removeAllListeners();
          // Solo cerrar si está abierto
          if (port.isOpen) {
            port.close(); 
          }
        }
      } catch (closeError) {
        // Ignorar errores al cerrar
      }
      port = null;
      scheduleSerialReconnect();
    });
  } catch (error) {
    console.error(`❌ Error al inicializar puerto serial: ${error.message}`);
    isReconnecting = false;
    port = null;
    scheduleSerialReconnect();
  }
}

connectSerialPort();

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

app.get('/api/serial-status', async (req, res) => {
  try {
    const ports = await listAvailablePorts();
    const desiredPath = process.env.USB_PORT || '/dev/ttyUSB0';
    const portExists = fs.existsSync(desiredPath);
    
    res.json({
      connected: port && port.isOpen,
      desiredPort: desiredPath,
      portExists: portExists,
      availablePorts: ports,
      reconnectAttempts: reconnectAttempts,
      isReconnecting: isReconnecting
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
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

