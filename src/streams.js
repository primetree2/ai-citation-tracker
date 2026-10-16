import { parseInput, parseOne, parseJsonText } from "./adapters.js";
import { normalizeRun, stableId } from "./model.js";

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

export function parseStream(body, provider, capture = {}) {
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

export function parseText(value, filename = "", provider = "") {
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
export function parseConversation(raw) {
  return parseInput(raw)[0];
}
