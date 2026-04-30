const { getStore } = require('@netlify/blobs');

const STORE_NAME = 'kelsie-profile';
const KINDS = { resume: 'resumes', cover: 'cover-letters', idea: 'ideas' };

const json = (statusCode, body) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  body: JSON.stringify(body)
});

function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

async function listAll(store) {
  const out = { resumes: [], covers: [], ideas: [] };
  for (const [kind, prefix] of Object.entries(KINDS)) {
    const { blobs } = await store.list({ prefix: prefix + '/' });
    const items = await Promise.all(blobs.map(async b => {
      const data = await store.get(b.key, { type: 'json' });
      return data ? { id: b.key.slice(prefix.length + 1), ...data } : null;
    }));
    const filtered = items.filter(Boolean).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    if (kind === 'resume') out.resumes = filtered;
    else if (kind === 'cover') out.covers = filtered;
    else out.ideas = filtered;
  }
  return out;
}

exports.handler = async (event) => {
  const store = getStore(STORE_NAME);

  try {
    if (event.httpMethod === 'GET') {
      const all = await listAll(store);
      return json(200, all);
    }

    if (event.httpMethod !== 'POST') {
      return json(405, { error: 'Method Not Allowed' });
    }

    const body = JSON.parse(event.body || '{}');
    const { action, kind, payload, id } = body;

    if (!KINDS[kind]) return json(400, { error: 'Invalid kind' });
    const prefix = KINDS[kind];

    if (action === 'add') {
      const newKey = newId();
      const record = {
        ...payload,
        createdAt: Date.now()
      };
      await store.setJSON(`${prefix}/${newKey}`, record);
      return json(200, { id: newKey, ...record });
    }

    if (action === 'update') {
      if (!id) return json(400, { error: 'Missing id' });
      const existing = await store.get(`${prefix}/${id}`, { type: 'json' });
      if (!existing) return json(404, { error: 'Not found' });
      const updated = { ...existing, ...payload, updatedAt: Date.now() };
      await store.setJSON(`${prefix}/${id}`, updated);
      return json(200, { id, ...updated });
    }

    if (action === 'delete') {
      if (!id) return json(400, { error: 'Missing id' });
      await store.delete(`${prefix}/${id}`);
      return json(200, { ok: true });
    }

    return json(400, { error: 'Unknown action' });
  } catch (e) {
    return json(500, { error: e.message });
  }
};
