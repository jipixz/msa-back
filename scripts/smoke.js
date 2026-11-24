// Smoke test del backend en marcha (solo lectura). Uso en la Pi:
//   BASE_URL=http://127.0.0.1:5000 node scripts/smoke.js
const BASE = process.env.BASE_URL || 'http://127.0.0.1:5000';
const FRONT = process.env.CLIENT_URL || 'https://msafront.jipixz.com';

const checks = [
  ['GET /access/ping responde {ok:true}', async () => {
    const r = await fetch(`${BASE}/access/ping`);
    return r.ok && (await r.json()).ok === true;
  }],
  ['GET /access/return no es open redirect', async () => {
    const r = await fetch(`${BASE}/access/return?to=https://google.com`, { redirect: 'manual' });
    return r.status === 302 && r.headers.get('location') === FRONT;
  }],
  ['CORS: origen del front con credenciales', async () => {
    const r = await fetch(`${BASE}/api`, { headers: { Origin: FRONT } });
    return r.headers.get('access-control-allow-origin') === FRONT && r.headers.get('access-control-allow-credentials') === 'true';
  }],
  ['CORS: origen ajeno sin cabecera', async () => {
    const r = await fetch(`${BASE}/api`, { headers: { Origin: 'https://evil.com' } });
    return !r.headers.get('access-control-allow-origin');
  }],
  ['ruta desconocida → 404 JSON (c7688e9)', async () => {
    const r = await fetch(`${BASE}/no-existe-${Date.now()}`);
    return r.status === 404 && (r.headers.get('content-type') || '').includes('json');
  }],
  ['notifier exige sesión (401/403 sin cookie)', async () => {
    const r = await fetch(`${BASE}/api/notifier/rules`);
    return r.status === 401 || r.status === 403;
  }],
  ['/api/datos-sensores responde < 2 s', async () => {
    const t = Date.now();
    const r = await fetch(`${BASE}/api/datos-sensores`);
    const dt = Date.now() - t;
    console.log(`      (${dt} ms)`);
    return r.ok && dt < 2000;
  }],
];

(async () => {
  let fallas = 0;
  for (const [nombre, fn] of checks) {
    let ok = false;
    try { ok = await fn(); } catch (e) { console.log(`      ${e.message}`); }
    if (!ok) fallas++;
    console.log(`${ok ? 'ok   ' : 'FALLA'} ${nombre}`);
  }
  process.exit(fallas ? 1 : 0);
})();
