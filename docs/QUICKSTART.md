# My one-minute reviewer path

## How I demonstrate the hosted project

1. I open the deployed site and choose **Quick start → Try 60-second demo**. I do not need a login, API key, or upload. I make sure the new version is deployed before sharing the link.
2. I follow the four guided steps. I see 12 observed retrievals and 8 cited sources in the synthetic dataset. I calculate 50% matched rate from 6 matched citations / 12 retrievals, not 8 / 12.
3. I choose **Open sample run** in step 2 to inspect a query, evidence paths, and expandable source snapshots. I close the inspector to continue.
4. I inspect two citation-only rows in step 3. I do not mistake missing retrieval records for a complete search log.
5. I choose **Export workspace** to download the demo JSON, or **Exit demo** to restore my saved workspace. I keep the demo in memory rather than overwriting browser data.

## How I test an import without preparing a file

I choose **Quick start → Preview example import**. I see one bundled synthetic OpenAI response in a preview. I have not saved anything yet. I choose **Save previewed runs**, open **Runs**, and inspect it. I can download that example from the import dialog if I prefer selecting a file.

## How I review the original evidence

I choose **Quick start → Preview original case evidence**, review the provenance notice, and save the two normalized source extracts. I see 29 retrieved / 7 cited for the earlier ChatGPT file and 9 retrieved / 7 cited for the earlier Claude file. I can inspect the saved Claude query, snippets when present, and citation flags.

I do not describe those files as a new live capture. I do not infer ChatGPT fan-out queries from image queries or UI labels. I review the gaps in [my task audit](TASK-AUDIT.md).

## How I use a response of my own

I choose **Import data**, select a supported saved JSON or JSONL response, review the preview, and save it. I use **Provider formats** to check the exact supported input shape. I do not upload screenshots, copied answers, HAR files, or raw SSE to this version. I keep credentials out of my files.

## How I run locally instead

I install Node.js 22+, open a terminal at the repository root, run `npm start`, and open http://localhost:4173. I do not need `npm install`. I use [my Windows upgrade guide](DEPLOYMENT.md) for GitHub Pages deployment.

## What I do if something looks wrong

- I check for the **Quick start** button. If it is absent on the hosted site, I check deployment and hard-refresh.
- I reset filters if no rows match.
- I use HTTP, not `file://`, if bundled examples do not load.
- I open a run’s warnings when queries, timestamps, or source metadata are unavailable.
- I export a backup before deleting saved data.
