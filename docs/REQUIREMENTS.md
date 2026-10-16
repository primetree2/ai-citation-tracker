# My Beyond Labs requirement audit

I checked this upgrade against the previously supplied **Duplicate of Beyond Labs - Interview Task.docx**, not just against the dashboard screenshots. I interpret the task as a network-evidence investigation plus a repeatable extraction workflow. I do not substitute a polished UI or additional API fixtures for a real stream investigation.

**My conclusion: I have a usable partial submission, not verified completion of every requirement.** The brief explicitly allows partial work and values debugging and approach. I keep the missing live evidence visible below.

## My evidence levels

- **Verified on supplied artifacts:** I reproduced extraction from the original ChatGPT and Claude saved-chat JSON.
- **Implemented and locally tested:** I tested parser/stream behavior on synthetic fixtures and the recorder against a local SSE server.
- **Pending authenticated verification:** I still need a fresh provider web-search stream and real rich metadata evidence. I do not have account access in this build environment.

## My requirement-by-requirement status

| Recruiter requirement | What I have | What I still need / status |
|---|---|---|
| Task 1: send a prompt that triggers ChatGPT web search and capture the network stream | I include a recorder that attaches before the prompt, targeted HAR/SSE imports, and supported ChatGPT message/patch reconstruction. I tested it with a local synthetic response. | **Pending real capture.** The original artifact is a saved conversation, not a successful live response-stream capture. I will not call Task 1 fully complete from that file. |
| Extract each source URL, title, snippet and available citation snapshot metadata | I reproduce 29 retrieved / 7 cited in the supplied ChatGPT file and retain full mapped snapshots, including supported date/channel/follower/verification/view/like/description/timecode fields when present. | **Saved-chat extraction verified; rich live metadata pending.** The original samples do not demonstrate all rich YouTube fields. I do not invent them or fetch a transcript. |
| Provide clean table/JSON output | I provide source-level CSV, round-trip JSON, and expandable source snapshots in the original dashboard. | **Implemented and tested.** I will attach a small real output to my handoff document rather than only a screenshot. |
| Task 2: extract fan-out subqueries from the same stream | I support explicit structured query fields and reconstructed tool-input deltas. My synthetic ChatGPT patch replay includes a query; the original Claude file has one observable query. | **Partial.** The original ChatGPT saved file has no observable fan-out query. I still need same-stream live ChatGPT evidence and a manual cross-check. |
| Distinguish retrieved from sources cited in the final answer | I use result/tool/grounding records for retrievals and structured citations or resolved references for cited flags. I distinguish citation-only output and use matched citations / retrievals for the rate. | **Implemented and verified on supplied samples and fixtures.** I still spot-check a new live capture before trusting a changed private schema. |
| Main task: investigate other assistants' network traffic and where queries/sources/status appear | I have supplied Claude saved-chat evidence, five extra API format adapters, a narrow recorder with multiple targets, field mapping documentation, and supported SSE reconstruction. I expose provider-visible status summaries when present. | **Partial research, not completed live investigation.** The extra API fixtures are synthetic. Gemini consumer batchexecute and private nested Grok messages are not decoded. Capturing a response alone is not understanding it. |
| Explain structural differences and limitations | I document saved-message graphs, content blocks, response output items, grounding indices, completion citations, SSE patches and coverage limits. | **Implemented documentation.** I add live field observations when I actually obtain them. |
| Make extraction repeatable with a script/workflow | I provide a shared dependency-free parser, CLI, optional CDP capture utility, HAR import, and the retained experimental two-provider batch workflow. | **Local repeatability tested.** I still need a fresh authenticated smoke test of private endpoints and selectors. |
| One query is sufficient; bulk is optional and a scaling plan is acceptable | I support one manual prompt without requiring an API or a large batch. | **Covered.** I keep the scaling plan below rather than run uncontrolled scraping. |
| Submit one Google Doc link with notes or a 5–10 minute recording, outputs/code/screenshots, failures/next steps, actual time and tools | I include a submission template and links to code/output workflows. | **Submission still required by me.** A project ZIP or GitHub README alone is not the requested Google Doc. I must enter my actual time and tools, set sharing, and reply in the booking thread without changing its subject. |

## My minimal remaining evidence pass

1. I run `node runner/capture.mjs --provider chatgpt`, enable web search, and submit one prompt. I preserve the actual response stream and completion/error state.
2. I check that I captured the answer endpoint, not only a preparation request. If I only get an AbortError, sidebar data, empty body, or unsupported patches, I record that failure and stop claiming success.
3. I compare the raw stream with extracted URLs, citation refs and queries. I record one concrete source snapshot and any genuinely available rich metadata. I explicitly note absent fields.
4. I repeat one query on one accessible additional provider, preferably Claude, and document its actual event/block structure and field paths. I label any fallback saved-chat evidence separately.
5. I attach the redacted output and a screenshot or recording to my Google Doc, record my actual time, and submit the single shared link.

## My failures and limitations

I preserve the earlier finding that the original page-level ChatGPT fetch patch did not produce a successful live stream capture. I replaced it with browser-level monitoring, but local test success does not retroactively fix that original experiment. I do not reuse the old recursive extraction counts that incorrectly mixed unrelated URLs and query-like fields.

I cannot recover hidden queries or metadata that a provider never exposed. I cannot guarantee private endpoint stability, full body retention by Chrome, or support for every stream patch variant. I do not extract hidden chain of thought. I do not equate a footer URL, transcript URL, or image/entity text with a search result. I treat timestamps/model labels in supplied artifacts as reported values, not independent verification.

## My scaling plan

I first validate one response per provider with a frozen raw fixture and a manual citation check. I version adapters by observed schema, keep raw private captures separate from normalized outputs, and add regression cases when formats change. I use a small queued workflow with explicit account authorization, rate limits, retry/backoff for transient failures, and no retries for login or access denials. I deduplicate canonical URL/run pairs while retaining provenance and failed/partial states. I prefer documented APIs where possible and keep API-only evidence distinct from consumer web traffic. I do not bypass bot defenses or promise large-scale scraping from my prototype runner.
