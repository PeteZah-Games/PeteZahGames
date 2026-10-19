import { Router } from 'express';
import fetch from 'node-fetch';
import { checkCircuitBreaker, toIPv4 } from '../middleware/security.js';
import { logAnonymousFirstPrompt } from '../api/ai-conversations.js';
import { resolveAiKey } from '../api/ai-grants.js';

const router = Router();

const promptCache = new Map();
const CACHE_TTL = 60 * 60 * 1000;
const CACHE_MAX_SIZE = 500;
const CACHE_MAX_PROMPT_LEN = 120;

const VISION_MODEL = 'qwen/qwen3.6-27b';
const DEFAULT_MODEL = 'openai/gpt-oss-20b';
const STRONG_MODEL = 'openai/gpt-oss-120b';

const ALLOWED_MODELS = new Set([DEFAULT_MODEL, STRONG_MODEL, VISION_MODEL]);

const MODEL_ALIASES = {
  'llama-3.1-8b-instant': DEFAULT_MODEL,
  'llama-3.3-70b-versatile': STRONG_MODEL,
  'llama3-8b-8192': DEFAULT_MODEL,
  'llama3-70b-8192': STRONG_MODEL,
  'qwen/qwen3-32b': STRONG_MODEL,
  'meta-llama/llama-4-scout-17b-16e-instruct': VISION_MODEL,
  'meta-llama/llama-4-maverick-17b-128e-instruct': STRONG_MODEL,
};

function normalizeCacheKey(prompt) {
  return prompt.toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim();
}

function getCached(key) {
  const entry = promptCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expires) { promptCache.delete(key); return null; }
  return entry.response;
}

function setCache(key, response) {
  if (promptCache.size >= CACHE_MAX_SIZE) promptCache.delete(promptCache.keys().next().value);
  promptCache.set(key, { response, expires: Date.now() + CACHE_TTL });
}

function resolveModel(raw, wantsVision) {
  if (wantsVision) return VISION_MODEL;
  const model = typeof raw === 'string' ? raw.trim() : '';
  const mapped = MODEL_ALIASES[model] || model;
  if (ALLOWED_MODELS.has(mapped) && mapped !== VISION_MODEL) return mapped;
  return DEFAULT_MODEL;
}

function groqSampling(model, wantsVision) {
  const isGptOss = model.startsWith('openai/gpt-oss-');
  const isQwen = model.startsWith('qwen/');
  return {
    temperature: wantsVision || isGptOss ? 1 : 0.7,
    max_completion_tokens: wantsVision || isGptOss ? 2048 : 1024,
    ...(isQwen ? { reasoning_effort: 'none' } : {}),
    ...(isGptOss ? { reasoning_effort: 'low' } : {}),
  };
}

function extractImagePart(content) {
  if (!Array.isArray(content)) return null;
  for (const part of content) {
    if (part?.type === 'image_url' && typeof part?.image_url?.url === 'string') {
      const url = part.image_url.url;
      if (url.startsWith('data:image/') && url.length <= 8_000_000) return part;
    }
  }
  return null;
}

function sanitizeMessages(messages) {
  if (!Array.isArray(messages)) return null;
  const out = [];
  let keptImage = false;
  const sliced = messages.slice(-40);

  for (let i = sliced.length - 1; i >= 0; i--) {
    const msg = sliced[i];
    if (!msg || typeof msg !== 'object') continue;
    const role = msg.role === 'assistant' || msg.role === 'system' || msg.role === 'user' ? msg.role : null;
    if (!role) continue;

    if (typeof msg.content === 'string') {
      const text = msg.content.slice(0, 12000);
      if (!text && role !== 'assistant') continue;
      out.unshift({ role, content: text || ' ' });
      continue;
    }

    if (Array.isArray(msg.content)) {
      const parts = [];
      for (const part of msg.content.slice(0, 4)) {
        if (!part || typeof part !== 'object') continue;
        if (part.type === 'text' && typeof part.text === 'string') {
          parts.push({ type: 'text', text: part.text.slice(0, 8000) });
        } else if (!keptImage && part.type === 'image_url') {
          const img = extractImagePart([part]);
          if (img) {
            parts.push(img);
            keptImage = true;
          }
        }
      }
      if (!parts.length) continue;
      out.unshift({ role, content: parts });
    }
  }

  while (out.length && out[0].role === 'assistant') out.shift();
  return out.length ? out : null;
}

function messagesHaveImage(messages) {
  if (!Array.isArray(messages)) return false;
  return messages.some((m) => !!extractImagePart(m?.content));
}

function buildVisionMessages(safeMessages, prompt, system) {
  const imageMsg = [...(safeMessages || [])].reverse().find((m) => extractImagePart(m.content));
  const imagePart = imageMsg ? extractImagePart(imageMsg.content) : null;
  if (!imagePart) return null;

  const text =
    (Array.isArray(imageMsg.content)
      ? imageMsg.content.find((p) => p?.type === 'text')?.text
      : '') ||
    prompt ||
    "What's in this image?";

  const messages = [];
  if (system && typeof system === 'string') {
    messages.push({ role: 'system', content: system.slice(0, 4000) });
  }
  messages.push({
    role: 'user',
    content: [
      { type: 'text', text: String(text).slice(0, 8000) },
      imagePart,
    ],
  });
  return messages;
}

const MAX_CONCURRENT = 5;
const MAX_QUEUE = 25;
let active = 0;
const queue = [];

function next() {
  if (active >= MAX_CONCURRENT || !queue.length) return;
  active++;
  const { task, resolve, reject } = queue.shift();
  task().then(resolve).catch(reject).finally(() => { active--; next(); });
}

function enqueue(task) {
  return new Promise((resolve, reject) => {
    if (queue.length >= MAX_QUEUE) return reject(Object.assign(new Error('Queue full'), { code: 'QUEUE_FULL' }));
    queue.push({ task, resolve, reject });
    next();
  });
}

router.post('/', async (req, res) => {
  const ip = toIPv4(null, req);
  if (checkCircuitBreaker(ip, null)) return res.status(429).json({ error: 'Too many requests' });

  const { prompt, model, system, groqMessages } = req.body ?? {};
  if (!prompt || typeof prompt !== 'string' || prompt.length > 10000) {
    return res.status(400).json({ error: 'Invalid prompt' });
  }

  const incomingHasImage = messagesHaveImage(groqMessages);
  const wantsVision =
    incomingHasImage ||
    model === VISION_MODEL ||
    model === 'meta-llama/llama-4-scout-17b-16e-instruct' ||
    (typeof model === 'string' && model.includes('vision'));

  const safeMessages = sanitizeMessages(groqMessages);
  const resolvedModel = resolveModel(model, wantsVision);

  let messages;
  if (wantsVision) {
    messages = buildVisionMessages(safeMessages, prompt, system);
    if (!messages) {
      return res.status(400).json({ error: 'Image missing or too large. Try a smaller JPEG/PNG.' });
    }
  } else {
    messages =
      safeMessages ||
      [
        ...(system && typeof system === 'string' ? [{ role: 'system', content: system.slice(0, 4000) }] : []),
        { role: 'user', content: prompt },
      ];
  }

  const keyPick = resolveAiKey(ip);
  if (keyPick.mode === 'broken') {
    return res.status(503).json({ error: 'AI service unavailable' });
  }
  const bearer = keyPick.mode === 'custom' ? keyPick.token : process.env.GROQ_API_KEY;

  const isSimple = !wantsVision && prompt.length <= CACHE_MAX_PROMPT_LEN && !safeMessages && keyPick.mode !== 'custom';
  const cacheKey = isSimple ? normalizeCacheKey(prompt) : null;
  if (cacheKey) {
    const cached = getCached(cacheKey);
    if (cached) return res.json({ response: cached, cached: true });
  }

  try {
    const turnCount = Array.isArray(safeMessages) ? safeMessages.filter((m) => m.role === 'user').length : 1;
    if (turnCount <= 1 && typeof prompt === 'string' && prompt.trim()) {
      logAnonymousFirstPrompt(prompt, ip);
    }
  } catch {}

  const callGroq = async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120000);
    try {
      const payload = {
        model: resolvedModel,
        messages,
        ...groqSampling(resolvedModel, wantsVision),
      };

      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${bearer}`,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const detail =
          typeof data?.error?.message === 'string'
            ? data.error.message
            : `Groq ${response.status}`;
        throw Object.assign(new Error(detail), { code: 'GROQ_ERROR', detail });
      }
      const msg = data.choices?.[0]?.message || {};
      let content =
        (typeof msg.content === 'string' && msg.content.trim()) ||
        (typeof msg.reasoning === 'string' && msg.reasoning.trim()) ||
        '';
      if (!content && Array.isArray(msg.content)) {
        content = msg.content
          .map((p) => (typeof p?.text === 'string' ? p.text : ''))
          .join('')
          .trim();
      }
      return content || 'No response.';
    } catch (err) {
      clearTimeout(timeout);
      throw err;
    }
  };

  try {
    const result = await enqueue(callGroq);
    if (cacheKey) setCache(cacheKey, result);
    res.json({ response: result });
    const uid = req.session?.user?.id;
    if (uid) {
      setImmediate(() => {
        import('../api/achievements.js')
          .then(({ bumpStat }) => {
            try { bumpStat(uid, 'ai_messages', 1); } catch {}
          })
          .catch(() => {});
      });
    }
  } catch (err) {
    if (err.code === 'QUEUE_FULL') return res.status(503).json({ error: 'Server busy, try again in a moment' });
    if (err.name === 'AbortError') return res.status(504).json({ error: 'Request timeout' });
    if (err.code === 'GROQ_ERROR') {
      console.error('Groq upstream error:', err.detail || err.message);
      const detail = 'AI service error';
      return res.status(502).json({ error: detail, detail });
    }
    return res.status(500).json({ error: 'AI service unavailable' });
  }
});

export default router;
