export const PROVIDERS = {
  chatgpt: "ChatGPT",
  claude: "Claude",
  openai: "OpenAI Responses",
  anthropic: "Anthropic Messages",
  gemini: "Gemini",
  perplexity: "Perplexity",
  grok: "Grok",
};

export function canonicalUrl(value) {
  try {
    const u = new URL(value);
    if (!["https:", "http:"].includes(u.protocol) || u.username || u.password)
      return null;
    u.hash = "";
    for (const key of [...u.searchParams.keys()]) {
      if (/^utm_/i.test(key) || /^(fbclid|gclid|msclkid)$/i.test(key))
        u.searchParams.delete(key);
    }
    u.searchParams.sort();
    return u.href.replace(/\/$/, "");
  } catch {
    return null;
  }
}

export function domainOf(value) {
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

export function stableId(value) {
  let hash = 2166136261;
  for (const char of String(value))
    hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return (hash >>> 0).toString(36);
}

export function snapshotOf(raw = {}) {
  const md =
    raw.metadata && typeof raw.metadata === "object" ? raw.metadata : {};
  const pick = (...values) =>
    values.find(
      (v) => ["string", "number", "boolean"].includes(typeof v) && v !== "",
    );
  const timestamp = pick(
    raw.publishedAt,
    raw.pub_date,
    raw.published_date,
    raw.date,
    md.published_date,
  );
  const fields = {
    snippet: pick(raw.snippet, raw.text, raw.cited_text, md.snippet),
    publishedAt:
      typeof timestamp === "number" &&
      Number.isFinite(timestamp) &&
      Math.abs(timestamp) < 8640000000000
        ? new Date(timestamp * 1000).toISOString()
        : timestamp,
    attribution: pick(raw.attribution, raw.site, md.site_name, md.site_domain),
    channelName: pick(
      raw.channelName,
      raw.channel_name,
      raw.channel,
      md.channel_name,
    ),
    followers: pick(
      raw.followers,
      raw.subscribers,
      md.followers,
      md.subscribers,
    ),
    verified: pick(raw.verified, md.verified),
    views: pick(raw.views, raw.view_count, md.views),
    likes: pick(raw.likes, raw.like_count, md.likes),
    description: pick(raw.description, raw.full_description, md.description),
    timecodes:
      pick(raw.timecodes, raw.timestamps, md.timecodes) ??
      [raw.timecodes, raw.timestamps, md.timecodes]
        .find(Array.isArray)
        ?.map((v) =>
          typeof v === "object" && v !== null
            ? Object.fromEntries(
                Object.entries(v).filter(([, x]) =>
                  ["string", "number", "boolean"].includes(typeof x),
                ),
              )
            : String(v),
        ),
  };
  return Object.fromEntries(
    Object.entries(fields).filter(([, v]) => v !== undefined),
  );
}

export function normalizeRun(input) {
  if (!input || typeof input !== "object" || !Array.isArray(input.sources))
    throw new Error("A run must contain a sources array.");
  for (const key of ["queries", "warnings", "status"]) {
    if (input[key] != null && !Array.isArray(input[key]))
      throw new Error(`${key} must be an array.`);
  }
  const warnings = new Set((input.warnings || []).map(String));
  const sources = new Map();
  for (const s of input.sources) {
    if (!s || typeof s !== "object")
      throw new Error("Each source must be an object.");
    for (const key of ["refs", "evidence"]) {
      if (s[key] != null && !Array.isArray(s[key]))
        throw new Error(`Source ${key} must be an array.`);
    }
    for (const k of ["cited", "retrieved"]) {
      if (s[k] != null && typeof s[k] !== "boolean")
        throw new Error(`${k} must be true or false, not text.`);
    }
    const url = canonicalUrl(s.url);
    if (!url) {
      warnings.add("An invalid or unsafe source URL was skipped.");
      continue;
    }
    if (s.observedUrls != null && !Array.isArray(s.observedUrls))
      throw new Error("Source observedUrls must be an array.");
    const observedUrls = (
      s.observedUrls?.length ? s.observedUrls : [s.url]
    ).filter(
      (value) => typeof value === "string" && canonicalUrl(value) === url,
    );
    const prev = sources.get(url);
    const next = {
      url,
      observedUrls: [
        ...new Set(observedUrls.length ? observedUrls : [String(s.url)]),
      ],
      title: String(s.title || domainOf(url)),
      domain: domainOf(url),
      snapshot: snapshotOf(s.snapshot || s),
      retrieved: s.retrieved === true,
      cited: s.cited === true,
      evidence: [...new Set((s.evidence || []).map(String))],
      refs: [...new Set((s.refs || []).map(String))],
    };
    if (prev) {
      if (!s.title || s.title === domainOf(url)) next.title = prev.title;
      next.observedUrls = [
        ...new Set([...prev.observedUrls, ...next.observedUrls]),
      ];
      next.cited ||= prev.cited;
      next.retrieved ||= prev.retrieved;
      next.snapshot = { ...prev.snapshot, ...next.snapshot };
      next.evidence = [...new Set([...prev.evidence, ...next.evidence])];
      next.refs = [...new Set([...prev.refs, ...next.refs])];
    }
    sources.set(url, next);
  }
  const platform = String(input.platform || "custom").slice(0, 100);
  const prompt = String(input.prompt || "");
  const validDate =
    input.createdAt && Number.isFinite(Date.parse(input.createdAt));
  if (!validDate) warnings.add("A valid response timestamp is not available.");
  const run = {
    schemaVersion: 3,
    id: String(input.id || `${platform}-${stableId(JSON.stringify(input))}`),
    platform,
    title: String(input.title || prompt || "Untitled run"),
    prompt,
    model: String(input.model || ""),
    createdAt: validDate ? new Date(input.createdAt).toISOString() : null,
    status: [...new Set((input.status || []).map(String))],
    chatSync:
      input.chatSync?.mode === "saved-chat-poll"
        ? {
            mode: "saved-chat-poll",
            observedAt: Number.isFinite(Date.parse(input.chatSync.observedAt))
              ? new Date(input.chatSync.observedAt).toISOString()
              : null,
          }
        : null,
    capture:
      input.capture && typeof input.capture === "object"
        ? {
            transport: String(input.capture.transport || ""),
            complete: input.capture.complete === true,
            eventCount: Number(input.capture.eventCount) || 0,
          }
        : null,
    queries: [
      ...new Set(
        (input.queries || []).filter((q) => typeof q === "string" && q.trim()),
      ),
    ],
    sources: [...sources.values()].map((s) => ({
      ...s,
      snippet: s.snapshot.snippet || "",
      date: s.snapshot.publishedAt || "",
      type: /(^|\.)youtube\.com$|(^|\.)youtu\.be$/.test(s.domain)
        ? "youtube"
        : "web",
    })),
    warnings: [...warnings],
    provenance: String(input.provenance || "Imported response"),
    synthetic: input.synthetic === true,
    sample:
      input.sample === true ||
      input.demo === true ||
      input.source === "sample" ||
      input.synthetic === true,
    analysisScope: String(
      input.analysisScope || "Imported response or normalized record",
    ),
  };
  const m = metrics([run]);
  return {
    ...run,
    retrieved: m.retrieved,
    cited: m.cited,
    matched: m.matched,
    citeMarkers: null,
  };
}

export function metrics(runs) {
  const sources = runs.flatMap((r) => r.sources);
  const retrieved = sources.filter((s) => s.retrieved).length;
  const matched = sources.filter((s) => s.retrieved && s.cited).length;
  const cited = sources.filter((s) => s.cited).length;
  return {
    runs: runs.length,
    retrieved,
    cited,
    matched,
    uncited: sources.filter((s) => s.retrieved && !s.cited).length,
    citationOnly: sources.filter((s) => s.cited && !s.retrieved).length,
    rate: retrieved ? matched / retrieved : null,
    domains: new Set(sources.map((s) => s.domain)).size,
  };
}
