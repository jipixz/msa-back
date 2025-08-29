# Comandos MongoDB para Actualizar Base de Datos

## Actualización desde MongoDB Compass o Shell

### 1. Conectar a la base de datos
```javascript
use msa_db
```

### 2. Actualizar campo 'alerta' a 'rainDigital' y añadir 'nodo'
```javascript
// Actualizar todos los documentos que tengan el campo 'alerta'
db.humedads.updateMany(
  { alerta: { $exists: true } },
  [
    {
      $set: {
        rainDigital: "$alerta",  // Copiar valor de 'alerta' a 'rainDigital'
        nodo: 0  // Asignar nodo por defecto
      }
    },
    {
      $unset: "alerta"  // Eliminar el campo 'alerta'
    }
  ]
)
```

### 3. Verificar la actualización
```javascript
// Contar documentos con el nuevo campo 'rainDigital'
db.humedads.countDocuments({ rainDigital: { $exists: true } })

// Contar documentos con el nuevo campo 'nodo'
db.humedads.countDocuments({ nodo: { $exists: true } })

// Verificar que no queden documentos con 'alerta'
db.humedads.countDocuments({ alerta: { $exists: true } })
```

### 4. Ver estadísticas por nodo
```javascript
db.humedads.aggregate([
  { $group: { _id: "$nodo", count: { $sum: 1 } } },
  { $sort: { _id: 1 } }
])
```

### 5. Ver un documento de ejemplo
```javascript
db.humedads.findOne({ rainDigital: { $exists: true } })
```

## Comandos Adicionales

### Asignar nodos específicos a registros existentes
```javascript
// Asignar nodo 0 a registros de la parcela baja
db.humedads.updateMany(
  { nodo: 0, humedadSuelo: { $lt: 50 } },
  { $set: { nodo: 0 } }
)

// Asignar nodo 1 a registros de la parcela baja
db.humedads.updateMany(
  { nodo: 0, humedadSuelo: { $gte: 50 } },
  { $set: { nodo: 1 } }
)

// Asignar nodo 2 a registros de la parcela alta
db.humedads.updateMany(
  { nodo: 0, temperaturaBME: { $gt: 28 } },
  { $set: { nodo: 2 } }
)

// Asignar nodo 3 a registros de la parcela alta
db.humedads.updateMany(
  { nodo: 0, temperaturaBME: { $lte: 28 } },
  { $set: { nodo: 3 } }
)
```

### Crear índices para optimizar consultas por nodo
```javascript
// Crear índice en el campo 'nodo'
db.humedads.createIndex({ nodo: 1 })

// Crear índice compuesto en 'nodo' y 'fecha'
db.humedads.createIndex({ nodo: 1, fecha: -1 })
```

### Consultas útiles por nodo
```javascript
// Obtener últimos 100 registros del nodo 0
db.humedads.find({ nodo: 0 }).sort({ fecha: -1 }).limit(100)

// Obtener registros de lluvia por nodo
db.humedads.find({ rainDigital: true }).group({ _id: "$nodo", count: { $sum: 1 } })

// Obtener temperatura promedio por nodo
db.humedads.aggregate([
  { $group: { _id: "$nodo", avgTemp: { $avg: "$temperaturaBME" } } },
  { $sort: { _id: 1 } }
])
```

## Script de Bash para ejecutar desde terminal

```bash
#!/bin/bash

# Conectar a MongoDB y ejecutar comandos
mongosh "mongodb://localhost:27017/msa_db" --eval "
  // Actualizar campo 'alerta' a 'rainDigital'
  db.humedads.updateMany(
    { alerta: { \$exists: true } },
    [
      {
        \$set: {
          rainDigital: '\$alerta',
          nodo: 0
        }
      },
      {
        \$unset: 'alerta'
      }
    ]
  );
  
  // Mostrar estadísticas
  print('Documentos actualizados:', db.humedads.countDocuments({ rainDigital: { \$exists: true } }));
  print('Documentos con nodo:', db.humedads.countDocuments({ nodo: { \$exists: true } }));
"
```

## Notas Importantes

1. **Hacer backup antes de ejecutar**: Siempre hacer un respaldo de la base de datos antes de ejecutar actualizaciones masivas.

2. **Verificar la conexión**: Asegurarse de estar conectado a la base de datos correcta.

3. **Ejecutar en orden**: Los comandos deben ejecutarse en el orden especificado.

4. **Monitorear resultados**: Verificar que los cambios se aplicaron correctamente.

5. **Actualizar aplicaciones**: Después de actualizar la BD, reiniciar las aplicaciones que usen estos datos.
