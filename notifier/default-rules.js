// Reglas por defecto basadas en agronomía del cacao (Theobroma cacao).
// Rangos óptimos: T 21-32°C, HR 70-100% (~80%), HSuelo 60-80%, sombra parcial.
// Enfermedades clave: moniliasis y escoba de bruja (favorecidas por HR>90% + T 22-27°C).

module.exports = [
  {
    key: 'temp_alta_critica',
    name: 'Temperatura crítica alta',
    description: 'Temperatura del aire por encima de 35 °C: riesgo de estrés térmico en el cultivo de cacao.',
    enabled: true,
    nodes: [],
    match: 'all',
    conditions: [{ field: 'temperaturaBME', op: '>', value: 35 }],
    message: {
      title: '🔥 Temperatura crítica alta — Nodo {{nodo}}',
      body: 'La temperatura subió a {{temperaturaBME}}°C. Considera aumentar sombra o riego foliar para reducir estrés térmico en el cacao.',
      priority: 'high',
      tags: ['fire', 'thermometer']
    },
    channels: ['ntfy', 'telegram'],
    cooldownMinutes: 60
  },
  {
    key: 'temp_baja_critica',
    name: 'Temperatura crítica baja',
    description: 'Temperatura del aire por debajo de 15 °C: el cacao no tolera frío prolongado.',
    enabled: true,
    nodes: [],
    match: 'all',
    conditions: [{ field: 'temperaturaBME', op: '<', value: 15 }],
    message: {
      title: '🥶 Temperatura crítica baja — Nodo {{nodo}}',
      body: 'La temperatura bajó a {{temperaturaBME}}°C. Riesgo de daño foliar en el cacao.',
      priority: 'high',
      tags: ['snowflake', 'thermometer']
    },
    channels: ['ntfy', 'telegram'],
    cooldownMinutes: 60
  },
  {
    key: 'humedad_aire_baja',
    name: 'Humedad de aire baja',
    description: 'Humedad relativa por debajo de 60%: estrés hídrico para el cacao.',
    enabled: true,
    nodes: [],
    match: 'all',
    conditions: [{ field: 'humedadAire', op: '<', value: 60 }],
    message: {
      title: '🌵 Humedad de aire baja — Nodo {{nodo}}',
      body: 'HR del aire en {{humedadAire}}%. El cacao se beneficia de HR ≥ 70%. Revisa cobertura de sombra y riego.',
      priority: 'default',
      tags: ['cactus']
    },
    channels: ['ntfy', 'telegram'],
    cooldownMinutes: 120
  },
  {
    key: 'humedad_suelo_seca',
    name: 'Humedad de suelo crítica (sequía)',
    description: 'Humedad de suelo por debajo de 30%: necesidad inmediata de riego.',
    enabled: true,
    nodes: [],
    match: 'all',
    conditions: [{ field: 'humedadSuelo', op: '<', value: 30 }],
    message: {
      title: '💧 Suelo seco — Nodo {{nodo}}',
      body: 'Humedad de suelo en {{humedadSuelo}}%. Riego recomendado para evitar estrés hídrico en el cacao.',
      priority: 'high',
      tags: ['droplet', 'warning']
    },
    channels: ['ntfy', 'telegram'],
    cooldownMinutes: 90
  },
  {
    key: 'humedad_suelo_saturada',
    name: 'Suelo saturado (riesgo de pudrición)',
    description: 'Humedad de suelo por encima de 90%: riesgo de pudrición de raíces y hongos.',
    enabled: true,
    nodes: [],
    match: 'all',
    conditions: [{ field: 'humedadSuelo', op: '>', value: 90 }],
    message: {
      title: '🌊 Suelo saturado — Nodo {{nodo}}',
      body: 'Humedad de suelo en {{humedadSuelo}}%. Verifica drenaje: el cacao es susceptible a pudrición radicular.',
      priority: 'high',
      tags: ['ocean', 'warning']
    },
    channels: ['ntfy', 'telegram'],
    cooldownMinutes: 90
  },
  {
    key: 'riesgo_moniliasis',
    name: 'Riesgo de Moniliasis',
    description: 'Combinación HR>90% + T entre 22-27°C: condiciones óptimas para Moniliophthora roreri.',
    enabled: true,
    nodes: [],
    match: 'all',
    conditions: [
      { field: 'humedadAire', op: '>', value: 90 },
      { field: 'temperaturaBME', op: 'between', value: [22, 27] }
    ],
    message: {
      title: '🍫 Riesgo fitosanitario — Moniliasis (Nodo {{nodo}})',
      body: 'HR {{humedadAire}}% y T {{temperaturaBME}}°C: condiciones ideales para moniliasis. Considera inspección de mazorcas y manejo preventivo (poda sanitaria, remoción de mazorcas enfermas).',
      priority: 'urgent',
      tags: ['microbe', 'rotating_light']
    },
    channels: ['ntfy', 'telegram'],
    cooldownMinutes: 240
  },
  {
    key: 'lluvia_detectada',
    name: 'Lluvia detectada',
    description: 'Sensor digital de lluvia activado.',
    enabled: false,
    nodes: [],
    match: 'all',
    conditions: [{ field: 'rainDigital', op: 'is_true' }],
    message: {
      title: '🌧️ Lluvia detectada — Nodo {{nodo}}',
      body: 'Lluvia activa. Aplaza fertilizaciones foliares y revisa drenajes.',
      priority: 'low',
      tags: ['cloud_with_rain']
    },
    channels: ['ntfy'],
    cooldownMinutes: 30
  },
  {
    key: 'insolacion_excesiva',
    name: 'Insolación excesiva',
    description: 'Luminosidad por encima de 1500 lx: el cacao prefiere sombra parcial.',
    enabled: true,
    nodes: [],
    match: 'all',
    conditions: [{ field: 'luminosidad', op: '>', value: 1500 }],
    message: {
      title: '☀️ Insolación alta — Nodo {{nodo}}',
      body: 'Luminosidad {{luminosidad}} lx. El cacao requiere sombra (40-60%). Revisa cobertura de árboles de sombra.',
      priority: 'default',
      tags: ['sunny']
    },
    channels: ['ntfy'],
    cooldownMinutes: 180
  }
];
