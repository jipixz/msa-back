# Cambios Realizados - Adaptación a Nuevos Campos

## Resumen de Cambios

Se han realizado las siguientes adaptaciones para manejar los nuevos campos `rainDigital` (booleano) y `nodo` (0-3) en el sistema MSA.

## 1. Cambios en el Backend (msa-back/index.js)

### Esquema de Base de Datos
- **Campo eliminado**: `alerta: Boolean`
- **Campo añadido**: `rainDigital: Boolean` - Indica si está lloviendo o no
- **Campo añadido**: `nodo: Number` - Identifica el nodo (0-3)

### Función de Parsing de Datos
- **Mapeo actualizado**: `Alert: 'alerta'` → `RainD: 'rainDigital'`
- **Nuevo mapeo**: `Nodo: 'nodo'`
- **Validación actualizada**: Manejo de valores booleanos para `rainDigital`
- **Validación añadida**: Conversión de string a número para `nodo`

### Logs y Mensajes
- **Cambio de mensaje**: `🚨 ALERTA detectada` → `🌧️ LLUVIA detectada en nodo X`
- **Información adicional**: Incluye el número de nodo en los logs

### Campos Esperados
- **Actualizado**: Lista de campos esperados incluye `rainDigital` y `nodo`
- **Eliminado**: Campo `alerta` de la lista

## 2. Scripts de Actualización de Base de Datos

### update_database.js
- **Función**: Actualiza automáticamente la base de datos existente
- **Acciones**:
  - Copia valores de `alerta` a `rainDigital`
  - Asigna `nodo: 0` por defecto a registros existentes
  - Elimina el campo `alerta`
  - Muestra estadísticas de la actualización

### mongodb_commands.md
- **Comandos directos**: Para ejecutar en MongoDB Compass o shell
- **Scripts bash**: Para ejecutar desde terminal
- **Consultas útiles**: Para verificar y analizar datos por nodo

## 3. Adaptaciones en el Microservicio de Predicciones (msa-lrpy)

### Nuevos Modelos de Datos
- **EntradaPrediccion**: Añadido campo `nodo: int = None`
- **EntradaPrediccionNodo**: Nuevo modelo para predicciones específicas por nodo

### Función de Obtención de Datos
- **Parámetro añadido**: `nodo=None` en `obtener_datos()`
- **Filtrado**: Consulta específica por nodo cuando se especifica

### Nuevos Endpoints
- `/predictions/node/{nodo}/temperature` - Temperatura por nodo
- `/predictions/node/{nodo}/humidity` - Humedad por nodo
- `/predictions/node/{nodo}/rainfall` - Lluvia por nodo
- `/predictions/node/{nodo}/soil-moisture` - Humedad del suelo por nodo
- `/predictions/node/{nodo}/all` - Todas las predicciones por nodo

### Funciones de Predicción
- **predecir_por_nodo()**: Nueva función para predicciones específicas por nodo
- **predecir_campo()**: Actualizada para aceptar parámetro `nodo`
- **Cache**: Claves de cache incluyen información del nodo

## 4. Documentación Actualizada

### README.md (msa-lrpy)
- **Nuevos endpoints**: Documentación de endpoints por nodo
- **Ejemplos de uso**: Cómo usar las nuevas funcionalidades

## 5. Consideraciones para las Predicciones

### Estrategia de Nodos
**Recomendación**: Las predicciones pueden ser independientes del nodo ya que:
- Los nodos están a menos de 1km de distancia
- Las condiciones climáticas serán similares
- Solo hay diferencia de altura entre parcelas

**Alternativas**:
1. **Predicción unificada**: Usar datos de todos los nodos para predicciones más robustas
2. **Predicción por parcela**: Agrupar nodos 0-1 (parcela baja) y 2-3 (parcela alta)
3. **Predicción individual**: Predicciones específicas por nodo para mayor precisión

## 6. Instrucciones de Implementación

### Paso 1: Actualizar Base de Datos
```bash
# Opción A: Usar script Node.js
cd msa-back
node update_database.js

# Opción B: Usar comandos MongoDB directamente
# Ver archivo mongodb_commands.md
```

### Paso 2: Reiniciar Servicios
```bash
# Reiniciar backend
cd msa-back
npm start

# Reiniciar microservicio de predicciones
cd msa-lrpy
uvicorn apps.main:app --reload --host 0.0.0.0 --port 8000
```

### Paso 3: Verificar Funcionamiento
- Verificar que los nuevos campos se guardan correctamente
- Probar endpoints de predicción por nodo
- Verificar logs de lluvia por nodo

## 7. Formato de Datos del Nodo LoRa

### Formato Esperado
```
HS:45.2|T1:25.3|T2:26.1|P:1013|HA:65.8|Lux:450|Rain:0.0|RainD:SI|Nodo:2
```

### Campos
- `HS`: Humedad del suelo (%)
- `T1`: Temperatura DS (°C)
- `T2`: Temperatura BME (°C)
- `P`: Presión (hPa)
- `HA`: Humedad del aire (%)
- `Lux`: Luminosidad (lx)
- `Rain`: Lluvia (mm)
- `RainD`: Lluvia digital (SI/NO, YES/NO, 1/0, true/false)
- `Nodo`: ID del nodo (0-3)

## 8. Beneficios de los Cambios

1. **Mayor precisión**: Identificación específica de qué nodo detecta lluvia
2. **Análisis por ubicación**: Posibilidad de analizar diferencias entre nodos
3. **Escalabilidad**: Sistema preparado para múltiples nodos
4. **Flexibilidad**: Predicciones específicas por nodo o generales
5. **Mejor monitoreo**: Logs más informativos con identificación de nodo

## 9. Próximos Pasos Recomendados

1. **Implementar en frontend**: Adaptar la interfaz para mostrar información por nodo
2. **Análisis de diferencias**: Estudiar variaciones entre nodos de diferentes alturas
3. **Optimización de predicciones**: Evaluar si las predicciones por nodo son más precisas
4. **Alertas por nodo**: Implementar sistema de alertas específicas por ubicación
