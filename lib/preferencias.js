// Preferencias de interfaz de cada usuario (estilo, variante, modo claro/oscuro y
// personalización por estilo). Se validan con reglas estrictas para no guardar basura.

const FONDOS = ['estilo', 'oled', 'oscuro-gris', 'oscuro-azulino', 'oscuro-sepia', 'sepia-claro', 'claro'];
const ID_ESTILO = /^[a-z]\d{2}-[a-z]{2,20}$/;
const ID_VARIANTE = /^[a-z-]{1,24}$/;
const HEX = /^#[0-9a-fA-F]{6}$/;
const MAX_BYTES = 8 * 1024;
const MAX_ESTILOS = 40;

const color = (c) => (c === null || c === undefined ? null : HEX.test(c) ? c.toLowerCase() : undefined);

/**
 * Devuelve las preferencias limpias o null si no son válidas.
 * Formato: { estilo, variante, modo: 'claro'|'oscuro', per: { [estiloId]: { fondo, acento, acento2 } } }
 */
function validarPreferencias(p) {
  if (!p || typeof p !== 'object' || Array.isArray(p)) return null;
  if (Buffer.byteLength(JSON.stringify(p), 'utf8') > MAX_BYTES) return null;
  if (typeof p.estilo !== 'string' || !ID_ESTILO.test(p.estilo)) return null;
  if (typeof p.variante !== 'string' || !ID_VARIANTE.test(p.variante)) return null;
  if (p.modo !== 'claro' && p.modo !== 'oscuro') return null;

  const per = {};
  if (p.per !== undefined) {
    if (!p.per || typeof p.per !== 'object' || Array.isArray(p.per)) return null;
    const entradas = Object.entries(p.per);
    if (entradas.length > MAX_ESTILOS) return null;
    for (const [id, v] of entradas) {
      if (!ID_ESTILO.test(id) || !v || typeof v !== 'object') return null;
      if (!FONDOS.includes(v.fondo)) return null;
      const acento = color(v.acento);
      const acento2 = color(v.acento2);
      if (acento === undefined || acento2 === undefined) return null;
      per[id] = { fondo: v.fondo, acento, acento2 };
    }
  }
  return { estilo: p.estilo, variante: p.variante, modo: p.modo, per };
}

module.exports = { validarPreferencias, FONDOS };
