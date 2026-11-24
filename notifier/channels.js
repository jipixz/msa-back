const https = require('https');
const { URL } = require('url');

function httpRequest(urlString, { method = 'POST', headers = {}, body = '' } = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlString);
    const options = {
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname + url.search,
      method,
      headers: { 'Content-Length': Buffer.byteLength(body), ...headers }
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve({ status: res.statusCode, body: data });
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(10000, () => { req.destroy(new Error('Request timeout')); });
    if (body) req.write(body);
    req.end();
  });
}

async function sendNtfy({ title, body, priority = 'default', tags = [] }) {
  const server = process.env.NTFY_SERVER || 'https://ntfy.sh';
  const topic = process.env.NTFY_TOPIC;
  if (!topic) return { skipped: true, reason: 'NTFY_TOPIC no configurado' };

  const headers = {
    'Title': encodeRfc2047(title || 'MSA Cacao'),
    'Priority': priority,
    'Content-Type': 'text/plain; charset=utf-8'
  };
  if (tags.length) headers['Tags'] = tags.join(',');
  if (process.env.NTFY_TOKEN) headers['Authorization'] = `Bearer ${process.env.NTFY_TOKEN}`;

  await httpRequest(`${server.replace(/\/$/, '')}/${topic}`, {
    method: 'POST',
    headers,
    body: body || ''
  });
  return { sent: true, channel: 'ntfy' };
}

async function sendTelegram({ title, body }) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return { skipped: true, reason: 'TELEGRAM_BOT_TOKEN o TELEGRAM_CHAT_ID no configurados' };

  const text = title ? `*${escapeMarkdown(title)}*\n${escapeMarkdown(body || '')}` : escapeMarkdown(body || '');
  const payload = JSON.stringify({ chat_id: chatId, text, parse_mode: 'MarkdownV2' });

  await httpRequest(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: payload
  });
  return { sent: true, channel: 'telegram' };
}

function escapeMarkdown(text) {
  return String(text).replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, (c) => `\\${c}`);
}

function encodeRfc2047(text) {
  if (/^[\x20-\x7E]*$/.test(text)) return text;
  return `=?UTF-8?B?${Buffer.from(text, 'utf8').toString('base64')}?=`;
}

async function dispatch(channels, message) {
  const results = [];
  const targets = Array.isArray(channels) && channels.length ? channels : ['ntfy', 'telegram'];
  for (const ch of targets) {
    try {
      if (ch === 'ntfy') results.push(await sendNtfy(message));
      else if (ch === 'telegram') results.push(await sendTelegram(message));
      else results.push({ skipped: true, reason: `Canal desconocido: ${ch}` });
    } catch (err) {
      results.push({ error: true, channel: ch, message: err.message });
      console.error(`❌ Notifier [${ch}]:`, err.message);
    }
  }
  return results;
}

module.exports = { sendNtfy, sendTelegram, dispatch };
