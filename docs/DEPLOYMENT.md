# Deploying to GitHub Pages

## Copy into an existing Git repository

Extract the release ZIP into a fresh folder. Copy the files and folders **inside `ai-citation-tracker-main`** into the existing Git-connected repository root. Replace the supplied project files, including the same-named `.github/workflows` files. Preserve `.git`, reviewed custom-domain configuration, and unrelated repository-specific settings.

Do not create a nested `ai-citation-tracker-main` directory inside the repository. Do not use `git init`, delete `.git`, change remotes, force-push, or use a mirroring copy command that deletes unrelated files.

Review `git status`, `git diff`, and the staged diff before committing/pushing. Hidden/dot files (`.github`, `.gitignore`, `.nojekyll`) are part of the deployment. Copying a ZIP does not remove old files or workflows: inspect any additional deployment workflows left in the existing repository and disable/remove obsolete ones deliberately if they conflict.

## Publishing mode

| Pages source in Settings → Pages | What happens on a push to main |
|---|---|
| Deploy from a branch → main → /(root) | GitHub's built-in branch deployment publishes the root. The supplied custom deploy job is skipped intentionally. |
| GitHub Actions | `pages.yml` checks/tests, builds `_site/`, uploads the public artifact, then deploys via the official Pages action. |
| Disabled, inaccessible, or unknown mode | The supplied workflow warns and skips custom deployment. Configure Pages, then push or manually run the deploy workflow again. |

The source-detection job only reads configuration. It does **not** change Pages settings or enable Pages on the user's behalf. The action is triggered on pushes to `main` or by a manual workflow run. Align the branch trigger if your actual publishing branch is different.

### Actions permissions

The detection job uses `pages: read`. The deploy job uses `contents: read`, `pages: write`, and `id-token: write`, plus the `github-pages` environment. Repository/organization policy can restrict these permissions; protected environments can require approval. Do not weaken security controls just to make a workflow green—ask the repository owner when needed.

## What is deployed

The root `index.html` redirects relatively to `site/`. Script, style, and sample URLs are relative so they work at a project URL such as `/ai-citation-tracker/`, not only a domain root.

`.nojekyll` is present for branch-root deployment. The generated browser parser is committed, so branch mode needs no Node build/install step.

For Actions mode, `npm run build:pages` prepares a clean `_site/` from an explicit list:

- Root `index.html` and `.nojekyll`.
- The seven required `site/` files (HTML, CSS, app, parser, samples, watcher, connection receiver).
- The reviewed bundled sample JSON/SSE fixtures.
- `CNAME`, if one already exists as a regular file.

It does not copy runner scripts, browser profiles, private captures, tests, test output, docs, `.env`, `.git`, or arbitrary extra repository files into the Pages artifact. `_site/` is a disposable, ignored build directory. Add a new public asset to the allowlist intentionally when introducing it later. The release check rejects a stale generated parser without modifying it.

**Branch mode is different:** it publishes from the configured repository folder. Keep private material out of Git in either mode. `.gitignore` does not remove previously tracked files, and artifact exclusion does not hide anything already committed to a public repository.

## Safe Windows copy example (optional)

The manual copy instructions in README are sufficient. If using PowerShell/robocopy, adjust paths to the actual Downloads/Desktop locations (Desktop may be under OneDrive):

```powershell
$source = "C:\Users\YOUR_NAME\Downloads\fresh-extraction\ai-citation-tracker-main"
$repo = "C:\Users\YOUR_NAME\Desktop\ai-citation-tracker"
if (!(Test-Path (Join-Path $source "site\index.html"))) { throw "Wrong source folder" }
if (!(Test-Path (Join-Path $repo ".git"))) { throw "Not the existing repository" }
robocopy $source $repo /E /XD .git node_modules _site browser-profile .capture-profile __pycache__ test-results out /XF *.pyc *.log
if ($LASTEXITCODE -ge 8) { throw "Copy failed; inspect the output" }
Set-Location $repo
git status
git diff --stat
# Review all changes and sensitive files before git add / commit / push.
```

No `/MIR` is used. Extra old files are intentionally not deleted automatically.

## After deployment

Open the URL shown in Settings → Pages. For the supplied repository references this is `https://primetree2.github.io/ai-citation-tracker/`. A renamed/transferred repository or custom domain can have a different address.

Hard-refresh, check the new How it works guide, and install a **new Watch this chat bookmark from the hosted address**. A localhost bookmark does not automatically change to GitHub Pages. Localhost, 127.0.0.1, and GitHub Pages have separate browser storage; use JSON backup/import to transfer data. Do not upload your browser's private JSON backup into the repository.

Validate one chat manually with an authorized account. Synthetic tests and successful deployment do not prove private provider endpoints or browser opener policies work for every user.

## Troubleshooting

| Issue | Check |
|---|---|
| Push did not publish | Confirm the correct repository/branch was pushed, Pages is enabled, and Source is configured. |
| Custom deploy job skipped | Expected in branch mode. Check the built-in Pages deployment; do not treat a skipped custom job as evidence of publishing. |
| `npm run check` failed | Read the specific error. If parser is stale, run `npm run build`, then commit `site/parser.js`. The release now defines the check script. |
| Root 404 | Ensure root `index.html` is in the configured publishing folder, not nested under another extracted folder. |
| Styles/scripts or samples 404 | Keep `site/` and `sample-data/` as siblings. In Actions mode inspect `_site/` and its allowlist. |
| Old content appears | Check the deployed commit and URL; hard-refresh. A green unit-test workflow alone is not deployment confirmation. |
| Actions permission/environment error | Check Pages source, organization policy, and required approvals with the repository owner. |
| Other workflow still fails | Copying overlays files; it does not remove old workflows. Inspect extra files under `.github/workflows` before removing obsolete ones. |
| Old bookmark opens localhost | Replace it with the bookmark generated on the hosted site. |
| Chat sync cannot connect | Allow pop-ups, keep the AI tab open, and follow WATCH_CHAT.md. Authentication, provider schemas, and browser isolation are separate from deployment. |


## Source Trail visual refresh

The visible product name is now **Source Trail · AI Citation Tracker**. The repository name, project path, four-tab workflow, and browser storage keys are unchanged. Copy the complete `site/` folder, including the new `mark.svg` logo/favicon. The Actions staging allowlist also includes that asset. Re-add **Watch this chat** from the deployed dashboard after replacing the files so its control panel uses the updated code and identity.
