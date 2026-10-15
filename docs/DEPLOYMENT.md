# My setup and upgrade guide

## How I run locally on Windows

I install Node.js 22 LTS, extract my ZIP, and open the extracted folder. I confirm I can see `package.json`, `index.html`, `src`, `public`, and `docs` together.

I open PowerShell there and run:

```powershell
node --version
npm start
```

I open http://localhost:4173. I stop the server with `Ctrl+C`. If port 4173 is busy, I choose another port:

```powershell
$env:PORT=4174
npm start
```

If I see a PowerShell execution-policy error for `npm.ps1`, I use `npm.cmd start`, `npm.cmd test`, and `npm.cmd run check`. I do not weaken my machine-wide execution policy just to run this project.

## How I replace my previous GitHub Pages version

1. I open my current live dashboard and export my workspace JSON. My old localStorage is tied to its origin, not to the ZIP on my disk.
2. I make a copy of my existing repository folder. I preserve the `.git` folder and my remote connection.
3. I copy the **contents** of the extracted v3 folder into the existing repository root. I approve replacing the old root `index.html` and README. I do not upload the outer ZIP folder as an extra nested directory.
4. I remove old app folders from the working tree after backing them up: `site/`, `runner/`, and `sample-data/`. I do not need them for v3. I can review this cleanup before committing.
5. I keep private exports out of Git. I store mine under `my-data/`, then inspect my changes:

```powershell
git status
npm run check
npm test
git add .
git diff --cached --stat
git diff --cached
```

6. I commit and push only after reviewing the diff:

```powershell
git commit -m "Upgrade to my v3 citation evidence workspace"
git push
```

7. I open **Settings → Pages** on GitHub. I choose **Deploy from a branch**, `main`, `/ (root)`, and save. If my primary branch has another name, I choose that branch instead.
8. I wait for GitHub Pages to finish publishing. I open https://primetree2.github.io/ai-citation-tracker/ and press `Ctrl+F5`.

I do not need Netlify. My root `index.html` is now the actual application, not a redirect to `/site/`. I send visitors to my root project URL, not the retired `/site/` path.

## How I check my deployment

- I confirm the browser title contains “Evidence workspace.”
- I load my sample workspace and confirm the banner explicitly says synthetic.
- I open my provider formats, import one JSON, inspect a run, and export a backup.
- I resize to a narrow screen and verify the navigation remains reachable.
- I verify my real data is not accidentally committed in my repository.

## How I handle common problems

**I still see my old design.** I check the deployed branch and root directory, then hard-refresh. I make sure I didn’t nest the extracted folder under another folder.

**I see my README instead of the application.** I confirm the deployed root contains this repository’s `index.html`.

**I see broken CSS or empty sample imports locally.** I use `npm start` and HTTP, not `file://`.

**I see LF/CRLF warnings in Git.** I keep my included `.gitattributes`; I treat those line-ending notices as normal unless Git reports a real failure.

**I do not see my old runs.** I check that I am on the same origin and browser profile as before. I can import my exported JSON. I cannot move another browser’s localStorage by copying a repository.

**I have a v1 JSON export.** I use the old site to inspect it first. My automatic migration reads the old `citetracker.runs.v1` browser key; my file importer expects a provider response or v3 schema, not every historic custom export shape. I can map a legacy export to v3 following my schema reference.

## How I roll back

I export my v3 workspace first. I restore my previous Git commit with my normal Git workflow, review the diff, and push. I keep my v3 backup because the earlier UI cannot necessarily understand my new provider formats. I do not delete or rewrite my Git history to roll back the deployed files.
