# My verification notes

## My automated core checks

I run Node.js 22+ from the repository root:

```powershell
npm run check
npm test
```

I check JavaScript syntax and entry-page asset paths. I run **40 regression tests** covering all seven synthetic provider fixtures, normalized custom imports, batch envelopes, JSONL errors, size limits, unknown formats, URL safety, duplicate evidence merging, string-boolean rejection, unknown dates, matched-rate semantics, ChatGPT branch selection and citation markers, Claude citation ordering, Gemini candidate scope, round-trip backups, CSV injection handling, local persistence, corrupt storage, v1 migration, replacement keys, deterministic IDs, and epoch timestamps.

I do not substitute syntax checks for a working UI. I use a separate browser smoke tool and visual review.

## My repeatable browser smoke test

I can run this optional command when Chrome or Chromium is installed:

```powershell
npm run test:browser
```

On Windows I use Chrome’s standard installation path by default. If mine is elsewhere, I set its full path first:

```powershell
$env:BROWSER="C:\Program Files\Google\Chrome\Application\chrome.exe"
npm run test:browser
```

On Linux I expect `chromium` on PATH; I can override `BROWSER` with another Chromium-compatible executable. On macOS I can set it to `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`.

I use an isolated temporary browser profile and a separate local app server. I need ports **4178** and **9228** to be free. I use the Chrome DevTools protocol through Node’s built-in WebSocket, so I do not need Playwright or browser downloads. I launch this temporary headless browser with `--no-sandbox` for container compatibility; I never use this test profile for normal browsing or real credentials.

I verify my empty onboarding, seven-fixture import, synthetic label, citation-only filtering, run inspector, malformed JSON feedback, successful staged imports, save confirmation, persistence after reload, empty search state, mobile menu expansion, contained mobile tables, and absence of uncaught JavaScript exceptions. I save screenshots under ignored `test-results/` for my visual review.

I run the suite against synthetic examples only. I do not send real provider requests or test an authenticated provider website.

## My release evidence

For this release I ran the core checks and the Chromium smoke flow. I inspected desktop and approximately 390px mobile screenshots, including onboarding, overview, runs, source filters, import feedback, run details, provider compatibility, privacy controls, dark theme, no-results, and expanded mobile navigation. I fixed missing icon glyphs and cramped mobile select controls during that review.

I also parsed the earlier project’s two saved conversation files locally. I reproduced **29 retrieved / 7 cited** for its ChatGPT file and **9 retrieved / 7 cited** for its Claude file. I do not redistribute those private raw files, and I do not claim those two runs benchmark provider quality.

## My manual release checklist

- I open the root URL through HTTP, not `file://`.
- I check desktop layout and a narrow mobile viewport, including an opened menu and an opened dialog.
- I navigate with Tab and Shift+Tab, open a dialog, close it with Escape, and check visible focus.
- I import a supported file and an invalid file in one batch; I confirm only successful files enter my preview.
- I confirm I have not saved anything before clicking **Save previewed runs**.
- I import the same provider/run ID twice and check replacement behavior.
- I verify an uncited retrieval remains separate from a citation-only source.
- I export a backup, reset my workspace, and reimport the backup.
- I export a filtered source CSV and inspect its rows and quoting.
- I test automatic, light, and dark themes.
- I check my GitHub Pages root deployment after publishing.
- I inspect my staged Git diff for private input files or secrets.

## What I have not certified

I have not certified WCAG conformance, performed a security penetration test, live-tested all provider API versions, exercised Safari/Firefox, verified Windows Chrome automation on a Windows machine, tested huge adversarial inputs, or provided multi-tab consistency. I describe these as release limits rather than hiding them behind passing fixture tests.
