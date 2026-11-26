const OPERATORS = {
  '>': (a, b) => Number(a) > Number(b),
  '>=': (a, b) => Number(a) >= Number(b),
  '<': (a, b) => Number(a) < Number(b),
  '<=': (a, b) => Number(a) <= Number(b),
  '==': (a, b) => a == b,
  '!=': (a, b) => a != b,
  'between': (a, [min, max]) => Number(a) >= Number(min) && Number(a) <= Number(max),
  'outside': (a, [min, max]) => Number(a) < Number(min) || Number(a) > Number(max),
  'is_true': (a) => a === true || a === 'true' || a === 1,
  'is_false': (a) => a === false || a === 'false' || a === 0
};

function evaluateCondition(reading, cond) {
  if (!cond || !cond.field) return false;
  let value = reading[cond.field];
  if (value === undefined || value === null) return false;
  // Listas (p. ej. sensoresFallidos): "es verdadero" = tiene al menos un elemento
  if (Array.isArray(value) && (cond.op === 'is_true' || cond.op === 'is_false')) value = value.length > 0;
  const op = OPERATORS[cond.op];
  if (!op) return false;
  return op(value, cond.value);
}

function evaluateRule(reading, rule) {
  if (!rule.enabled) return false;
  if (Array.isArray(rule.nodes) && rule.nodes.length > 0) {
    if (!rule.nodes.includes(reading.nodo)) return false;
  }
  if (!Array.isArray(rule.conditions) || rule.conditions.length === 0) return false;
  const match = rule.match === 'any' ? 'any' : 'all';
  if (match === 'all') return rule.conditions.every((c) => evaluateCondition(reading, c));
  return rule.conditions.some((c) => evaluateCondition(reading, c));
}

function isInCooldown(rule) {
  if (!rule.lastTriggered || !rule.cooldownMinutes) return false;
  const elapsedMs = Date.now() - new Date(rule.lastTriggered).getTime();
  return elapsedMs < rule.cooldownMinutes * 60 * 1000;
}

function renderTemplate(template, reading) {
  if (!template) return '';
  return String(template).replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key) => {
    const v = reading[key];
    if (v === undefined || v === null) return '';
    if (typeof v === 'number') return Number.isInteger(v) ? String(v) : v.toFixed(1);
    if (v instanceof Date) return v.toISOString();
    if (Array.isArray(v)) return v.join(', ');
    return String(v);
  });
}

function buildMessage(rule, reading) {
  return {
    title: renderTemplate(rule.message?.title, reading) || rule.name,
    body: renderTemplate(rule.message?.body, reading) || '',
    priority: rule.message?.priority || 'default',
    tags: rule.message?.tags || []
  };
}

module.exports = { evaluateRule, isInCooldown, buildMessage, renderTemplate };
