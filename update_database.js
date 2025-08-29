const mongoose = require('mongoose');
require('dotenv').config();

// Conectar a MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/msa_db', {
  useNewUrlParser: true,
  useUnifiedTopology: true
});

// Esquema actualizado
const humedadSchema = new mongoose.Schema({
  humedadSuelo: Number,
  temperaturaDS: Number,
  temperaturaBME: Number,
  presion: Number,
  humedadAire: Number,
  luminosidad: Number,
  lluvia: Number,
  rainDigital: Boolean, // Nuevo campo
  nodo: { type: Number, min: 0, max: 3, default: 0 }, // Nuevo campo con valor por defecto
  fecha: { type: Date, default: Date.now },
  source: { type: String, default: 'real_sensor' },
  timestamp: { type: Number }
});

const Humedad = mongoose.model('Humedad', humedadSchema);

async function updateDatabase() {
  try {
    console.log('🔄 Iniciando actualización de la base de datos...');
    
    // 1. Actualizar documentos existentes: cambiar 'alerta' por 'rainDigital'
    const updateResult = await Humedad.updateMany(
      { alerta: { $exists: false } },
      [
        {
          $set: {
            rainDigital: false, // Copiar valor de 'alerta' a 'rainDigital'
            nodo: 0 // Asignar nodo por defecto
          }
        },
        {
          $unset: 'alerta' // Eliminar el campo 'alerta'
        }
      ]
    );
    
    console.log(`✅ Actualizados ${updateResult.modifiedCount} documentos`);
    
    // 2. Verificar que no queden documentos con el campo 'alerta'
    const remainingAlerts = await Humedad.countDocuments({ alerta: { $exists: true } });
    console.log(`📊 Documentos restantes con campo 'alerta': ${remainingAlerts}`);
    
    // 3. Verificar documentos con el nuevo campo 'rainDigital'
    const rainDigitalCount = await Humedad.countDocuments({ rainDigital: { $exists: true } });
    console.log(`📊 Documentos con campo 'rainDigital': ${rainDigitalCount}`);
    
    // 4. Verificar documentos con el nuevo campo 'nodo'
    const nodoCount = await Humedad.countDocuments({ nodo: { $exists: true } });
    console.log(`📊 Documentos con campo 'nodo': ${nodoCount}`);
    
    // 5. Mostrar estadísticas por nodo
    const nodoStats = await Humedad.aggregate([
      { $group: { _id: '$nodo', count: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ]);
    
    console.log('📊 Distribución por nodos:');
    nodoStats.forEach(stat => {
      console.log(`   Nodo ${stat._id}: ${stat.count} registros`);
    });
    
    console.log('✅ Actualización completada exitosamente');
    
  } catch (error) {
    console.error('❌ Error durante la actualización:', error);
  } finally {
    mongoose.connection.close();
    console.log('🔌 Conexión a MongoDB cerrada');
  }
}

// Ejecutar la actualización
updateDatabase();
