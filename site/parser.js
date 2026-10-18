/* Built from src/ by runner/build.mjs. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.CiteParser=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){'use strict';
const PROVIDERS = {
  chatgpt: "ChatGPT",
  claude: "Claude",
  openai: "OpenAI Responses",
  anthropic: "Anthropic Messages",
  gemini: "Gemini",
  perplexity: "Perplexity",
  grok: "Grok",
};

function canonicalUrl(value) {
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

function domainOf(value) {
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function stableId(value) {
  let hash = 2166136261;
  for (const char of String(value))
    hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return (hash >>> 0).toString(36);
}

function snapshotOf(raw = {}) {
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

function normalizeRun(input) {
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

function metrics(runs) {
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

const arr = (value) => (Array.isArray(value) ? value : []);
const text = (value) => (typeof value === "string" ? value : "");
const seconds = (value) =>
  Number.isFinite(Number(value)) &&
  value != null &&
  Math.abs(Number(value)) < 8640000000000
    ? new Date(Number(value) * 1000).toISOString()
    : null;

function collector(platform, raw) {
  const sources = [],
    queries = [],
    warnings = [],
    status = [];
  return {
    sources,
    queries,
    warnings,
    status,
    add(url, title, retrieved, cited, evidence, refs = [], rawSource = {}) {
      if (url)
        sources.push({
          url,
          title,
          retrieved,
          cited,
          evidence: [evidence],
          refs,
          snapshot: snapshotOf(rawSource),
        });
    },
    finish(extra = {}) {
      if (!queries.length)
        warnings.push(
          "Search queries are not available in this file. Missing queries do not mean zero searches.",
        );
      if (!sources.length)
        warnings.push(
          "This response contains no supported citation or retrieval fields.",
        );
      return normalizeRun({
        synthetic: raw._citationTrackerFixture === true,
        provenance:
          raw._citationTrackerFixture === true
            ? "Synthetic API-format fixture; not a real provider response."
            : "Imported saved response; provider-reported metadata is not independently verified.",
        platform,
        sources,
        queries,
        warnings,
        status,
        model: raw.model,
        id: raw.id || raw.conversation_id || raw.uuid,
        createdAt:
          typeof raw.created_at === "number"
            ? seconds(raw.created_at)
            : raw.created_at ||
              raw.createdAt ||
              seconds(raw.created || raw.create_time),
        title: raw.title || raw.name,
        ...extra,
      });
    },
  };
}

function chatgpt(raw) {
  const c = collector("chatgpt", raw),
    refs = new Set(),
    urls = new Set();
  let prompt = "";
  let nodes = Object.values(raw.mapping).filter((n) => n?.message);
  if (raw.current_node && raw.mapping[raw.current_node]) {
    const active = [],
      seen = new Set();
    let key = raw.current_node;
    while (key && raw.mapping[key] && !seen.has(key)) {
      seen.add(key);
      active.unshift(raw.mapping[key]);
      key = raw.mapping[key].parent;
    }
    nodes = active.filter((n) => n.message);
  } else
    c.warnings.push(
      "No active branch pointer is available; all saved message branches are included.",
    );
  for (const { message: m } of nodes) {
    const md = m.metadata || {},
      body = arr(m.content?.parts)
        .filter((p) => typeof p === "string")
        .join("\n");
    const role = m.author?.role;
    c.status.push(
      ...arr(md.reasoning_titles)
        .map((t) => (typeof t === "string" ? t : t.title))
        .filter(Boolean),
    );
    if (role === "user" && !prompt) prompt = body;
    for (const group of arr(md.search_result_groups))
      for (const e of arr(group.entries)) {
        const r = e.ref_id;
        const ref =
          typeof r === "string"
            ? r
            : r
              ? `turn${r.turn_index}${r.ref_type}${r.ref_index}`
              : "";
        c.add(
          e.url,
          e.title,
          true,
          false,
          "metadata.search_result_groups.entries",
          ref ? [ref] : [],
          e,
        );
      }
    for (const q of arr(md.search_model_queries?.queries))
      if (typeof q === "string") c.queries.push(q);
    if (role === "assistant" && /^web/.test(m.recipient || "")) {
      try {
        const call = JSON.parse(body);
        for (const q of arr(call.search_query || call.queries))
          c.queries.push(typeof q === "string" ? q : q.q || q.query);
      } catch {
        /* Only structured search calls are parsed. */
      }
    }
    if (role !== "assistant") continue;
    for (const match of body.matchAll(/refs=\{\[([\s\S]*?)\]\}/g))
      for (const r of match[1].matchAll(/"([^"]+)"/g)) refs.add(r[1]);
    for (const match of body.matchAll(
      /\ue200cite((?:\ue202[^\ue201\ue202]+)+)\ue201/g,
    ))
      for (const r of match[1].split("\ue202").filter(Boolean)) refs.add(r);
    for (const cr of arr(md.content_references)) {
      for (const s of [
        ...arr(cr.items),
        ...arr(cr.sources),
        ...(cr.url ? [cr] : []),
      ]) {
        if (s.url) {
          urls.add(canonicalUrl(s.url));
          c.add(
            s.url,
            s.title,
            false,
            true,
            "metadata.content_references",
            [],
            s,
          );
        }
      }
    }
  }
  const unresolved = [...refs].filter(
    (ref) => !c.sources.some((s) => s.refs.includes(ref)),
  );
  if (unresolved.length)
    c.warnings.push(
      `Could not resolve ${unresolved.length} citation reference(s) to URLs.`,
    );
  for (const s of c.sources)
    if (s.refs.some((r) => refs.has(r)) || urls.has(canonicalUrl(s.url))) {
      s.cited = true;
      s.evidence.push("assistant citation reference");
    }
  return c.finish({
    prompt,
    model: raw.default_model_slug || raw.model,
    analysisScope: raw.current_node
      ? "Saved conversation · active branch; sources and citations may span multiple answers. Prompt shown is the first user message."
      : "Saved conversation · all included branches; sources and citations may span multiple answers. Prompt shown is the first user message.",
  });
}

function anthropic(raw, platform) {
  const c = collector(platform, raw);
  let prompt = "";
  const messages =
    platform === "claude"
      ? arr(raw.chat_messages)
      : [{ role: "assistant", content: raw.content }];
  for (const m of messages) {
    const role = m.sender || m.role;
    if ((role === "human" || role === "user") && !prompt)
      prompt =
        text(m.text) ||
        arr(m.content)
          .filter((b) => b.type === "text")
          .map((b) => b.text)
          .join("\n");
    for (const b of arr(m.content)) {
      if (
        ["tool_use", "server_tool_use"].includes(b.type) &&
        /search/i.test(b.name || "")
      ) {
        let input = b.input;
        if (typeof input === "string") {
          try {
            input = JSON.parse(input);
          } catch {
            input = { query: input };
          }
        }
        if (input?.query) c.queries.push(input.query);
      }
      if (
        b.type === "web_search_tool_result" ||
        (b.type === "tool_result" && /search/i.test(b.name || ""))
      ) {
        if (b.content?.error_code)
          c.warnings.push(`Search error: ${b.content.error_code}.`);
        for (const s of arr(b.content))
          c.add(s.url, s.title, true, false, `${b.type}.content`, [], s);
      }
      if (role === "assistant" && b.type === "text")
        for (const citation of arr(b.citations)) {
          for (const s of citation.sources?.length
            ? citation.sources
            : [citation])
            c.add(s.url, s.title, false, true, "text.citations", [], s);
        }
    }
  }
  return c.finish({
    prompt,
    analysisScope:
      platform === "claude"
        ? "Saved conversation · included messages; sources and citations may span multiple answers. Prompt shown is the first user message."
        : "Single API response",
  });
}

function openai(raw) {
  const c = collector("openai", raw);
  for (const item of arr(raw.output)) {
    if (item.type === "web_search_call") {
      for (const q of [
        ...arr(item.action?.queries),
        ...(item.action?.query ? [item.action.query] : []),
      ])
        c.queries.push(q);
      for (const s of arr(item.action?.sources))
        c.add(
          s.url,
          s.title,
          true,
          false,
          "web_search_call.action.sources",
          [],
          s,
        );
    }
    if (item.type === "message" && item.role === "assistant")
      for (const part of arr(item.content)) {
        for (const a of arr(part.annotations))
          if (a.type === "url_citation")
            c.add(
              a.url || a.url_citation?.url,
              a.title || a.url_citation?.title,
              false,
              true,
              "output.message.annotations.url_citation",
              [],
              a.url_citation || a,
            );
      }
  }
  if (!c.sources.some((s) => s.retrieved))
    c.warnings.push(
      "No retrieval set is available. Save a response with web_search_call.action.sources included.",
    );
  return c.finish();
}

function gemini(raw) {
  const c = collector("gemini", raw);
  if (arr(raw.candidates).length > 1)
    c.warnings.push(
      "Only the first Gemini candidate is used. Alternative answers are not merged.",
    );
  const gm = raw.candidates?.[0]?.groundingMetadata || {};
  const indices = new Set(
    arr(gm.groundingSupports).flatMap((s) => arr(s.groundingChunkIndices)),
  );
  arr(gm.groundingChunks).forEach((chunk, i) => {
    if (chunk.web?.uri)
      c.add(
        chunk.web.uri,
        chunk.web.title,
        true,
        indices.has(i),
        "candidates[0].groundingMetadata.groundingChunks / groundingSupports",
      );
  });
  c.queries.push(...arr(gm.webSearchQueries));
  c.warnings.push(
    "Grounding chunks are treated as observed retrievals, not a complete search log. Provider-supplied grounding redirect URLs are retained.",
  );
  return c.finish({ model: raw.modelVersion || raw.model });
}

function completions(raw, platform) {
  const c = collector(platform, raw);
  for (const s of arr(raw.search_results))
    c.add(s.url, s.title, true, false, "search_results", [], s);
  for (const citation of arr(raw.citations))
    c.add(
      typeof citation === "string" ? citation : citation.url,
      citation.title,
      false,
      true,
      "citations",
    );
  for (const choice of arr(raw.choices).slice(0, 1)) {
    for (const a of arr(choice.message?.annotations))
      if (a.type === "url_citation") {
        const s = a.url_citation || a;
        c.add(
          s.url,
          s.title,
          false,
          true,
          "choices[0].message.annotations.url_citation",
        );
      }
    for (const citation of arr(choice.message?.citations))
      c.add(
        typeof citation === "string" ? citation : citation.url,
        citation.title,
        false,
        true,
        "choices[0].message.citations",
      );
  }
  if (!c.sources.some((s) => s.retrieved))
    c.warnings.push(
      "Citation evidence only. No retrieval set or citation rate can be established.",
    );
  return c.finish();
}

function detect(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  if (Array.isArray(raw.sources) && typeof raw.platform === "string")
    return "normalized";
  if (raw.mapping && typeof raw.mapping === "object") return "chatgpt";
  if (Array.isArray(raw.chat_messages)) return "claude";
  if (raw.object === "response" && Array.isArray(raw.output)) return "openai";
  if (raw.type === "message" && Array.isArray(raw.content)) return "anthropic";
  if (Array.isArray(raw.candidates)) return "gemini";
  if (
    Array.isArray(raw.choices) &&
    (/sonar|perplexity/i.test(raw.model || "") || raw.provider === "perplexity")
  )
    return "perplexity";
  if (
    Array.isArray(raw.choices) &&
    (/grok/i.test(raw.model || "") || raw.provider === "grok")
  )
    return "grok";
  return null;
}

function parseOne(raw) {
  switch (detect(raw)) {
    case "normalized":
      return normalizeRun({
        ...raw,
        sources: raw.sources.map((s) => ({
          ...s,
          retrieved: s.retrieved ?? raw.schemaVersion !== 3,
        })),
        warnings: [
          ...arr(raw.warnings),
          ...(raw.schemaVersion !== 3
            ? [
                "Legacy export: original sources are assumed retrieved; explicit evidence flags were not stored.",
              ]
            : []),
        ],
      });
    case "chatgpt":
      return chatgpt(raw);
    case "claude":
      return anthropic(raw, "claude");
    case "anthropic":
      return anthropic(raw, "anthropic");
    case "openai":
      return openai(raw);
    case "gemini":
      return gemini(raw);
    case "perplexity":
      return completions(raw, "perplexity");
    case "grok":
      return completions(raw, "grok");
    default:
      throw new Error(
        "Could not recognize this response. Use the documented normalized format instead.",
      );
  }
}

function parseInput(input) {
  const list = Array.isArray(input)
    ? input
    : Array.isArray(input?.runs)
      ? input.runs
      : [input];
  if (!list.length) throw new Error("This file contains no runs.");
  return list.map(parseOne);
}

function parseJsonText(value, filename = "") {
  if (value.length > 15 * 1024 * 1024)
    throw new Error("Each import must be below 15 MB.");
  try {
    if (/\.jsonl$/i.test(filename) && !value.trim())
      throw new Error("This file contains no runs.");
    if (/\.jsonl$/i.test(filename))
      return value
        .split(/\r?\n/)
        .filter((s) => s.trim())
        .flatMap((line, i) => {
          try {
            return parseInput(JSON.parse(line));
          } catch (e) {
            throw new Error(`Could not import line ${i + 1}: ${e.message}`);
          }
        });
    return parseInput(JSON.parse(value));
  } catch (e) {
    if (e instanceof SyntaxError)
      throw new Error(
        "Could not read this JSON. Provide a complete JSON response, not copied answer text.",
      );
    throw e;
  }
}

function workspaceJson(runs) {
  return JSON.stringify(
    { schemaVersion: 3, exportedAt: new Date().toISOString(), runs },
    null,
    2,
  );
}
function sourcesCsv(runs) {
  const cell = (v) => {
    let s = String(v ?? "");
    if (/^[\s]*[=+@-]/.test(s)) s = "'" + s;
    return '"' + s.replaceAll('"', '""') + '"';
  };
  const rows = [
    [
      "run_id",
      "provider",
      "model",
      "prompt",
      "queries_json",
      "title",
      "url",
      "observed_urls_json",
      "domain",
      "retrieved",
      "cited",
      "evidence",
      "snippet",
      "published_at",
      "snapshot_json",
    ],
  ];
  for (const r of runs)
    for (const s of r.sources)
      rows.push([
        r.id,
        r.platform,
        r.model,
        r.prompt,
        JSON.stringify(r.queries),
        s.title,
        s.url,
        JSON.stringify(s.observedUrls || [s.url]),
        s.domain,
        s.retrieved,
        s.cited,
        s.evidence.join("; "),
        s.snapshot?.snippet,
        s.snapshot?.publishedAt,
        JSON.stringify(s.snapshot || {}),
      ]);
  return "\ufeff" + rows.map((row) => row.map(cell).join(",")).join("\r\n");
}

function providerFromUrl(value) {
  try {
    const u = new URL(value),
      h = u.hostname,
      p = u.pathname;
    if (
      /(^|\.)chatgpt\.com$/.test(h) &&
      /\/backend-api\/(f\/)?conversation/.test(p)
    )
      return "chatgpt";
    if (
      /(^|\.)claude\.ai$/.test(h) &&
      /\/completion$|\/chat_conversations\//.test(p)
    )
      return "claude";
    if (h === "api.openai.com" && /\/responses/.test(p)) return "openai";
    if (h === "api.anthropic.com" && /\/messages/.test(p)) return "anthropic";
    if (
      h === "generativelanguage.googleapis.com" &&
      /generateContent|streamGenerateContent/.test(p)
    )
      return "gemini";
    if (
      /(^|\.)perplexity\.ai$/.test(h) &&
      /chat\/completions|perplexity_ask/.test(p)
    )
      return "perplexity";
    if (h === "api.x.ai" && /chat\/completions/.test(p)) return "grok";
    if (/(^|\.)grok\.com$/.test(h) && /conversations/.test(p)) return "grok";
  } catch {}
  return null;
}

function streamEvents(body) {
  const normalized = body.replace(/\r\n/g, "\n");
  const events = [],
    warnings = [];
  if (/^data:|^event:/m.test(normalized)) {
    for (const block of normalized.split(/\n\n+/)) {
      const data = block
        .split("\n")
        .filter((l) => l.startsWith("data:"))
        .map((l) => l.slice(5).replace(/^ /, ""))
        .join("\n");
      if (!data || data === "[DONE]") continue;
      try {
        events.push(JSON.parse(data));
      } catch {
        warnings.push("An SSE event was not JSON and was not interpreted.");
      }
    }
  } else {
    try {
      const v = JSON.parse(body);
      events.push(...(Array.isArray(v) ? v : [v]));
    } catch {
      for (const line of normalized.split("\n").filter((l) => l.trim())) {
        try {
          events.push(JSON.parse(line));
        } catch {
          warnings.push("An incomplete or non-JSON event was skipped.");
        }
      }
    }
  }
  if (events.length > 100000)
    throw new Error(
      "Stream has too many events for a browser import. Isolate one response.",
    );
  if (!events.length)
    throw new Error("No complete JSON events were found in this stream.");
  return { events, warnings };
}

const blocked = new Set(["__proto__", "prototype", "constructor"]);
function applyPatch(root, patch) {
  const op = patch.o || patch.op,
    path = patch.p ?? patch.path ?? "",
    value = patch.v ?? patch.value;
  if (!["add", "replace", "append", "remove", "patch"].includes(op))
    throw new Error(`Unsupported patch operation: ${op || "missing"}`);
  if (op === "patch") {
    if (!Array.isArray(value)) throw new Error("Patch list is not an array.");
    for (const child of value)
      root = applyPatch(root, {
        ...child,
        p: path + (child.p || child.path || ""),
      });
    return root;
  }
  if (path === "") {
    if (
      op === "append" &&
      typeof root === "string" &&
      typeof value === "string"
    )
      return root + value;
    if (op === "add" || op === "replace") return structuredClone(value);
    throw new Error("Unsupported root patch.");
  }
  if (!path.startsWith("/"))
    throw new Error("Patch path must be a JSON pointer.");
  const keys = path
    .slice(1)
    .split("/")
    .map((s) => s.replace(/~1/g, "/").replace(/~0/g, "~"));
  if (keys.some((k) => blocked.has(k))) throw new Error("Unsafe patch path.");
  let parent = root;
  for (const k of keys.slice(0, -1)) {
    if (!parent || typeof parent !== "object" || !Object.hasOwn(parent, k))
      throw new Error("Patch parent is missing.");
    parent = parent[k];
  }
  if (!parent || typeof parent !== "object")
    throw new Error("Patch target is missing.");
  const key = keys.at(-1);
  if (
    Array.isArray(parent) &&
    !(key === "-" && op === "add") &&
    (!/^(0|[1-9]\d*)$/.test(key) ||
      Number(key) > parent.length ||
      (op !== "add" && Number(key) >= parent.length))
  )
    throw new Error("Invalid array patch index.");
  if (op === "append") {
    if (typeof parent[key] === "string" && typeof value === "string")
      parent[key] += value;
    else if (Array.isArray(parent[key]))
      parent[key].push(...(Array.isArray(value) ? value : [value]));
    else throw new Error("Append target is not text or an array.");
  } else if (op === "remove") {
    if (Array.isArray(parent)) parent.splice(Number(key), 1);
    else delete parent[key];
  } else if (Array.isArray(parent) && op === "add") {
    if (key === "-") parent.push(structuredClone(value));
    else parent.splice(Number(key), 0, structuredClone(value));
  } else parent[key] = structuredClone(value);
  return root;
}

function parseStream(body, provider, capture = {}) {
  if (!provider)
    throw new Error(
      "Choose the provider for a raw stream, or import a HAR/capture with a known endpoint.",
    );
  const { events, warnings } = streamEvents(body),
    candidates = [];
  let state = {},
    chatMessages = new Map(),
    anthropicMessage = { type: "message", role: "assistant", content: [] };
  let response = { object: "response", output: [] },
    completion = {
      provider,
      model: provider === "grok" ? "grok" : "sonar",
      choices: [{ message: { role: "assistant", content: "" } }],
    };
  let currentEvent = 0;
  const seenStates = new Set();
  const addCandidate = (x) => {
    try {
      const r = parseOne(x);
      const signature = JSON.stringify([r.sources, r.queries, r.status]);
      if (seenStates.has(signature)) return;
      seenStates.add(signature);
      if (candidates.length >= 1000)
        throw new Error(
          "Too many distinct evidence states in one stream. Split captures by response.",
        );
      r.sources = r.sources.map((s) => ({
        ...s,
        evidence: s.evidence.map(
          (e) => `Reconstructed after event ${currentEvent + 1}: ${e}`,
        ),
      }));
      candidates.push(r);
    } catch (err) {
      if (err.message.startsWith("Too many")) throw err;
    }
  };
  for (let i = 0; i < events.length; i++) {
    currentEvent = i;
    const e = events[i];
    if (!e || typeof e !== "object") continue;
    if (e.error || e.type === "error")
      warnings.push(`Provider reported an error at event ${i + 1}.`);
    if (provider === "chatgpt") {
      if (e.mapping) addCandidate(e);
      try {
        if (e.o || e.op) state = applyPatch(state, e);
        else if (e.v && typeof e.v === "object") state = structuredClone(e.v);
        else if (e.message) state = e;
        const m =
          state?.message || (state?.author && state?.content ? state : null);
        if (m) {
          const key = m.id || "stream-message";
          chatMessages.set(key, { message: structuredClone(m) });
          addCandidate({
            id: capture.id || `stream-${stableId(body)}`,
            mapping: Object.fromEntries(chatMessages),
            model: state.model_slug,
          });
        }
      } catch (err) {
        warnings.push(
          `Event ${i + 1}: ${err.message} Dependent evidence may be incomplete.`,
        );
      }
    } else if (provider === "anthropic" || provider === "claude") {
      if (e.chat_messages || (e.type === "message" && Array.isArray(e.content)))
        addCandidate(e);
      if (e.type === "message_start")
        anthropicMessage = { ...e.message, content: [] };
      if (e.type === "content_block_start")
        anthropicMessage.content[e.index] = structuredClone(e.content_block);
      if (e.type === "content_block_delta") {
        const b = anthropicMessage.content[e.index];
        if (!b) {
          warnings.push(`Event ${i + 1}: missing content block start.`);
          continue;
        }
        if (e.delta?.type === "text_delta")
          b.text = (b.text || "") + e.delta.text;
        if (e.delta?.type === "input_json_delta")
          b._input = (b._input || "") + e.delta.partial_json;
        if (e.delta?.type === "citations_delta" && e.delta.citation)
          (b.citations ||= []).push(e.delta.citation);
      }
      if (e.type === "content_block_stop") {
        const b = anthropicMessage.content[e.index];
        if (b?._input) {
          try {
            b.input = JSON.parse(b._input);
          } catch {
            warnings.push("Incomplete tool input JSON.");
          }
          delete b._input;
        }
      }
      // Older Claude browser streams may expose completion text only; these are not search logs.
    } else if (provider === "openai") {
      if (e.response?.output) {
        response = e.response;
        addCandidate(response);
      }
      if (e.type === "response.output_item.done" && e.item)
        response.output[e.output_index ?? response.output.length] = e.item;
      if (e.object === "response") addCandidate(e);
    } else if (provider === "gemini") {
      if (e.candidates) addCandidate(e);
    } else if (provider === "perplexity" || provider === "grok") {
      if (e.search_results)
        completion.search_results = [
          ...(completion.search_results || []),
          ...e.search_results,
        ];
      if (e.citations)
        completion.citations = [
          ...(completion.citations || []),
          ...e.citations,
        ];
      if (e.id) completion.id = e.id;
      if (e.model) completion.model = e.model;
      const c = e.choices?.[0];
      if (c?.message) completion.choices[0].message = c.message;
      if (c?.delta?.annotations)
        completion.choices[0].message.annotations = [
          ...(completion.choices[0].message.annotations || []),
          ...c.delta.annotations,
        ];
      if (c?.delta?.citations)
        completion.citations = [
          ...(completion.citations || []),
          ...c.delta.citations,
        ];
    }
  }
  if (provider === "anthropic" || provider === "claude") {
    const content = anthropicMessage.content.filter(Boolean);
    addCandidate(
      provider === "claude"
        ? {
            id: anthropicMessage.id,
            chat_messages: [{ sender: "assistant", content }],
          }
        : { ...anthropicMessage, content },
    );
  }
  if (provider === "openai") addCandidate(response);
  if (provider === "perplexity" || provider === "grok")
    addCandidate(completion);
  if (!candidates.some((r) => r.sources.length || r.queries.length))
    throw new Error(
      `No supported search evidence was found for ${provider}. This may be an incomplete capture or an unsupported browser-stream format. It is not evidence of zero searches.`,
    );
  const last = candidates.at(-1),
    sources = candidates.flatMap((r) => r.sources),
    queries = candidates.flatMap((r) => r.queries);
  const synthetic = events.some(
    (e) =>
      e?._citationTrackerFixture === true ||
      e?.v?._citationTrackerFixture === true,
  );
  const run = normalizeRun({
    ...last,
    synthetic,
    id: capture.id || last.id || `stream-${stableId(body)}`,
    sources,
    queries,
    status: candidates.flatMap((r) => r.status),
    warnings: [
      ...warnings,
      ...candidates
        .flatMap((r) => r.warnings)
        .filter(
          (w) =>
            !w.startsWith("No active branch") &&
            !w.startsWith("Search queries") &&
            !w.startsWith("This response contains"),
        ),
      ...(!queries.length
        ? ["Search queries were not observable in the supported events."]
        : []),
      ...(capture.complete === false
        ? [
            "Capture ended before transport completion; evidence may be partial.",
          ]
        : []),
    ],
    capture: {
      transport: capture.transport || "imported stream",
      complete: capture.complete === true,
      eventCount: events.length,
    },
    provenance: synthetic
      ? "Synthetic stream replay; not an authenticated provider capture."
      : "Network-response body; supported structured events only. Hidden reasoning is not extracted.",
  });
  return run;
}

function parseNetwork(input) {
  const records =
    input.format === "citation-tracker-capture-v1"
      ? input.records
      : input.log?.entries?.map((e) => ({
          url: e.request?.url,
          mimeType: e.response?.content?.mimeType,
          body: e.response?.content?.text,
          encoding: e.response?.content?.encoding,
          complete: true,
        }));
  if (!Array.isArray(records))
    throw new Error("Network capture has no records array.");
  const runs = [],
    skipped = [];
  records.forEach((r, i) => {
    const provider = r.provider || input.provider || providerFromUrl(r.url);
    if (!provider || typeof r.body !== "string") return;
    try {
      let body = r.body;
      if (r.encoding === "base64")
        body =
          typeof Buffer !== "undefined"
            ? Buffer.from(body, "base64").toString("utf8")
            : new TextDecoder().decode(
                Uint8Array.from(atob(body), (c) => c.charCodeAt(0)),
              );
      let result;
      try {
        result = parseInput(JSON.parse(body));
      } catch {
        result = [
          parseStream(body, provider, {
            ...r,
            id: `capture-${stableId(body)}`,
            transport: r.transport || "HAR response body",
          }),
        ];
      }
      for (const run of result)
        runs.push(
          normalizeRun({
            ...run,
            provenance: `Capture record ${i + 1}: ${run.provenance}`,
            warnings: [
              ...run.warnings,
              ...(r.complete === false
                ? ["Response transport was incomplete."]
                : []),
            ],
          }),
        );
    } catch (e) {
      skipped.push(`Record ${i + 1}: ${e.message}`);
    }
  });
  if (!runs.length)
    throw new Error(
      skipped.join(" ") ||
        "No supported response bodies found. Export a HAR with response content included.",
    );
  return runs.map((r) =>
    normalizeRun({ ...r, warnings: [...r.warnings, ...skipped] }),
  );
}

function parseText(value, filename = "", provider = "") {
  if (new TextEncoder().encode(value).length > 15 * 1024 * 1024)
    throw new Error("Each import must be below 15 MB.");
  let object;
  try {
    object = JSON.parse(value);
  } catch {}
  if (object?.format === "citation-tracker-capture-v1" || object?.log?.entries)
    return parseNetwork(object);
  if (/\.sse$|\.txt$/i.test(filename) || /^data:|^event:/m.test(value))
    return [parseStream(value, provider)];
  return parseJsonText(value, filename);
}
function parseConversation(raw) {
  return parseInput(raw)[0];
}

return {PROVIDERS,canonicalUrl,snapshotOf,normalizeRun,metrics,detect,parseOne,parseInput,parseText,parseConversation,parseStream,workspaceJson,sourcesCsv};
});
