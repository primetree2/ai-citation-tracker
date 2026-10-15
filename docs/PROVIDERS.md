# My provider import contract

I support concrete payload shapes, not a blanket claim that every file from a provider is compatible. I save complete, non-streaming JSON responses, keep credentials out of those files, and inspect warnings after importing.

## My ChatGPT conversation adapter

I recognize a `mapping` object. I read the active parent chain when `current_node` is available; otherwise I include saved branches and show a warning. I use these fields:

- I read retrieved pages from `message.metadata.search_result_groups[].entries[]`.
- I map structured or string `ref_id` values to assistant `<Cite refs={["turn0search0"]}/>` and legacy private-use citation markers.
- I also read URL-bearing `metadata.content_references[].items`, `.sources`, or direct `.url` citation records.
- I read available `search_model_queries.queries` and JSON web-search tool calls.

I do not infer citations from plain URLs in answer text, parse every ChatGPT export format, or call private conversation endpoints. I cannot reliably separate several prompts within one saved conversation; I count one conversation as one run and display the first user prompt.

## My Claude saved-chat adapter

I recognize `chat_messages`. I read named search `tool_use` / `tool_result` content and assistant text-block `citations`, including nested citation sources. I resolve citations after gathering all blocks so their order does not matter. I don’t read arbitrary tool output or message text as a source list.

## My OpenAI Responses adapter

I recognize `object: "response"` with an `output` array. I read `web_search_call.action.sources`, available action query fields, and assistant message `content[].annotations` with `type: "url_citation"`.

When I make a request outside this app, I request the source list explicitly:

```json
{
  "tools": [{ "type": "web_search" }],
  "include": ["web_search_call.action.sources"]
}
```

I add my chosen model and input in my own API client. I do not execute this request from the static dashboard. If my saved response only contains annotations, I preserve citation-only evidence and show no matched citation rate.

## My Anthropic Messages adapter

I recognize `type: "message"` with a content array. I read `server_tool_use` search inputs, `web_search_tool_result.content[]` web results, and `text.citations[]` URL citations. I report a search result’s `error_code` when present. I save the response body from my own search-enabled request elsewhere; I do not store a token here.

I don’t claim document-location citations are web URLs. I only include valid HTTP(S) source URLs.

## My Gemini grounding adapter

I recognize `candidates[]`. I read the first candidate’s `groundingMetadata.groundingChunks[].web.uri`, mark chunks referenced by `groundingSupports[].groundingChunkIndices` as cited, and retain `webSearchQueries` when present.

I treat chunks as observed grounding retrievals, not every page visited by search. I keep provider redirect URLs; I do not automatically resolve them or pretend their host is the final publisher domain. I do not merge alternative candidates into one answer.

## My Perplexity Sonar adapter

I recognize chat-completion `choices[]` with a Sonar/Perplexity model name, or an explicit `provider: "perplexity"` label. I read top-level `search_results` as retrieval evidence and `citations` as citation evidence. I also accept first-choice URL annotations and message citation arrays. I don’t match bracket numbers by guessing against answer text.

## My Grok adapter

I recognize chat-completion `choices[]` with a Grok model name, or `provider: "grok"`. I read top-level / first-choice citation arrays and first-choice URL annotations. I only count retrievals if an explicit `search_results` list exists in the file. My bundled Grok fixture intentionally has citations but no retrieval log.

I do not claim native support for xAI Responses `output` envelopes, every newer search-tool response, or consumer chat exports. I map those through my normalized schema until I add and test a dedicated adapter.

## My other-provider route

I use [my normalized schema](SCHEMA.md) for other payloads, including Copilot, Mistral, and DeepSeek. I specify my own `platform`, prompt, timestamp, and source evidence flags. I keep those mappings explicit instead of automatically mining every URL in arbitrary JSON.

## My batch and error behavior

I accept a single response, an array of responses, a v3 workspace envelope, or one response per JSONL line. I reject an entire file if any record in that file cannot be parsed. I can still preview successful files from the same upload batch. I save only after I confirm my preview.

I use deterministic fallback IDs when a provider omits an ID. I replace matching provider/ID pairs; I do not silently append a duplicate of the same saved run. I treat provider payload changes as an adapter maintenance task, not proof that a provider has no citations.

## My verification boundary

I test all seven adapters against synthetic fixtures and shared regression tests. During this release I also checked the earlier project’s ChatGPT and Claude saved files locally; I do not redistribute those private conversation files. I have not made live API calls or exercised authenticated provider UIs. I verify current API requirements in the provider’s own documentation before making a request from my separate client.
