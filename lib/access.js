// Cloudflare Access: destino seguro para /access/return.
// Solo se permite volver al front (CLIENT_URL); cualquier otra cosa manda a su portada,
// para que la ruta no sirva como open redirect.
function safeReturnUrl(to, clientUrl) {
  try {
    const destino = new URL(String(to || ''));
    if (destino.origin === clientUrl) return destino.href;
  } catch (_) {
    // "to" vacío o inválido
  }
  return clientUrl;
}

module.exports = { safeReturnUrl };
