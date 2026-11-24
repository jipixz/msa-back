const { dispatch } = require('./channels');
const { evaluateRule, isInCooldown, buildMessage } = require('./rules-engine');
const defaultRules = require('./default-rules');

let NotifierRule = null;
let NotifierLog = null;
let ioRef = null;
let ready = false;

const conditionSchemaDef = {
  field: String,
  op: String,
  value: {} // mongoose.Mixed-compatible: number, [min,max], boolean, etc.
};

function defineModels(mongoose) {
  const { Schema } = mongoose;

  const ruleSchema = new Schema({
    key: { type: String, unique: true, sparse: true },
    name: { type: String, required: true },
    description: { type: String, default: '' },
    enabled: { type: Boolean, default: true },
    nodes: { type: [Number], default: [] },
    match: { type: String, enum: ['all', 'any'], default: 'all' },
    conditions: { type: [conditionSchemaDef], default: [] },
    message: {
      title: String,
      body: String,
      priority: { type: String, default: 'default' },
      tags: { type: [String], default: [] }
    },
    channels: { type: [String], default: ['ntfy', 'telegram'] },
    cooldownMinutes: { type: Number, default: 60 },
    lastTriggered: { type: Date, default: null },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
  });

  const logSchema = new Schema({
    ruleId: { type: Schema.Types.ObjectId, ref: 'NotifierRule' },
    ruleName: String,
    reading: {},
    message: {},
    channels: [String],
    results: {},
    triggeredAt: { type: Date, default: Date.now }
  });

  NotifierRule = mongoose.model('NotifierRule', ruleSchema);
  NotifierLog = mongoose.model('NotifierLog', logSchema);
}

async function seedDefaults() {
  if (!NotifierRule) return;
  for (const rule of defaultRules) {
    const existing = await NotifierRule.findOne({ key: rule.key });
    if (!existing) await NotifierRule.create(rule);
  }
}

async function init({ mongoose, io }) {
  if (!mongoose) {
    console.log('⚠️ Notifier: MongoDB no disponible — sistema de notificaciones deshabilitado');
    return;
  }
  defineModels(mongoose);
  await seedDefaults();
  ioRef = io || null;
  ready = true;
  const channels = [];
  if (process.env.NTFY_TOPIC) channels.push(`ntfy(${process.env.NTFY_TOPIC})`);
  if (process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID) channels.push('telegram');
  console.log(`🔔 Notifier listo. Canales activos: ${channels.length ? channels.join(', ') : '(ninguno — configura NTFY_TOPIC y/o TELEGRAM_*)'}`);
}

async function evaluate(reading) {
  if (!ready || !NotifierRule) return;
  try {
    const rules = await NotifierRule.find({ enabled: true }).lean();
    for (const rule of rules) {
      if (!evaluateRule(reading, rule)) continue;
      if (isInCooldown(rule)) continue;
      const message = buildMessage(rule, reading);
      const results = await dispatch(rule.channels, message);
      await NotifierRule.updateOne({ _id: rule._id }, { lastTriggered: new Date() });
      const log = await NotifierLog.create({
        ruleId: rule._id,
        ruleName: rule.name,
        reading,
        message,
        channels: rule.channels,
        results
      });
      if (ioRef) {
        ioRef.emit('notifier-alert', {
          ruleId: rule._id,
          ruleName: rule.name,
          message,
          triggeredAt: log.triggeredAt
        });
      }
      console.log(`🔔 Alerta disparada: ${rule.name} → ${rule.channels.join(', ')}`);
    }
  } catch (err) {
    console.error('❌ Notifier evaluate:', err.message);
  }
}

function registerRoutes(app, requireAuth, requireAdmin) {
  app.get('/api/notifier/rules', requireAuth, requireAdmin, async (req, res) => {
    if (!NotifierRule) return res.status(503).json({ message: 'Notifier no inicializado' });
    const rules = await NotifierRule.find().sort({ createdAt: 1 });
    res.json({ rules });
  });

  app.post('/api/notifier/rules', requireAuth, requireAdmin, async (req, res) => {
    if (!NotifierRule) return res.status(503).json({ message: 'Notifier no inicializado' });
    try {
      const rule = await NotifierRule.create({ ...req.body, updatedAt: new Date() });
      res.status(201).json({ rule });
    } catch (e) {
      res.status(400).json({ message: e.message });
    }
  });

  app.put('/api/notifier/rules/:id', requireAuth, requireAdmin, async (req, res) => {
    if (!NotifierRule) return res.status(503).json({ message: 'Notifier no inicializado' });
    try {
      const rule = await NotifierRule.findByIdAndUpdate(
        req.params.id,
        { ...req.body, updatedAt: new Date() },
        { new: true }
      );
      if (!rule) return res.status(404).json({ message: 'Regla no encontrada' });
      res.json({ rule });
    } catch (e) {
      res.status(400).json({ message: e.message });
    }
  });

  app.delete('/api/notifier/rules/:id', requireAuth, requireAdmin, async (req, res) => {
    if (!NotifierRule) return res.status(503).json({ message: 'Notifier no inicializado' });
    const r = await NotifierRule.findByIdAndDelete(req.params.id);
    if (!r) return res.status(404).json({ message: 'Regla no encontrada' });
    res.json({ message: 'Eliminada' });
  });

  app.post('/api/notifier/test', requireAuth, requireAdmin, async (req, res) => {
    const { channel, title = 'Prueba MSA Cacao', body = 'Notificación de prueba ✅' } = req.body || {};
    const channels = channel ? [channel] : ['ntfy', 'telegram'];
    const results = await dispatch(channels, { title, body, priority: 'default', tags: ['test_tube'] });
    res.json({ results });
  });

  app.get('/api/notifier/history', requireAuth, requireAdmin, async (req, res) => {
    if (!NotifierLog) return res.status(503).json({ message: 'Notifier no inicializado' });
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const logs = await NotifierLog.find().sort({ triggeredAt: -1 }).limit(limit);
    res.json({ logs });
  });

  app.post('/api/notifier/rules/:id/reset-cooldown', requireAuth, requireAdmin, async (req, res) => {
    if (!NotifierRule) return res.status(503).json({ message: 'Notifier no inicializado' });
    const r = await NotifierRule.findByIdAndUpdate(req.params.id, { lastTriggered: null }, { new: true });
    if (!r) return res.status(404).json({ message: 'Regla no encontrada' });
    res.json({ rule: r });
  });
}

module.exports = { init, evaluate, registerRoutes };
