import { normalizeRun, canonicalUrl, snapshotOf } from "./model.js";
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

export function detect(raw) {
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

export function parseOne(raw) {
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

export function parseInput(input) {
  const list = Array.isArray(input)
    ? input
    : Array.isArray(input?.runs)
      ? input.runs
      : [input];
  if (!list.length) throw new Error("This file contains no runs.");
  return list.map(parseOne);
}

export function parseJsonText(value, filename = "") {
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
