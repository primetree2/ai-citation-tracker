# My network capture workflow

I separate **recording traffic**, **recognizing a format**, and **verifying the extracted evidence**. A recorder can save a response whose private schema my parser does not support. I never label that a completed investigation.

## My simplest hosted workflow

I use Add data → Load ChatGPT sample / Load Claude sample to reproduce the original saved-chat analysis. I use the extra API fixtures to test format compatibility without logging in. I use the local capture path only when I need new network evidence.

## My local Chrome recorder

I install Node.js 22 or newer and Google Chrome. In a terminal at the repository root, I run:

```powershell
node runner/capture.mjs --provider chatgpt
```

I use `claude`, `gemini`, `perplexity`, or `grok` as another browser target. I log in manually in the newly opened, dedicated profile. I keep that tab open, enable web search, submit one prompt, and wait for the answer to finish. I press Enter in the terminal only then. I import the saved JSON from `runner/out/` into the dashboard.

I do not reuse my normal browser profile, bypass login, disable provider defenses, or collect authentication headers. I do not automate account creation. I keep the remote-debugging interface local; I do not expose its port to a network.

### My Chrome path on Windows

I can set the executable explicitly if Chrome is installed elsewhere:

```powershell
node runner/capture.mjs --provider chatgpt --chrome "C:\Program Files\Google\Chrome\Application\chrome.exe"
# I use the per-user installation path if that is where Chrome is installed.
node runner/capture.mjs --provider claude --chrome "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
```

I can pass `--out runner/out/my-capture.json` and `--profile runner/.capture-profile-other`. I use an unused profile when a previous capture browser is still open; I do not run two Chrome instances on the same profile. I close and retry if login redirects or a private endpoint changes.

### What I record

I attach Chrome DevTools Protocol `Network` monitoring **before navigation and before sending the prompt**. I match narrowly scoped response endpoints, retain response bodies/status/MIME type/completion state, and strip query strings from recorded endpoint URLs. I attempt `Network.streamResourceContent` for in-flight bodies and use `Network.getResponseBody` on completion. If the final body cannot be recovered, I mark completion false rather than assert a full capture.

I capture only the opened tab, not all tabs or worker targets. A service worker, changed endpoint, new tab, unsupported browser, closed response, expired account, or body eviction can result in an empty or incomplete file. I keep normal Chrome security defaults. I do not promise the capture API is supported by every Chrome version.

My bundle looks like this:

```json
{
  "format": "citation-tracker-capture-v1",
  "provider": "chatgpt",
  "capturedAt": "2025-06-15T15:00:00Z",
  "records": [{
    "provider": "chatgpt",
    "url": "https://chatgpt.com/backend-api/f/conversation",
    "transport": "CDP response body",
    "complete": true,
    "body": "data: {\"message\":{...}}\n\n"
  }]
}
```

I treat the abbreviated `body` above as an illustration, not a valid replay fixture. I use `sample-data/streams/chatgpt-synthetic.sse` for an executable replay.

## My supported stream decoding

| Format | What I reconstruct | What I do not claim |
|---|---|---|
| ChatGPT browser SSE | Full message snapshots and supported `p/o/v` JSON-pointer add, replace, append, remove, and patch-list events; structured search queries, result groups, citations | I do not claim all private delta variants work. Unsupported operations and unresolved citations produce warnings. I have not verified this against a new authenticated live ChatGPT run. |
| Claude / Anthropic content blocks | `message_start`, `content_block_start`, text/input/citation deltas and block stops; named search tool data | I do not infer retrievals from older completion-text-only streams or hidden internal reasoning. |
| OpenAI Responses API SSE | Completed response objects and done output items with search sources and annotations | I need source inclusion in the API output. I do not reconstruct every possible partial annotation delta. |
| Gemini API | JSON/SSE candidates, grounding chunks and supports | I do not decode the Gemini consumer site's private batchexecute envelope. |
| Perplexity / Grok API | Completion chunks with explicit search_results, citations, or URL annotation arrays | I do not assume their private consumer nested messages match API chunks. |

I use the first Gemini candidate only. I merge observed metadata across recognized states, deduplicate canonical URLs, and retain reconstructed-event evidence paths. An event label identifies the reconstructed state after that event, not a claim that every field first appeared in that exact event.

I do not count arbitrary hyperlinks, image query text, request parameters, sidebar navigation, or a broad recursive URL walk as retrieval/citation evidence. I do not extract hidden chain of thought. I show public status labels only when present in supported metadata.

## My HAR alternative

I open Chrome DevTools → Network **before** submitting the prompt, keep the response until completion, and export a HAR **with response content**. I import the `.har` file on Add data. I inspect the HAR locally first: full HAR exports can contain credentials in headers even though my parser reads only selected response bodies. I never publish an unredacted HAR.

I cannot recover a body that the browser omitted from the HAR. I get a clear error if no supported bodies exist. I keep the 15 MB per-file browser import limit; for larger captures I isolate the relevant response locally rather than split an SSE event arbitrarily.

## My verification checklist

1. I confirm the recorded request is the answer/search response, not a preparation or navigation request.
2. I inspect completion and errors. Transport completion alone does not prove a successful model answer.
3. I manually spot-check one query, one retrieved source, and one citation reference against the response body.
4. I verify that a rich metadata field genuinely exists before reporting it. Missing fields stay absent.
5. I export the normalized JSON/CSV and note the provider, input format, tool versions, and failures.

I tested the recorder against a local synthetic SSE endpoint that emits one source and one query. I have not claimed the local test as authenticated platform research. My original saved-chat files verify parser behavior, not a successful ChatGPT stream capture.
