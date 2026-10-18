# My import and evidence reference

I accept complete JSON responses, JSON arrays of responses, exported workspaces, JSONL, supported raw SSE, capture bundles, and HARs containing supported response bodies. I reject malformed JSON or unknown formats rather than display a misleading zero-source run. I cap a browser import at 15 MB per file.

## My native adapters

| Input I recognize | Retrieval evidence I read | Citation / query evidence I read |
|---|---|---|
| ChatGPT `mapping` saved conversation | `message.metadata.search_result_groups[].entries[]` | I resolve inline refs against `ref_id`, read `content_references`, `search_model_queries.queries`, and structured assistant web calls. I follow `current_node` parents when available; otherwise I warn about all branches. |
| Claude `chat_messages` | Named search `tool_result` / `web_search_tool_result` content | I read text-block citations and named search-tool input queries. |
| OpenAI `object: "response"` | `output[].web_search_call.action.sources` | I read assistant URL annotations and action query/queries. I request `include: ["web_search_call.action.sources"]` when making my own API call. |
| Anthropic `type: "message"` | `web_search_tool_result.content` | I read assistant text citations and `server_tool_use` / `tool_use` search inputs. |
| Gemini `candidates` | First candidate's `groundingMetadata.groundingChunks[].web` | I map `groundingSupports[].groundingChunkIndices` and `webSearchQueries`. I do not call grounding a complete search log. |
| Perplexity Sonar `choices` | `search_results`, if present | I read `citations`, message citations and URL annotations. I recognize a Sonar/Perplexity model or explicit provider label. |
| Grok/xAI `choices` | `search_results`, if present | I read citations and URL annotations. I require a Grok model or explicit `provider: "grok"`. |

I do not infer a provider solely because an arbitrary payload contains URLs. I treat citation-only output as evidence without an observable retrieval set. I do not promise future API versions or consumer-site compatibility from an API fixture.

## My normalized record for another provider

I use this small schema if I explicitly map another provider. I supply real flags and evidence paths; I do not let a format detector guess them.

```json
{
  "schemaVersion": 3,
  "id": "my-run-001",
  "platform": "my-provider",
  "title": "My mapped response",
  "prompt": "My original prompt",
  "createdAt": "2025-06-15T15:00:00Z",
  "queries": ["my observed search query"],
  "sources": [{
    "url": "https://example.org/guide",
    "title": "Guide",
    "retrieved": true,
    "cited": true,
    "evidence": ["response.search_results[0]", "answer.annotations[0]"],
    "snapshot": {"snippet": "The full available excerpt", "verified": false, "views": 0}
  }],
  "warnings": ["I mapped these flags manually; they are not independently verified."]
}
```

I do not replace missing queries, dates, or counts with invented values. I require actual booleans for source flags. I can import an array of these records or a workspace envelope `{ "schemaVersion": 3, "runs": [...] }`.

## My source snapshot

I preserve the full values of mapped fields: `snippet`, `publishedAt`, `attribution`, `channelName`, `followers`, `verified`, `views`, `likes`, `description`, and `timecodes` (text or a scalar-valued array). I accept the documented common aliases such as `pub_date`, `channel_name`, `subscribers`, `view_count`, and `like_count`, including supported `metadata` fields. I preserve zero and false. I do not preserve arbitrary unknown fields, download transcripts, or promise metadata a response did not expose. I extend `snapshotOf` and tests when a real new source shape justifies it.

I normalize HTTP(S) source URLs, strip fragments and recognized tracking parameters, preserve other query parameters, and sort those parameters for matching. I reject credentials and non-HTTP(S) links. I merge evidence flags per normalized URL **within one run**, not across unrelated runs. I also retain exact observed URL variants as `sources[].observedUrls`, and export them as `observed_urls_json` in CSV. The provided ChatGPT input has 42 exact variants mapping to 29 normalized sources, not 42 independent pages. My merged snapshot is one convenient view of observed fields, not a forensic raw-response archive; I retain the private raw capture separately when I need it.

## My exports

I export the selected collection as round-trip JSON, or download an individual analysis. I keep sample membership and analysis scope in the normalized record. I export one CSV row per URL/analysis pair with provider, model, title, URL, domain, retrieved/cited flags, evidence, full snippet, publication date and snapshot JSON. I quote cells and prefix formula-like values for spreadsheet safety. Source search matches title, URL, domain, and snippet, combined with the status filter. “Export visible sources CSV” exports only these rows from the selected analysis. Collection export buttons always export the whole selected collection, unaffected by source filters.

I migrate old project records by treating old sources as retrieved because the original schema lacked an explicit retrieved flag. I label that assumption. I retain the original storage key so an existing deployment can read old data; I keep an explicitly cleared workspace empty on reload.
