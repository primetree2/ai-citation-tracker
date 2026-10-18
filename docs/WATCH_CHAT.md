# Watch your own AI chat

## Use the hosted GitHub Pages version

Open the published dashboard and follow How it works. No local server, Python, Node, or API key is needed for hosted use. Replace the bookmark from the hosted page after deployment: a bookmark created on localhost keeps its old local address. Browser storage is separate by origin. See DEPLOYMENT.md for copy/push and Pages settings.

## Start locally (Windows, macOS, Linux)

From the extracted repository root:

```sh
python runner/serve.py
```

The launcher binds explicitly to `127.0.0.1` and opens a usable browser address. Keep its terminal open. On Windows, you can double-click **start-local.bat** instead. If port 8000 is already in use, stop the old server or run `python runner/serve.py --port 8001`.

The original `python -m http.server 8000` method still works. Open `http://localhost:8000/` manually—not Python's `[::]` bind address. A local server does not upload chats to a backend; it serves the static dashboard files.

## Connect before sending the first prompt

1. Open **How it works** on the dashboard.
2. Show the desktop browser's bookmarks bar: **Ctrl+Shift+B**, or **⌘+Shift+B** on Mac. Drag **Watch this chat** onto it. Clicking the button on the dashboard only shows instructions.
3. Open a new ChatGPT or Claude chat. Use your own normal login. Click **Watch this chat** in the bookmarks bar while inside the AI tab.
4. Allow the bookmark to open its tracker tab. Look for the small **Citation Tracker · chat sync** panel in the AI tab and **Waiting for your prompt** in the tracker.
5. Enable the assistant's web-search feature and send a question. For example: `Search the web: best YouTube tutorials to learn n8n automation in 2026`.
6. Keep both tabs open. As the AI site saves the conversation, the tracker fetches its available saved evidence about every 15 seconds and updates **My data**. You do not need to download and re-upload JSON for each answer.
7. Send a follow-up to see the same conversation analysis update. The analysis is conversation-level, not guaranteed one-answer-only. Normal SPA chat navigation is followed in the same AI tab; full page reloads require clicking the bookmark again.

## What is and is not live

This is **automatic saved-chat synchronization**, not a raw network-stream recorder. It supports fresh conversations and ongoing use without manual exports. It cannot recover data the site does not persist. In particular, the supplied ChatGPT saved-chat artifact has no observable web-search fan-out queries. This update does not prove those queries can be recovered from a live stream.

A response still being generated may have missing/incomplete sources or citations until the site saves them. Polling can be delayed by background-tab throttling, provider saving behavior, account permissions, login expiry, rate limits, or private endpoint changes. Do not interpret an empty/partial snapshot as proof the AI searched nothing.

The separate advanced CDP recorder remains available for network-stream research. It is not automatically connected to this bookmark flow. Neither the recorder nor this watcher has been verified against an authenticated provider account in this release.

## Controls

- **Sync now:** check sooner, bounded to at most one read per five seconds. It cannot bypass an active rate-limit wait or a pause.
- **Pause / Resume:** stop/resume chat requests without deleting saved analyses.
- **Stop:** stop requests, clear timers/listeners, and remove the AI-tab panel. Existing dashboard data stays saved.
- **Return to AI chat:** focus the connected AI tab, if the browser allows it.
- **Save snapshot:** explicitly download the latest read conversation. If no snapshot has been read yet, the button attempts one read of the current chat even without a dashboard handshake. This is a manual fallback, not background polling. Use Add data to import the JSON.

## Troubleshooting

| Symptom | What to do |
|---|---|
| Bookmark click does nothing on the tracker | Drag it to the bookmarks bar, then click the bookmark while on ChatGPT or Claude. |
| No tracker tab opens | Allow pop-ups for the AI site and retry. |
| Tracker opens but never connects | Keep both tabs and the local server open. Re-add the bookmark from the current tracker address. Browser cross-window isolation can prevent messaging; use Save snapshot as a fallback. |
| New chat says waiting for a conversation ID | Send the first prompt in the AI tab. A new conversation may not have an ID until that point. |
| No sources after the answer | Confirm web search actually ran; wait for the saved snapshot, then Sync now. The private format may have changed, or the snapshot may omit retrieval fields. |
| Login expired / access denied | Automatic retries stop on 401/403. Log in normally, Stop, then reconnect. Do not bypass provider access controls. |
| Rate limited | Respect the displayed wait. Manual Sync now does not bypass Retry-After. |
| Repeated errors | The watcher pauses after three transient failures. Check the account and endpoint; Resume deliberately or use manual import. |
| Connection becomes idle after reload | Click the bookmark again in the AI tab. Reloading the tracker stops the previous connection. |
| Moved between localhost, 127.0.0.1, ports, or GitHub Pages | Re-add the bookmark from the new tracker address; it stores that address. These origins have separate localStorage. |

## Privacy and security boundaries

Only install bookmarklets from code you trust. A bookmarklet executes on the AI site with that tab's login; inspect `site/chat-watcher.js` before using it if needed.

- This is opt-in and visibly indicated in the AI tab. It follows the current tab only; switching conversations in that tab changes what is read. It does not crawl your sidebar or run new prompts.
- The ChatGPT session token stays inside the AI tab's function closure. It is not posted to the tracker, exported, logged, or stored by this code. Claude uses same-origin authenticated requests and a selected/first accessible organization.
- The selected conversation JSON is sent directly to the tracker tab with `postMessage`. The receiver requires the expected AI origin, expected opener, a random connection token, and the bound window. It rejects wrong-channel messages and validates the provider before importing.
- No third-party relay, analytics, backend upload, or browser extension is added. The tracker stores normalized evidence in its origin's localStorage; it does not retain the complete raw chat there. Browser-profile users and scripts on the same tracker origin can read that storage.
- Exported snapshots contain private chat content. Inspect/redact them before sharing. Connection tokens are not saved in normalized exports.
- The sites' terms, rate limits, and private schemas still apply. Do not bypass access denials or bot protections.

## Verification boundary

The automated cross-origin browser test intercepts all synthetic provider-page traffic and serves local fixtures. It verifies the new-chat handshake, saved-snapshot updates, follow-up replacement, focus preservation, pause/stop, wrong-channel rejection, and denial reporting. It is not a successful real ChatGPT/Claude account investigation. A real manual account smoke test remains required.
