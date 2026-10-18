# Release verification · 2.2 (chat-first workflow)

## Passed local checks

- **46 unit/regression tests:** 32 parser cases and 14 watcher cases. These cover original source counts, safe URL handling, normalized/exported chat-sync metadata, new-chat waiting, SPA chat changes, auth-locality, wrong-channel messages, popup failures, pause/stop, manual snapshot fallback, access denials, transient-failure pause, and long Retry-After waits.
- **Existing expanded dashboard browser checks:** imports, source search, combined status filters, filtered CSV versus collection exports, persistence, sample/personal isolation, mobile containment, empty/error states, and interactive guidance. A fresh workspace defaults to My data rather than sample totals.
- **New synthetic cross-origin browser test:** connect on a new-chat page before its ID exists; create the first conversation; send a local fixture through the bookmark into My data; apply a follow-up without duplicating the analysis or stealing source-search focus; pause and stop; reject the wrong channel; surface a denied request. Provider-origin requests are fulfilled locally by CDP interception. No authenticated AI website is contacted.
- **Local launcher test:** the explicit loopback server serves the correct root even from another working directory and prints a usable `127.0.0.1` URL.
- **Local synthetic SSE recorder test:** one source and one query captured/parsed through the existing CDP recorder. This is separate from saved-chat synchronization.
- **25 screenshot states** recorded across desktop, 390px mobile, and dark theme, including the new connection panel, AI-tab control panel, pause and denial states. The chat-first guide, main routes, and connection states were visually inspected. No uncaught exceptions or tested mobile page-width overflow were reported.
- Generated parser rebuilt from source. No production dependencies, API keys, third-party relay, backend uploads, or browser extension added.

## Commands

```sh
npm run build
npm test
npm run test:browser
npm run test:chat
npm run test:server
npm run test:capture
```

## Remaining verification

A real ChatGPT/Claude account smoke test is still required. Browser popup/opener isolation, private endpoint changes, account access, and provider response-saving behavior can affect real use. Tests of synthetic pages are not proof of authenticated compatibility. This release synchronizes saved conversation snapshots; it does not prove successful live network-stream extraction, ChatGPT fan-out recovery, or rich YouTube metadata capture. See REQUIREMENTS.md and WATCH_CHAT.md.

## Deployment packaging validation

- `npm run check` passed: Node syntax, required public assets, project-relative links, and a fresh generated parser. The check does not rewrite the parser.
- The 46 unit/regression tests passed on the deployment package.
- `npm run build:pages` produced an 18-file allowlisted public artifact; runner code, docs, private output, tests, and repository metadata were excluded.
- All supplied workflow files parsed as YAML. Their branch/Actions source selection still requires real GitHub settings and permissions; no workflow was executed on GitHub during this update.
- The application JS/CSS/HTML assets are unchanged from the chat-first release. A repository-subpath browser test serves the staged artifact at `/ai-citation-tracker/`, rather than assuming a domain root.
