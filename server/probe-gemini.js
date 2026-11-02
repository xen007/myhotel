const fs = require('fs');
const path = require('path');

function loadKey() {
  const file = path.join(__dirname, '..', '.env');
  const line = fs.readFileSync(file, 'utf8').split(/\r?\n/).find((row) => row.startsWith('GEMINI_API_KEY='));
  return String(line || '').slice('GEMINI_API_KEY='.length).trim();
}

function redact(text) {
  return String(text || '').replace(/AQ\.[A-Za-z0-9._-]+/g, 'AQ.***').slice(0, 220);
}

async function tryCall(label, url, key, body) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key, 'Api-Revision': '2026-05-20' },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  const reason = data?.error?.details?.[0]?.reason || data?.error?.status || '';
  const keys = Object.keys(data || {}).join(',');
  const stepText = Array.isArray(data?.steps)
    ? data.steps.map((step) => (Array.isArray(step?.content) ? step.content.map((part) => part?.text || '').join('') : step?.text || '')).join('')
    : '';
  const snippet = data.output_text || data?.candidates?.[0]?.content?.parts?.[0]?.text || stepText || '';
  console.log(label, response.status, reason, 'keys', keys, snippet ? 'TEXT' : redact(data?.error?.message));
  if (response.ok) console.log('shape', JSON.stringify(data, (k, v) => (typeof v === 'string' ? `str:${v.length}` : v)).slice(0, 500));
  return response.ok;
}

async function main() {
  const key = loadKey();
  console.log('key-prefix', key.slice(0, 3), 'len', key.length);
  const models = ['gemini-3.8-flash', 'gemini-3.5-flash', 'gemini-2.5-flash', 'gemini-flash-latest'];
  for (const model of models) {
    const ok = await tryCall(
      `interactions ${model}`,
      'https://generativelanguage.googleapis.com/v1beta/interactions',
      key,
      { model, input: 'Reponds uniquement le mot ok' },
    );
    if (ok) return;
  }
  await tryCall(
    'generate gemini-2.5-flash',
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',
    key,
    { contents: [{ parts: [{ text: 'Reponds uniquement le mot ok' }] }] },
  );
}

main().catch((error) => console.log('ERR', redact(error.message)));
