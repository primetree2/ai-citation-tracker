# Chat-first update · 2.2

- Restored a practical three-step guide: add the bookmark → connect a new/current AI chat → ask a web-search question and inspect automatically synced evidence.
- Added an explicit opt-in chat watcher with a visible control panel and dashboard connection status. The watcher follows the current tab, updates about every 15 seconds, and supports Sync now, Pause/Resume, Stop, and Save snapshot.
- Added secure cross-window handshake checks, no automatic retries after access denial, rate-limit waits, transient-error pause, acknowledgement handling, and disconnected/idle states.
- Preserved search focus and expanded source details during follow-up updates. Existing personal analyses and sample isolation remain intact.
- Made My data the default; moved sample walkthroughs into an optional section.
- Added an explicit loopback launcher (`python runner/serve.py`) and Windows `start-local.bat`, avoiding the invalid `[::]` browser link.
- The watcher synchronizes saved conversation evidence, not the raw answer stream. Authenticated provider testing remains pending. See WATCH_CHAT.md.

---

# Usability update · 2.1

This update keeps the existing static deployment and original four-tab design. The Runs label is now Analyses. No credentials, provider calls, backend, or production dependencies were added.

## Using the improvements

1. Open **How it works**. Each of its three cards has an action: load the ChatGPT example, open its sources, or download its complete CSV without modifying your data.
2. Use **Sample data / My data** to select the collection used by overview totals, analysis lists, exports, and clear actions. Sample loads never delete personal analyses. Uploaded synthetic fixtures remain sample data. Individual analysis downloads preserve collection membership.
3. In **Add data**, expand **Where do I get this file?** Choose ChatGPT or Claude. The guide distinguishes saved-chat imports from advanced network capture; neither requires entering API credentials into the dashboard.
4. Select an analysis and use **Search sources**. Search matches title, canonical URL, domain, or snippet, and combines with the status filter.
5. Use **Export visible sources CSV** for precisely those results. **Export collection CSV/JSON** exports the selected collection regardless of a source filter.
6. Open **Source details** to see mapped metadata and exact observed URL variants. URL counting and conversation-level scope are explained above the analysis metrics.

## Evidence accuracy

The ChatGPT sample contains 42 distinct exact URLs that become 29 normalized source URLs. Seven normalized sources were cited, leaving 22 without matching citation evidence. Tracking parameters and equivalent trailing slashes account for the count difference in this sample. The general normalization rule also removes fragments. Counts are not proof a full page was read.

No successful authenticated live capture was created by this update. A network-capture badge describes the input transport, not a research verification. Synthetic fixtures remain labelled. Real rich YouTube metadata and live ChatGPT search-query extraction are still pending. Provider-visible statuses are not hidden reasoning.

## Existing browser data

The original storage key is retained. Previously marked `demo`, `synthetic`, and `source: "sample"` records migrate into Sample data. Unmarked legacy records remain in My data; the app does not infer provenance from an ID or prompt. Back up an existing collection before changing browser storage or deploying. Desktop/mobile browser storage remains separate by origin and is not encrypted or synced.

Re-imports replace matching provider + ID records only within their own collection. A JSON collection backup retains sample labels and analysis scope. CSV is a source table, not a round-trip workspace backup. Previously normalized exports cannot recover raw URL variants that were already discarded; re-import the original raw artifact to recover them.

## Deliberately deferred

- Answer-passage-to-citation navigation: requires retaining answer text, citation offsets, and provider-specific mapping. It is not faked by linking a source to the whole answer.
- New provider research, authenticated captures, rich metadata claims, and final recruiter submission.
- Deployment to GitHub: replace files in the existing repository after checking the diff; no remote repository was modified here.

## Run locally

From the extracted repository root:

```sh
python -m http.server 8000
```

Open `http://localhost:8000/`. Do not double-click the HTML file: sample loading uses local HTTP requests.

## Check the update

```sh
npm run build
npm test
npm run test:browser
npm run test:capture
```

Browser tests require Chrome/Chromium (or set `BROWSER` to its path). Tests use local synthetic data only and never authenticate to a provider. See TESTING.md for environment details.

## Deployment packaging update

- Rewrote README with exact copy-into-existing-repository and push instructions, preserving `.git` and avoiding a nested extraction folder.
- Fixed the missing `npm run check` command that previously broke the old CI workflow. Split syntax/static validation and unit tests into clear workflows.
- Added Pages-source detection: keep existing branch-root deployment, or select GitHub Actions and use the allowlisted `_site/` artifact. The workflow does not change repository settings.
- Added a non-mutating generated-parser freshness check and a staged-artifact browser smoke test under `/ai-citation-tracker/`.
- Added DEPLOYMENT.md, hosted-bookmark replacement instructions, and ignore rules for build output and common private local files.
- No application interface or chat-sync behavior was changed by this deployment packaging update. No Git remote was modified and no real deployment was executed here.
