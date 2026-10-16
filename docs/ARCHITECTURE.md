# My architecture notes

## Why I keep this project small

I use native ES modules, semantic HTML, CSS variables, and browser storage. I deliberately avoid a bundler, framework runtime, chart dependency, or remote CDN. I can host the repository unchanged on GitHub Pages and run the same parser in Node.

I do not confuse a simple stack with unstructured code: I separate provider parsing, normalization, persistence, serialization, view composition, fixtures, tests, and operational documentation.

## My data flow

```text
My JSON / JSONL / pasted response
  -> My dispatcher identifies a supported payload shape
  -> My provider adapter records explicit evidence fields
  -> My normalizer validates URLs and merges duplicates within the run
  -> My import preview stages complete successful files
  -> My confirmation merges provider + run ID pairs
  -> My storage write succeeds before my visible workspace changes
  -> My filtered views / inspector / exports use normalized runs
```

I do not persist my raw uploads. I do persist normalized prompts and queries, which can still be sensitive.

## My module boundaries

- In `src/core/adapters.js`, I recognize provider-specific envelopes and collect retrieval/citation evidence. I do not render HTML or access localStorage there.
- In `src/core/model.js`, I own URL normalization, evidence merging, run shape, deterministic fallback IDs, and metrics. I don’t hide unknown response dates by substituting today.
- In `src/core/storage.js`, I own versioned storage, one-time v1 migration, and provider/ID replacement semantics.
- In `src/core/export.js`, I own round-trip JSON and quoted, formula-neutralized source CSV.
- In `src/ui/app.js`, I compose views, handle events, escape untrusted text, stage imports, and surface storage failures.
- In `src/ui/styles.css`, I own theme tokens, responsive layout, focus states, tables, and dialog presentation.
- In `tools/`, I keep my local server, CLI parser, and syntax checks separate from browser code.

## How I add another adapter

1. I obtain a representative saved response without credentials or private user content.
2. I identify exact fields that prove retrieval and citation. I do not walk arbitrary URL fields and guess their meaning.
3. I add a synthetic fixture in `public/examples/` with known retrieval-only, matched, and citation-only cases.
4. I implement a narrow detector and an adapter that returns `normalizeRun(...)` through my collector.
5. I add positive and negative tests, then run `npm run check` and `npm test`.
6. I update my provider matrix and explain version limitations.
7. I manually inspect a real response from that provider before describing the adapter as live-verified.

## My safety and failure choices

I escape dynamic HTML strings, validate source protocols, use `noopener noreferrer` for external links, avoid `eval`, and neutralize formula-like CSV values. I reject an unsupported JSON object instead of interpreting an empty parse as evidence of no citations.

I cap each import at 15 MB. I parse on the main thread, so a large or adversarial file can still stall the tab. I do not claim robust hostile-file isolation or unlimited-scale ingestion. If I need larger workloads, I would first move parsing into a worker and add total batch limits.

I keep unreadable stored data untouched and block further writes until an explicit reset. I leave old v1 data in place after migration until I explicitly clear it. I do not pretend localStorage is transactional across browser tabs: I use this project in one active tab and export backups before major changes. I do not support multi-user sync.

I use compact deterministic IDs when a provider omits one. They are not cryptographic identifiers; I prefer an explicit stable ID in custom imports when collision avoidance matters.

## My trade-offs

I use tables rather than decorative charts because I want auditable provider coverage and exact source evidence. I intentionally keep missing denominators visible. I don’t interpret sample metrics as a ranking of provider quality.

I keep the UI in one module at this size, while retaining a separate pure core. I would split view renderers into modules when additional workflows make that boundary worthwhile, not simply to increase the file count.

## How I isolate my guided demo

I retain the current workspace in memory, show synthetic runs without writing them to localStorage, and restore the retained workspace on exit. I leave demo mode before opening a personal import. I block destructive saved-data actions while the demo is active. I keep quick-start guidance accessible in a native dialog and test the guided path in Chromium.
