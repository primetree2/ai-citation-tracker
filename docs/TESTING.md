# My verification notes

I run `npm run build` and `npm test` with Node 22+. I test the original supplied artifacts, all five additional native API fixtures, source snapshots, citation-only denominators, URL safety, CSV safety, legacy migration, export round trips, SSE reconstruction, unsupported-event rejection, HAR content imports, and incomplete-capture warnings.

I run my optional browser checks from the repository root with Chrome/Chromium, Python and Node available:

```powershell
node tests/browser-smoke.mjs
# I can set the browser executable if necessary.
$env:BROWSER = "C:\Program Files\Google\Chrome\Application\chrome.exe"
node tests/browser-smoke.mjs
```

I use an isolated profile and a loopback server, never my real provider login. I check all four tabs, original sample loading, inline snapshots, malformed imports, synthetic provider imports, export actions, reload persistence, citation-only filtering, empty state persistence, keyboard-semantic controls, and narrow-screen page overflow. I save browser-state screenshots under ignored `test-results/` for review.

I separately test the capture utility against my local synthetic SSE server through `node tests/capture.test.mjs`. I expect one captured response, one retrieved/cited URL and one observed query. I deliberately do not treat this test as evidence of live provider compatibility.

I cannot certify every real provider API or private web endpoint from fixtures. I keep that distinction in my requirement audit. I never run the legacy batch runner against an authenticated account as part of automated tests.
