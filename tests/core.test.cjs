const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path");
const p = require("../site/parser.js"),
  root = path.join(__dirname, "..");
const read = (f) => JSON.parse(fs.readFileSync(path.join(root, f), "utf8"));
for (const [platform, ret, cit, q] of [
  ["chatgpt", 29, 7, 0],
  ["claude", 9, 7, 1],
])
  test("Original " + platform + " evidence", () => {
    const r = p.parseOne(read(`sample-data/${platform}_raw.json`));
    assert.equal(r.retrieved, ret);
    assert.equal(r.cited, cit);
    assert.equal(r.queries.length, q);
  });
for (const platform of ["openai", "anthropic", "gemini", "perplexity", "grok"])
  test(platform + " native fixture and round trip", () => {
    const r = p.parseOne(read(`sample-data/api/${platform}.json`));
    assert.equal(r.platform, platform);
    assert.ok(r.cited > 0);
    assert.deepEqual(p.parseInput(JSON.parse(p.workspaceJson([r]))), [r]);
  });
test("Citation-only is not a retrieval denominator", () => {
  const r = p.parseOne(read("sample-data/api/grok.json"));
  assert.equal(r.retrieved, 0);
  assert.equal(p.metrics([r]).rate, null);
  assert.equal(p.metrics([r]).citationOnly, 2);
});
test("Canonical URLs and unsafe URLs", () => {
  assert.equal(
    p.canonicalUrl("https://a.test/x?b=2&utm_source=z&a=1#x"),
    "https://a.test/x?a=1&b=2",
  );
  assert.equal(p.canonicalUrl("javascript:alert(1)"), null);
  assert.equal(p.canonicalUrl("https://u:secret@a.test"), null);
});
test("Metadata preserves zero and false, not invented fields", () => {
  assert.deepEqual(p.snapshotOf({ views: 0, verified: false }), {
    views: 0,
    verified: false,
  });
});
test("CSV formula protection and full snippet", () => {
  const r = p.normalizeRun({
    platform: "test",
    sources: [
      {
        url: "https://a.test",
        title: "=1+1",
        snapshot: { snippet: "full\ntext" },
        retrieved: true,
      },
    ],
  });
  const csv = p.sourcesCsv([r]);
  assert.ok(csv.includes("'=1+1"));
  assert.ok(csv.includes("full\ntext"));
});
test("Legacy export can be imported", () => {
  const r = p.parseOne({
    id: "old",
    platform: "chatgpt",
    prompt: "old",
    queries: [],
    sources: [{ url: "https://a.test", cited: true }],
  });
  assert.equal(r.retrieved, 1);
  assert.ok(r.warnings.some((x) => x.startsWith("Legacy")));
});
test("Strict malformed flags and input rejection", () => {
  assert.throws(() =>
    p.normalizeRun({ sources: [{ url: "https://a.test", cited: "false" }] }),
  );
  assert.throws(() => p.parseText("not JSON"));
  assert.throws(() => p.parseInput([]));
});
const sse = (events) =>
  events.map((e) => "data: " + JSON.stringify(e) + "\n\n").join("");
const cg = {
  id: "m",
  author: { role: "assistant" },
  content: { parts: [""] },
  metadata: {
    search_model_queries: { queries: ["n8n tutorials"] },
    search_result_groups: [
      {
        entries: [
          {
            url: "https://example.org/tutorial",
            title: "Tutorial",
            ref_id: { turn_index: 1, ref_type: "search", ref_index: 0 },
            snippet: "Full excerpt",
            views: 0,
            verified: false,
            description: "Full description",
            timecodes: "00:00 Intro; 02:30 Workflow",
          },
        ],
      },
    ],
  },
};
const chatEvents = [
  { v: { message: cg, _citationTrackerFixture: true } },
  {
    p: "/message/content/parts/0",
    o: "append",
    v: 'Source <Cite refs={["turn1search0"]}/>',
  },
];
test("ChatGPT SSE snapshot + append patch", () => {
  const r = p.parseStream(sse(chatEvents), "chatgpt", { complete: true });
  assert.equal(r.retrieved, 1);
  assert.equal(r.cited, 1);
  assert.deepEqual(r.queries, ["n8n tutorials"]);
  assert.equal(r.sources[0].snapshot.verified, false);
  assert.equal(r.capture.eventCount, 2);
});
test("Unsupported patch is visible, prototype stays clean", () => {
  const r = p.parseStream(
    sse([
      ...chatEvents,
      { o: "replace", p: "/__proto__/polluted", v: true },
      { o: "mystery", v: 1 },
    ]),
    "chatgpt",
  );
  assert.ok(r.warnings.some((x) => x.includes("Unsafe patch")));
  assert.equal({}.polluted, undefined);
});
test("OpenAI completed SSE", () => {
  const r = p.parseStream(
    sse([
      {
        type: "response.completed",
        response: read("sample-data/api/openai.json"),
      },
    ]),
    "openai",
  );
  assert.equal(r.retrieved, 2);
  assert.equal(r.cited, 1);
});
test("Anthropic stream tool input and citations", () => {
  const r = p.parseStream(
    sse([
      {
        type: "message_start",
        message: { id: "stream", type: "message", role: "assistant" },
      },
      {
        type: "content_block_start",
        index: 0,
        content_block: {
          type: "server_tool_use",
          name: "web_search",
          input: {},
        },
      },
      {
        type: "content_block_delta",
        index: 0,
        delta: {
          type: "input_json_delta",
          partial_json: '{"query":"test search"}',
        },
      },
      { type: "content_block_stop", index: 0 },
      {
        type: "content_block_start",
        index: 1,
        content_block: {
          type: "web_search_tool_result",
          content: [{ url: "https://a.test", title: "A" }],
        },
      },
      {
        type: "content_block_start",
        index: 2,
        content_block: {
          type: "text",
          text: "Answer",
          citations: [{ url: "https://a.test", title: "A" }],
        },
      },
    ]),
    "anthropic",
  );
  assert.equal(r.retrieved, 1);
  assert.equal(r.cited, 1);
  assert.deepEqual(r.queries, ["test search"]);
});
test("Gemini and completion SSE", () => {
  assert.equal(
    p.parseStream(sse([read("sample-data/api/gemini.json")]), "gemini").cited,
    1,
  );
  assert.equal(
    p.parseStream(sse([read("sample-data/api/grok.json")]), "grok").cited,
    2,
  );
});
test("Unknown browser stream does not pretend zero", () => {
  assert.throws(
    () => p.parseStream('data: {"response":"hello"}\n\n', "gemini"),
    /No supported search evidence/,
  );
});
test("HAR content-only import ignores headers", () => {
  const h = {
    log: {
      entries: [
        {
          request: {
            url: "https://api.openai.com/v1/responses",
            headers: [{ name: "Authorization", value: "SECRET" }],
          },
          response: {
            content: {
              text: JSON.stringify(read("sample-data/api/openai.json")),
            },
          },
        },
      ],
    },
  };
  const r = p.parseText(JSON.stringify(h))[0];
  assert.equal(r.cited, 1);
  assert.ok(!JSON.stringify(r).includes("SECRET"));
});
test("Capture incomplete warning and base64 content", () => {
  const c = {
    format: "citation-tracker-capture-v1",
    records: [
      {
        provider: "chatgpt",
        body: Buffer.from(sse(chatEvents)).toString("base64"),
        encoding: "base64",
        complete: false,
      },
    ],
  };
  const r = p.parseText(JSON.stringify(c))[0];
  assert.equal(r.cited, 1);
  assert.ok(
    r.warnings.some((w) => w.includes("incomplete") || w.includes("partial")),
  );
});
test("JSONL preserves atomic parse failure", () => {
  assert.throws(
    () =>
      p.parseText(
        JSON.stringify(read("sample-data/api/grok.json")) + "\nBROKEN",
        "runs.jsonl",
      ),
    /line 2/,
  );
});
fs.writeFileSync(
  path.join(root, "sample-data/streams/chatgpt-synthetic.sse"),
  sse(chatEvents),
);
test("Structured timecodes survive normalization", () => {
  const r = p.normalizeRun({
    platform: "x",
    sources: [
      {
        url: "https://a.test",
        snapshot: { timecodes: [{ time: "00:00", title: "Intro" }] },
      },
    ],
  });
  assert.deepEqual(p.normalizeRun(r).sources[0].snapshot.timecodes, [
    { time: "00:00", title: "Intro" },
  ]);
});
test("Bad array patches warn without corrupting evidence", () => {
  const r = p.parseStream(
    sse([
      ...chatEvents,
      { o: "replace", p: "/message/content/parts/nope", v: "bad" },
    ]),
    "chatgpt",
  );
  assert.ok(r.warnings.some((w) => w.includes("Invalid array patch")));
  assert.equal(r.cited, 1);
});
test("Repeated token states do not multiply source rows", () => {
  const r = p.parseStream(
    sse([
      ...chatEvents,
      ...Array.from({ length: 100 }, () => ({
        o: "append",
        p: "/message/content/parts/0",
        v: "x",
      })),
    ]),
    "chatgpt",
  );
  assert.equal(r.sources.length, 1);
  assert.ok(r.sources[0].evidence.length < 10);
});
test("Citation merge retains the available retrieval title", () => {
  const r = p.normalizeRun({
    platform: "test",
    sources: [
      {
        url: "https://a.test/x",
        title: "An informative title",
        retrieved: true,
        snapshot: { snippet: "Full excerpt" },
      },
      { url: "https://a.test/x", cited: true },
    ],
  });
  assert.equal(r.sources[0].title, "An informative title");
  assert.equal(r.sources[0].snapshot.snippet, "Full excerpt");
});
test("Uploaded native API fixtures retain their synthetic label", () => {
  const r = p.parseOne(read("sample-data/api/openai.json"));
  assert.equal(r.synthetic, true);
  assert.match(r.provenance, /Synthetic/);
});

test("Original URL variants reconcile 42 raw URLs with 29 normalized sources", () => {
  const r = p.parseOne(read("sample-data/chatgpt_raw.json"));
  assert.equal(r.sources.length, 29);
  assert.equal(new Set(r.sources.flatMap((s) => s.observedUrls)).size, 42);
  const restored = p.parseInput(JSON.parse(p.workspaceJson([r])))[0];
  assert.deepEqual(restored.sources, r.sources);
  assert.ok(p.sourcesCsv([r]).includes("observed_urls_json"));
});
test("Sample collection membership and scope survive JSON round trip", () => {
  const r = p.normalizeRun({
    id: "sample",
    platform: "custom",
    sample: true,
    analysisScope: "Saved conversation · included messages",
    sources: [],
  });
  assert.deepEqual(p.parseInput(JSON.parse(p.workspaceJson([r])))[0], r);
  assert.equal(p.normalizeRun({ sources: [], synthetic: true }).sample, true);
  assert.equal(p.normalizeRun({ sources: [], source: "sample" }).sample, true);
  assert.equal(p.normalizeRun({ sources: [] }).sample, false);
});
test("Saved chat adapters disclose conversation-level scope", () => {
  for (const platform of ["chatgpt", "claude"]) {
    const r = p.parseOne(read(`sample-data/${platform}_raw.json`));
    assert.match(r.analysisScope, /Saved conversation/);
    assert.match(r.analysisScope, /multiple answers/);
  }
});
test("Original URL variants reject unsafe or mismatched values", () => {
  const r = p.normalizeRun({
    sources: [
      {
        url: "https://example.org/",
        observedUrls: [
          "javascript:alert(1)",
          "https://other.org",
          "https://example.org/?utm_source=test",
        ],
      },
    ],
  });
  assert.deepEqual(r.sources[0].observedUrls, [
    "https://example.org/?utm_source=test",
  ]);
  assert.throws(() =>
    p.normalizeRun({
      sources: [{ url: "https://example.org", observedUrls: "wrong" }],
    }),
  );
});

test("Chat sync metadata survives export without a connection secret", () => {
  const r = p.normalizeRun({
    platform: "chatgpt",
    sources: [],
    chatSync: {
      mode: "saved-chat-poll",
      observedAt: "2026-10-18T00:00:00Z",
      channel: "do-not-retain",
    },
  });
  assert.equal(r.chatSync.mode, "saved-chat-poll");
  assert.ok(!JSON.stringify(r).includes("do-not-retain"));
  assert.deepEqual(p.parseInput(JSON.parse(p.workspaceJson([r])))[0], r);
});
