# My audit against the Beyond Labs interview task

## My conclusion

I re-read the original **Beyond Labs: Interview Task — Software Engineer & AI Automation Developer (LLM Research)**, especially Sections 2–5. I do **not** consider this dashboard alone a complete implementation of every task. I consider the project a usable evidence-review prototype supporting an **explicitly partial research submission**.

I distinguish three kinds of evidence: my original supplied saved-chat artifacts, my new synthetic adapter fixtures, and live-stream evidence. I have the first two. I do not have a successful ChatGPT live-stream capture from the earlier attempt, so I do not claim the third.

## My requirement-by-requirement check

| My reading of the brief | My current evidence | My assessment |
| --- | --- | --- |
| I pick a prompt that triggers ChatGPT search. | I have an earlier saved conversation using the n8n tutorial prompt, with search-result groups. | I have saved evidence for one prompt; I have not rerun it in this release. |
| I capture the network stream for that conversation. | My earlier notes describe the SSE endpoint and a failed fetch patch. My successful fallback was saved-conversation JSON. | **I have not completed successful live-stream capture.** |
| I extract citation snapshots: URL, title, snippet, and available metadata. | I preserve URLs, titles, snippets, publication dates, attribution, and explicit channel/engagement fields in normalized snapshots and exports. My original saved ChatGPT artifact has snippets/dates but lacks rich YouTube fields. | **I have partial coverage from saved JSON, not verified stream snapshots.** |
| I extract ChatGPT fan-out queries from the same stream. | My earlier ChatGPT artifact does not expose those queries. My parser reads supported query fields if present; a synthetic fixture tests that path. | **I have not demonstrated real ChatGPT fan-out extraction.** |
| I distinguish retrieved sources from final citations. | I reproduce 29 retrieved / 7 cited for the original ChatGPT saved artifact, using reference matching. | I have a working saved-artifact example; I do not equate retrieval records with full-page reading. |
| I analyze another assistant’s network behavior and structural differences. | I have earlier Claude saved-chat evidence with a web-search query and 9 retrieved / 7 cited. I compare its tool blocks with ChatGPT reference IDs in my research notes. | **I have a saved-response comparison, not a completed live-stream comparison.** |
| I sketch or build repeatable extraction. | I have shared browser/CLI adapters, JSON/JSONL imports, fixtures, and regression tests. | I have repeatable parsing of supported saved responses, not end-to-end automated acquisition. |
| I explain scaling beyond one query. | I include a concrete acquisition/parsing/storage plan below. | I have a plan, not a deployed bulk system. The brief does not require bulk execution. |
| I submit approach, outputs, code, and screenshots. | I have code, source extracts, screenshots, and first-person notes. My earlier long write-up also describes failed attempts. | I still need to assemble the final one-link submission and review its claims. |
| I explain failures and what I would do next. | I explicitly record failed stream capture, missing ChatGPT queries, unverified rich metadata, and fixture-only additional providers. | I have documented these limits rather than claiming full completion. |
| I state actual elapsed time and tools/AI used. | I document tools, but I cannot infer the applicant’s actual total elapsed time. | **I must supply my real time spent and review the tool disclosure before submission.** |
| I share one Google Doc and reply on the original booking-email thread. | My repository ZIP does not create/share the Google Doc or send that email. | **I must complete these submission steps myself.** |

## How I interpret “partial work is fine”

I read the brief’s explicit allowance for unfinished work, one-query examples, written notes instead of a recording, and sketches instead of a bulk system. I therefore do not need to pretend every item is finished for this to be a valid partial submission. I still need to make my approach, evidence, blockers, and next steps clear. I cannot promise how the recruiter will evaluate it.

## What I would do next to close the technical gaps

1. I capture one fresh ChatGPT search interaction through browser-level CDP/network instrumentation rather than relying on a late page-level fetch patch. I retain the exact prompt, response, request identifier, endpoint, and raw event file, with credentials removed before sharing.
2. I implement and fixture-test reconstruction of that observed stream version. I do not guess JSON patch semantics from a different version or treat the final event as a complete message.
3. I trace each extracted query to its event path and distinguish web-search queries from image-search/UI strings. I tie snapshot and citation IDs back to that same conversation.
4. I inspect the actual snapshot fields for a YouTube result. If channel info, counts, or description are absent, I report them as unavailable; I do not fetch unrelated page metadata and imply it came from the AI stream.
5. I repeat the same prompt on an accessible second platform and record the observed stream differences. I keep API-fixture compatibility separate from browser-network research.

## How I would scale the single-query workflow

I would separate acquisition, reconstruction, provider parsing, validation, and presentation. I would use an explicit job record for platform, model, prompt, timestamp, and capture version; keep encrypted raw artifacts outside the public repository; make parsing deterministic and versioned; queue low-volume captures with per-provider limits; isolate consented browser sessions; and record failures rather than silently retrying blocked accounts.

I would make jobs idempotent by capture identifier, store normalized source/citation tables with evidence paths, compare the same prompts and time windows, and add contract tests for payload drift. I would monitor acquisition failures, unresolved references, missing fields, and duplicate records. I would respect provider terms, quotas, privacy requirements, and account permissions. I have not implemented that acquisition system here.

## My final submission checklist

- I put my approach, limitations, outputs, repository/demo links, screenshots, time spent, and tool/AI disclosure into **one Google Doc**.
- I can use written notes; the original brief allows them instead of a Loom recording.
- I verify my deployed demo is the current version before adding its link.
- I verify all timestamps and claims in my earlier write-up rather than treating generated prose as new evidence.
- I share the document with **sachin@beyondlabs.io** as Editor, or use the brief’s allowed anyone-with-link viewing option.
- I reply to my original interview-booking email thread with the document link and leave its subject unchanged.
- I do not claim that I completed stream capture, unavailable query extraction, or rich YouTube metadata extraction.
