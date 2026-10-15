# My privacy and security boundary

## What I keep

I retain normalized run IDs, provider/model labels, response timestamps, titles, prompts, queries, canonical source URLs, evidence flags, evidence paths, reference IDs, warnings, and synthetic-fixture labels in this browser’s localStorage.

I do not save the complete raw uploaded JSON. My import preview temporarily holds parsed runs and error messages in memory until I finish or reopen the dialog. My browser may still retain downloaded or selected files outside this application.

## What I transmit

I make no provider API calls, upload no imported file, and include no analytics, remote fonts, tracking SDKs, or third-party JavaScript. I load static assets from the site’s host. My sample button fetches bundled synthetic examples from that same host.

I contact an external website only when I choose an external link. My hosting provider can still observe ordinary page requests, IP addresses, and access logs. I don’t claim that local parsing makes my whole browsing session anonymous.

## How I treat localStorage

I do not encrypt my runs. Other people using this browser profile, browser extensions with relevant access, or scripts served on the same origin may be able to read them. I avoid sensitive prompts on shared machines. I export backups and delete saved runs when appropriate.

I scope storage to `citetracker.workspace.v3`, `citetracker.theme.v3`, and the earlier `citetracker.runs.v1` migration key. GitHub Pages repositories under the same hostname share an origin. I do not assume repository paths create an isolation boundary.

## How I import safely

I only open files I am allowed to inspect. I remove tokens, cookies, Authorization headers, customer information, and unrelated account content before sharing response files. I do not paste secrets into this app or a public repository.

I reject non-HTTP(S) and credential-bearing source URLs. I escape imported titles and prompts before rendering them. I keep provider-generated links untrusted and decide whether to open them myself. I do not claim that a valid URL is safe or that a citation makes a source correct.

## How I clear and recover

I export my workspace JSON before choosing **Delete saved runs** in **Data & privacy**. I can import that nonempty v3 backup later. I cannot recover unexported browser data after clearing storage, changing profiles, or using a different device.

If my storage is corrupt, I do not overwrite it automatically. I can preserve the original storage value through my browser’s developer tools before an explicit reset. A normal session export cannot recover data that the application could not read.

## How I report a security issue

I avoid including private response files or credentials in public issues. I describe a minimal reproduction using synthetic data and use a private reporting channel when the repository owner provides one.
