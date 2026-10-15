export const PROVIDERS = {
  chatgpt: 'ChatGPT', claude: 'Claude', openai: 'OpenAI Responses',
  anthropic: 'Anthropic Messages', gemini: 'Gemini', perplexity: 'Perplexity', grok: 'Grok'
};

export function canonicalUrl(value) {
  try {
    const u = new URL(value);
    if (!['https:', 'http:'].includes(u.protocol) || u.username || u.password) return null;
    u.hash = '';
    for (const key of [...u.searchParams.keys()]) {
      if (/^utm_/i.test(key) || /^(fbclid|gclid|msclkid)$/i.test(key)) u.searchParams.delete(key);
    }
    u.searchParams.sort();
    return u.href.replace(/\/$/, '');
  } catch { return null; }
}

export function domainOf(value) {
  try { return new URL(value).hostname.replace(/^www\./, ''); } catch { return ''; }
}

export function stableId(value) {
  let hash = 2166136261;
  for (const char of String(value)) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return (hash >>> 0).toString(36);
}

export function normalizeRun(input) {
  if (!input || typeof input !== 'object' || !Array.isArray(input.sources)) throw new Error('A run must contain a sources array.');
  for (const key of ['queries', 'warnings']) {
    if (input[key] != null && !Array.isArray(input[key])) throw new Error(`${key} must be an array.`);
  }
  const warnings = new Set((input.warnings || []).map(String));
  const sources = new Map();
  for (const s of input.sources) {
    if (!s || typeof s !== 'object') throw new Error('Each source must be an object.');
    for (const key of ['refs', 'evidence']) {
      if (s[key] != null && !Array.isArray(s[key])) throw new Error(`Source ${key} must be an array.`);
    }
    for (const k of ['cited', 'retrieved']) {
      if (s[k] != null && typeof s[k] !== 'boolean') throw new Error(`${k} must be true or false, not text.`);
    }
    const url = canonicalUrl(s.url);
    if (!url) { warnings.add('An invalid or unsafe source URL was skipped.'); continue; }
    const prev = sources.get(url);
    const next = {
      url, title: String(s.title || domainOf(url)), domain: domainOf(url),
      retrieved: s.retrieved === true, cited: s.cited === true,
      evidence: [...new Set((s.evidence || []).map(String))],
      refs: [...new Set((s.refs || []).map(String))]
    };
    if (prev) {
      next.cited ||= prev.cited; next.retrieved ||= prev.retrieved;
      next.evidence = [...new Set([...prev.evidence, ...next.evidence])];
      next.refs = [...new Set([...prev.refs, ...next.refs])];
    }
    sources.set(url, next);
  }
  const platform = String(input.platform || 'custom').slice(0, 100);
  const prompt = String(input.prompt || '');
  const validDate = input.createdAt && Number.isFinite(Date.parse(input.createdAt));
  if (!validDate) warnings.add('A valid response timestamp is not available.');
  const run = {
    schemaVersion: 3, id: String(input.id || `${platform}-${stableId(JSON.stringify(input))}`),
    platform, title: String(input.title || prompt || 'Untitled run'), prompt,
    model: String(input.model || ''), createdAt: validDate ? new Date(input.createdAt).toISOString() : null,
    queries: [...new Set((input.queries || []).filter(q => typeof q === 'string' && q.trim()))],
    sources: [...sources.values()], warnings: [...warnings],
    provenance: String(input.provenance || 'Imported response'), synthetic: input.synthetic === true
  };
  return run;
}

export function metrics(runs) {
  const sources = runs.flatMap(r => r.sources);
  const retrieved = sources.filter(s => s.retrieved).length;
  const matched = sources.filter(s => s.retrieved && s.cited).length;
  const cited = sources.filter(s => s.cited).length;
  return { runs: runs.length, retrieved, cited, matched,
    uncited: sources.filter(s => s.retrieved && !s.cited).length,
    citationOnly: sources.filter(s => s.cited && !s.retrieved).length,
    rate: retrieved ? matched / retrieved : null,
    domains: new Set(sources.map(s => s.domain)).size };
}
