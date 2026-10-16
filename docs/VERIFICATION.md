# My release verification

I ran the following checks on this repository before packaging it:

- I passed **27 parser regression tests** with Node's built-in test runner.
- I reproduced the supplied saved-chat counts: **ChatGPT 29 retrieved / 7 cited**, **Claude 9 retrieved / 7 cited**.
- I passed browser checks for the original four tabs, original sample loading, inline source inspection, invalid imports, citation-only evidence, source filters, download actions, persistence after reload, empty-state persistence, and mobile page-width containment. I recorded eleven states and observed no uncaught browser exceptions.
- I visually reviewed desktop and mobile overviews, imports, source details, expanded snapshots, error/empty states, the format reference, and expanded advanced capture instructions. I corrected sticky-header overlap and made narrow-screen source details stack rather than squeeze into tiny columns.
- I exercised the local CDP recorder against a synthetic SSE server, then imported the saved bundle through the shared parser. I got **one retrieved/cited source and one query**, with transport completion recorded. I did not test a live provider account.
- I kept the original root redirect and static asset structure, and checked that the generated browser parser matches its source build.

I do not equate fixture tests, browser UI checks, or a local stream replay with authenticated provider compatibility. I keep the remaining recruiter-task gaps in `REQUIREMENTS.md`.
