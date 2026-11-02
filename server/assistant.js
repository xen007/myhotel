const MODELS = ['gemini-3.5-flash', 'gemini-3.8-flash', 'gemini-2.5-flash'];

const KEY_HELP =
  'Google refuse cette clé. C’est une clé récente, du type qui commence par AQ. L’API Gemini ne l’accepte pas encore. Dans Google AI Studio, créez une clé standard (elle commence par AIza), remplacez GEMINI_API_KEY dans le fichier .env, puis redémarrez l’API. En attendant, le guide à l’écran fonctionne : dites « montre-moi une réservation ».';

const TOURS = [
  'reservation',
  'cancel',
  'clients',
  'sale',
  'report',
  'message',
  'housekeeping',
  'issue',
  'rooms',
  'planning',
  'stock',
  'staff',
  'payroll',
  'settings',
  'orders',
  'service',
  'menu',
  'drinks',
  'kitchen',
  'daily',
  'note',
  'clean',
  'desk',
  'stay',
  'table',
  'login',
  'browse',
  'tour',
];

function systemPrompt(actor) {
  return [
    'Tu es le guide MyHotel. Tu montres seulement comment utiliser l’écran, une zone après l’autre.',
    'Tu parles un français simple et correct. Tu vouvoies. Tes phrases sont complètes.',
    `Rôle connecté : ${actor.role || 'inconnu'}. Ne répète pas le nom de la personne.`,
    'CONFIDENTIALITÉ : tu ne donnes jamais un chiffre, un montant, un taux, un nom de client, un téléphone, une CNI, une adresse, un salaire, un stock, ni une liste de séjours.',
    'Si on te demande un rapport, une statistique ou une information d’un client, tu refuses la donnée et tu proposes seulement d’ouvrir l’écran où la personne autorisée peut la lire elle-même.',
    'Tu ne modifies aucune donnée. Tu décris le prochain geste : quel menu, quelle zone, quel champ.',
    'Pour lancer le cadre à l’écran, remplis tour.',
    `tour vaut null ou exactement l’une de ces valeurs : ${TOURS.join(', ')}.`,
    'Réponds uniquement en JSON, sans balise : {"reply":"...","tour":null}.',
    'reply fait au plus 4 phrases et ne contient aucun nombre de l’hôtel.',
  ].join('\n');
}

function guardReply(reply) {
  const text = String(reply || '').trim();
  if (/fcfa|revpar|salaire|n°\s*cni|\b\d{6,}\b|\b\d{1,3}(?:[\s.]\d{3})+\b/i.test(text)) {
    return 'Je ne donne pas les chiffres, les noms, ni les documents. Je montre seulement où cliquer, zone par zone. Dis-moi l’action : une réservation, une vente, les sales…';
  }
  return text.slice(0, 700);
}

function parseAnswer(raw) {
  const text = String(raw || '').trim();
  const fenced = text.match(/\{[\s\S]*\}/);
  const source = fenced ? fenced[0] : text;
  try {
    const data = JSON.parse(source);
    const reply = String(data.reply || '').trim();
    const tour = TOURS.includes(data.tour) ? data.tour : null;
    if (reply) return { reply, tour };
  } catch {
    /* texte libre */
  }
  const clean = text.replace(/```json|```/g, '').trim();
  return { reply: clean.slice(0, 4000) || 'Je n’ai pas réussi à formuler la réponse. Reformule la question.', tour: null };
}

function piece(value) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (typeof value.text === 'string' && value.type !== 'thought') return value.text;
  if (typeof value.content === 'string') return value.content;
  if (Array.isArray(value.content)) return value.content.map(piece).join('');
  if (Array.isArray(value.parts)) return value.parts.map(piece).join('');
  return '';
}

function readText(data) {
  const parts = data?.candidates?.[0]?.content?.parts || [];
  const fromParts = parts.map((part) => part.text || '').join('\n').trim();
  if (fromParts) return fromParts;
  if (typeof data?.output_text === 'string' && data.output_text.trim()) return data.output_text.trim();
  const steps = Array.isArray(data?.steps) ? data.steps.filter((step) => step?.type !== 'thought') : [];
  const fromSteps = steps.map(piece).join('\n').trim();
  if (fromSteps) return fromSteps;
  const output = data?.output || data?.outputs;
  if (typeof output === 'string') return output.trim();
  if (Array.isArray(output)) {
    const text = output.map(piece).join('\n').trim();
    if (text) return text;
  }
  return '';
}

async function postGemini(url, key, body) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': key,
      'Api-Revision': '2026-05-20',
    },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data?.error?.message || `Gemini ${response.status}`;
    const error = new Error(message);
    error.status = response.status;
    error.reason = data?.error?.details?.[0]?.reason || '';
    throw error;
  }
  return readText(data);
}

function interactionInput(payload) {
  const system = payload?.systemInstruction?.parts?.map((part) => part.text).filter(Boolean).join('\n') || '';
  const turns = (payload?.contents || [])
    .map((item) => {
      const who = item.role === 'model' ? 'Guide' : 'Utilisateur';
      const text = (item.parts || []).map((part) => part.text).filter(Boolean).join('\n');
      return text ? `${who} :\n${text}` : '';
    })
    .filter(Boolean)
    .join('\n\n');
  return `${system}\n\n${turns}`.trim().slice(0, 12000);
}

async function callModel(model, key, payload) {
  const input = interactionInput(payload);
  let firstError = null;
  try {
    const guided = await postGemini('https://generativelanguage.googleapis.com/v1beta/interactions', key, {
      model,
      input,
    });
    if (guided.trim()) return guided;
  } catch (error) {
    firstError = error;
    const status = Number(error.status || 0);
    if (status && status !== 400 && status !== 401 && status !== 403 && status !== 404 && status !== 429 && status !== 500 && status !== 503) throw error;
  }
  try {
    return await postGemini(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      key,
      payload,
    );
  } catch (error) {
    if (!firstError) throw error;
    const status = Number(error.status || 0);
    if (status === 401 || status === 403 || status === 404) throw firstError;
    throw error;
  }
}

async function askAssistant({ actor, message, history }) {
  const key = String(process.env.GEMINI_API_KEY || '').trim();
  if (!key) {
    return {
      reply: 'L’assistant n’est pas configuré. Ajoute GEMINI_API_KEY dans le fichier .env du serveur, puis redémarre l’API.',
      tour: null,
    };
  }

  const prior = (history || [])
    .slice(-8)
    .map((item) => ({
      role: item.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: String(item.body || '').slice(0, 2000) }],
    }))
    .filter((item) => item.parts[0].text);

  const payload = {
    systemInstruction: { parts: [{ text: systemPrompt(actor) }] },
    contents: [
      ...prior,
      {
        role: 'user',
        parts: [
          {
            text: `Ne fournis aucune donnée de l’hôtel. Guide uniquement.\n\nDemande :\n${String(message).slice(0, 2000)}`,
          },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.4,
      maxOutputTokens: 900,
    },
  };

  let lastError = null;
  for (const model of MODELS) {
    try {
      const raw = await callModel(model, key, payload);
      const answer = parseAnswer(raw);
      return { ...answer, reply: guardReply(answer.reply) };
    } catch (error) {
      lastError = error;
      const status = Number(error.status || 0);
      if (status === 404 || status === 400 || status === 401 || status === 403 || status === 429 || status === 500 || status === 503) continue;
      break;
    }
  }

  const detail = `${lastError?.message || ''} ${lastError?.reason || ''}`;
  if (/api key|API_KEY|permission|unauth|ACCESS_TOKEN_TYPE_UNSUPPORTED/i.test(detail)) {
    return { reply: KEY_HELP, tour: null };
  }
  return {
    reply: 'Je n’arrive pas à joindre l’assistant pour le moment. Réessaie dans un instant, ou demande-moi de te montrer un écran avec le robot.',
    tour: null,
  };
}

module.exports = { askAssistant, TOURS };
