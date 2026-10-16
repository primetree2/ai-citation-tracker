# My submission draft

I use this as the basis for my one-link Google Doc. I replace the bracketed fields, verify the deployed links, and review every claim before sending it. I do not submit this draft unchanged.

## My approach

I investigated the difference between retrieved sources and final citations for a web-search prompt about n8n tutorials. My earlier browser capture attempt did not capture the main ChatGPT stream successfully, so I used saved-conversation JSON as a fallback and documented that limitation.

I initially over-counted ChatGPT sources and failed to identify citations with a generic parser. I then used provider-specific adapters: ChatGPT reference IDs and inline citation markers, and Claude search tool blocks and citations. I normalized tracking parameters and deduplicated URLs within each run.

## My outputs

- I keep my code at https://github.com/primetree2/ai-citation-tracker.
- I share my deployed prototype at https://primetree2.github.io/ai-citation-tracker/ after checking the current version is published.
- I use **Quick start → Try 60-second demo** for a no-account walkthrough. I label its data synthetic.
- I use **Quick start → Preview original case evidence** to inspect two source extracts from the earlier supplied saved chats: ChatGPT 29 retrieved / 7 cited, and Claude 9 retrieved / 7 cited.
- I preserve available snippets, dates, attribution, and explicit metadata in source snapshots and exports. I do not fill unavailable YouTube fields with guesses.
- I attach or link my selected screenshots and original output files here: [my reviewed evidence links].

## What did not work

I did not successfully capture the main ChatGPT live stream in the earlier attempt. I therefore did not demonstrate ChatGPT fan-out extraction from that same stream, and I did not verify the richer YouTube snapshot fields described in the brief. I can inspect a saved Claude query, but I do not present fixture-only API adapters for other platforms as live browser-network research.

I built a useful review tool around the available evidence, but I do not claim this UI closes those research gaps.

## What I would do next

I would capture a fresh single-query interaction through browser-level network instrumentation, retain its raw events securely, reconstruct the observed stream format, trace queries and snapshot references to the same response, and repeat the prompt on an accessible second platform. I would record absent fields and blocked captures explicitly.

I would scale by separating capture jobs, stream reconstruction, versioned adapters, validation, storage, and presentation. I would add idempotent job IDs, provider-specific rate limits, payload-drift tests, failure monitoring, secure session isolation, and access controls. I have not deployed that acquisition system.

## My time and tools

I spent **[my actual elapsed time, including any later prototype improvements]**. I distinguish my original investigation time from subsequent interface and documentation work: **[my breakdown]**.

I used **[my confirmed tools]**. My project now uses JavaScript/Node.js for parsing and local tooling, Chromium for browser checks, and AI assistance for code and documentation work. I verify this disclosure against what I actually used before submitting.

## My final check

I verify that the deployed demo opens, the original-case preview is labeled accurately, the code is accessible, the evidence contains no secrets, my time/tools fields are complete, and my Google Doc sharing permissions match the original brief. I then reply on the existing interview-booking email thread without changing its subject.
