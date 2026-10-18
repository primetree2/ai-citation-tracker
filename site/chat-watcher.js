/* Explicit, user-started saved-chat synchronization. No stream interception. */
(function (root) {
  "use strict";
  function installWatcher(dashboardUrl) {
    "use strict";
    const provider =
      location.hostname === "chatgpt.com"
        ? "chatgpt"
        : location.hostname === "claude.ai"
          ? "claude"
          : "";
    if (!provider) {
      alert(
        "Open ChatGPT or Claude, then click this bookmark. You can start on a new-chat page.",
      );
      return;
    }
    if (window.__citationTrackerWatcher) {
      window.__citationTrackerWatcher.focus();
      return;
    }
    const target = new URL(dashboardUrl);
    if (!/^https?:$/.test(target.protocol)) {
      alert(
        "Open Citation Tracker over HTTP or HTTPS, then add its bookmark again.",
      );
      return;
    }
    const channel = Array.from(
      crypto.getRandomValues(new Uint32Array(4)),
      (n) => n.toString(16).padStart(8, "0"),
    ).join("");
    target.hash = "watch=" + channel;
    const dashboard = window.open(target.href, "citation-watch-" + channel);
    if (!dashboard) {
      alert(
        "The tracker tab was blocked. Allow pop-ups for this AI site, then click the bookmark again.",
      );
      return;
    }
    const origin = target.origin;
    let active = true,
      ready = false,
      paused = false,
      busy = false,
      timer,
      helloTimer,
      timeoutTimer,
      controller;
    let lastRaw = null,
      lastRawChat = "",
      lastText = "",
      lastChat = "",
      failures = 0,
      org = "",
      authToken = "",
      authAt = 0;
    let revision = 0,
      outstanding = null,
      lastFetchAt = 0,
      nextAllowedAt = 0;
    const host = document.createElement("div");
    host.id = "citation-tracker-watcher";
    host.style.cssText =
      "position:fixed;bottom:20px;right:20px;z-index:2147483647;max-width:calc(100vw - 32px);width:330px";
    const shadow = host.attachShadow({ mode: "open" });
    // DOM construction avoids requiring a TrustedHTML policy on the AI site.
    function node(tag, parent, text, attributes = {}) {
      const element = document.createElement(tag);
      if (text) element.textContent = text;
      Object.entries(attributes).forEach(([name, value]) =>
        element.setAttribute(name, value),
      );
      parent.appendChild(element);
      return element;
    }
    node(
      "style",
      shadow,
      ":host{font:14px/1.5 system-ui,sans-serif;color:#1d2433}*{box-sizing:border-box}.box{padding:16px;border:1px solid #aeb8d0;border-radius:12px;background:#fff;box-shadow:0 4px 24px #0002}strong{font-size:16px}p{margin:8px 0}small{display:block;color:#586174;font-size:14px}button{font:inherit;min-height:44px;border:1px solid #b8c0cf;border-radius:6px;background:#fff;color:#1d2433;padding:8px 10px;cursor:pointer}button:focus-visible{outline:3px solid #3b5bdb;outline-offset:2px}.actions{display:flex;gap:6px;flex-wrap:wrap;margin-top:12px}button:disabled{opacity:.5;cursor:not-allowed}",
    );
    const box = node("div", shadow, "", { class: "box" });
    node("strong", box, "Citation Tracker · chat sync");
    node("p", box, "Connecting to your tracker…", {
      id: "status",
      role: "status",
      "aria-live": "polite",
    });
    node(
      "small",
      box,
      "Reads this tab's saved conversation about every 15 seconds. Not a live network stream.",
    );
    const buttons = node("div", box, "", { class: "actions" });
    [
      ["sync", "Sync now"],
      ["pause", "Pause"],
      ["stop", "Stop"],
      ["export", "Save snapshot"],
    ].forEach(([id, label]) => node("button", buttons, label, { id }));
    (document.body || document.documentElement).appendChild(host);
    const $ = (q) => shadow.querySelector(q);
    function send(message) {
      if (!active) return;
      try {
        dashboard.postMessage(
          { ...message, channel, platform: provider },
          origin,
        );
      } catch {
        status(
          "disconnected",
          "Browser blocked the tracker connection. Stop and reconnect, or save the latest snapshot.",
          false,
        );
      }
    }
    function status(state, detail, notify = true, extra = {}) {
      $("#status").textContent = detail;
      if (notify && ready)
        send({ type: "citetracker-watch-status", state, detail, ...extra });
    }
    function schedule(ms = 15000) {
      clearTimeout(timer);
      if (active && ready && !paused)
        timer = setTimeout(sync, Math.min(ms, 2147483647));
    }
    function stop(
      reason = "Chat sync stopped. Click the bookmark to reconnect.",
      notify = true,
    ) {
      if (!active) return;
      if (notify)
        send({
          type: "citetracker-watch-status",
          state: "stopped",
          detail: reason,
        });
      active = false;
      controller?.abort();
      clearTimeout(timer);
      clearInterval(helloTimer);
      clearTimeout(timeoutTimer);
      window.removeEventListener("message", onMessage);
      window.removeEventListener("pagehide", onHide);
      host.remove();
      delete window.__citationTrackerWatcher;
    }
    function setPaused(value, detail) {
      paused = value;
      clearTimeout(timer);
      if (paused) controller?.abort();
      $("#pause").textContent = paused ? "Resume" : "Pause";
      status(
        paused ? "paused" : "waiting",
        detail ||
          (paused
            ? "Paused. No chat requests will be made."
            : "Resuming chat sync…"),
      );
      if (!paused) sync();
    }
    async function getJson(path, options = {}) {
      const response = await fetch(path, {
        ...options,
        signal: controller.signal,
      });
      if (response.status === 401 || response.status === 403) {
        const e = Error(
          "Access denied or login expired. Log in normally, then reconnect. No retries will be made.",
        );
        e.denied = true;
        throw e;
      }
      if (response.status === 429) {
        const e = Error(
          "The AI site asked us to slow down. Pausing requests for at least 60 seconds.",
        );
        const retry = response.headers.get("retry-after");
        const milliseconds =
          retry && /^\d+(?:\.\d+)?$/.test(retry)
            ? Number(retry) * 1000
            : Date.parse(retry || "") - Date.now();
        e.backoff = Math.max(
          60000,
          Number.isFinite(milliseconds) ? milliseconds : 60000,
        );
        throw e;
      }
      if (!response.ok)
        throw Error(
          "The AI site returned HTTP " +
            response.status +
            ". It may still be saving the new conversation.",
        );
      return response.json();
    }
    async function readChat(id) {
      if (provider === "chatgpt") {
        if (!authToken || Date.now() - authAt > 300000) {
          const session = await getJson("/api/auth/session");
          if (!session.accessToken) {
            const e = Error("Log in to ChatGPT, then reconnect the tracker.");
            e.denied = true;
            throw e;
          }
          authToken = session.accessToken;
          authAt = Date.now();
        }
        return getJson("/backend-api/conversation/" + encodeURIComponent(id), {
          headers: { Authorization: "Bearer " + authToken },
        });
      }
      if (!org) {
        const cookie = document.cookie.match(/(?:^|;\s*)lastActiveOrg=([^;]+)/);
        if (cookie) {
          try {
            org = decodeURIComponent(cookie[1]);
          } catch {}
        }
        if (!org) {
          const organizations = await getJson("/api/organizations");
          org = organizations.find((o) => o.uuid)?.uuid || "";
        }
        if (!org)
          throw Error(
            "No accessible Claude organization was found. Open a chat in the correct organization and reconnect.",
          );
      }
      return getJson(
        "/api/organizations/" +
          encodeURIComponent(org) +
          "/chat_conversations/" +
          encodeURIComponent(id) +
          "?tree=True&rendering_mode=messages&render_all_tools=true",
      );
    }
    async function sync(downloadOnly = false) {
      const fileOnly = downloadOnly === true;
      if (!active || (!ready && !fileOnly) || paused || busy) return;
      if (!fileOnly && dashboard.closed) {
        stop("Tracker tab closed.", false);
        return;
      }
      // Bound manual requests as well as polling. No rapid retry loop.
      if (Date.now() < nextAllowedAt) {
        schedule(nextAllowedAt - Date.now());
        return;
      }
      if (Date.now() - lastFetchAt < 5000) {
        schedule(5000 - (Date.now() - lastFetchAt));
        return;
      }
      if (outstanding && !fileOnly) {
        if (Date.now() - outstanding.at > 20000) {
          paused = true;
          $("#pause").textContent = "Resume";
          status(
            "error",
            "Tracker did not acknowledge the snapshot. Check its error message, then Resume or save the snapshot.",
            false,
          );
          return;
        }
        send(outstanding.message);
        schedule(5000);
        return;
      }
      const match = location.pathname.match(
        provider === "chatgpt" ? /\/c\/([\w-]+)/ : /\/chat\/([\w-]+)/,
      );
      if (!match) {
        status(
          "waiting",
          "Send a web-search prompt in this new chat; waiting for its conversation ID.",
        );
        schedule(5000);
        return;
      }
      const id = match[1];
      busy = true;
      controller = new AbortController();
      lastFetchAt = Date.now();
      const fetchTimeout = setTimeout(() => controller?.abort(), 12000);
      try {
        status("syncing", "Checking this chat for newly saved sources…");
        const raw = await readChat(id);
        if (!active || paused) return;
        const current = location.pathname.match(
          provider === "chatgpt" ? /\/c\/([\w-]+)/ : /\/chat\/([\w-]+)/,
        );
        if (current?.[1] !== id) {
          status(
            "waiting",
            "Chat changed while syncing. Waiting for the new conversation.",
          );
          return;
        }
        const text = JSON.stringify(raw);
        if (text.length > 15 * 1024 * 1024) {
          setPaused(
            true,
            "This chat exceeds the 15 MB limit. Start a smaller chat or use a local capture.",
          );
          return;
        }
        failures = 0;
        lastRaw = raw;
        lastRawChat = id;
        $("#export").disabled = false;
        if (fileOnly) {
          downloadSnapshot();
          status(
            ready ? "watching" : "waiting",
            "Snapshot downloaded. Import it on Add data if automatic chat sync is unavailable.",
          );
        } else if (id !== lastChat || text !== lastText) {
          lastChat = id;
          lastText = text;
          revision++;
          const message = {
            type: "citetracker-watch-snapshot",
            raw,
            revision,
            observedAt: new Date().toISOString(),
          };
          outstanding = { at: Date.now(), message };
          send(message);
          status(
            "syncing",
            "Snapshot sent. Waiting for tracker confirmation…",
            false,
          );
        } else
          status(
            "watching",
            "Up to date. Send a follow-up; new saved evidence will sync automatically.",
            true,
            { observedAt: new Date().toISOString() },
          );
      } catch (e) {
        if (!active || paused) return;
        if (e.denied) {
          paused = true;
          authToken = "";
          $("#pause").disabled = true;
          $("#sync").disabled = true;
          if (!lastRaw) $("#export").disabled = true;
          status("error", e.message, true, { blocked: true });
          return;
        }
        if (e.backoff) {
          nextAllowedAt = Date.now() + e.backoff;
          status("backoff", e.message);
          schedule(e.backoff);
          return;
        }
        failures++;
        const message =
          e.name === "AbortError" ? "The chat request timed out." : e.message;
        if (failures >= 3) {
          setPaused(
            true,
            message +
              " Paused after three failures. Use Save snapshot if available, or reconnect after checking login.",
          );
          return;
        }
        status("error", message + " Trying again in 30 seconds.");
        schedule(30000);
        return;
      } finally {
        clearTimeout(fetchTimeout);
        busy = false;
      }
      schedule();
    }
    function onMessage(e) {
      if (
        !active ||
        e.origin !== origin ||
        e.source !== dashboard ||
        e.data?.channel !== channel
      )
        return;
      const m = e.data;
      if (m.type === "citetracker-watch-ready") {
        if (ready) return;
        ready = true;
        clearInterval(helloTimer);
        clearTimeout(timeoutTimer);
        status(
          "waiting",
          "Connected. Open a new chat or use the current one, enable web search, and send your prompt.",
        );
        sync();
      }
      if (
        m.type === "citetracker-watch-ack" &&
        m.revision === outstanding?.message.revision
      ) {
        outstanding = null;
        status(
          paused ? "paused" : "watching",
          paused
            ? "Paused. Snapshot was saved; no more chat requests will be made."
            : "Synced to Citation Tracker. Updates appear as the conversation is saved.",
          true,
          { observedAt: m.observedAt },
        );
      }
      if (m.type === "citetracker-watch-rejected") {
        outstanding = null;
        lastText = "";
        setPaused(
          true,
          "Tracker could not import this snapshot: " +
            String(m.error || "Unknown format"),
        );
      }
      if (m.type === "citetracker-watch-command") {
        if (m.command === "stop") stop();
        else if (m.command === "sync") sync();
        else if (m.command === "pause") setPaused(true);
        else if (m.command === "resume") setPaused(false);
      }
    }
    function onHide() {
      stop(
        "AI tab navigated or reloaded. Click the bookmark again to reconnect.",
      );
    }
    $("#sync").onclick = () => sync();
    $("#pause").onclick = () => setPaused(!paused);
    $("#stop").onclick = () => stop();
    function downloadSnapshot() {
      if (!lastRaw) return;
      const a = document.createElement("a"),
        url = URL.createObjectURL(
          new Blob([JSON.stringify(lastRaw, null, 2)], {
            type: "application/json",
          }),
        );
      a.href = url;
      a.download = provider + "_raw.json";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
    $("#export").onclick = () => {
      const id = location.pathname.match(
        provider === "chatgpt" ? /\/c\/([\w-]+)/ : /\/chat\/([\w-]+)/,
      )?.[1];
      if (lastRaw && id === lastRawChat) downloadSnapshot();
      else if (paused)
        status(
          "paused",
          "No snapshot has been read yet. Resume after checking the error, or Stop and reconnect after logging in.",
        );
      else sync(true);
    };
    window.addEventListener("message", onMessage);
    window.addEventListener("pagehide", onHide);
    window.__citationTrackerWatcher = {
      stop,
      sync,
      focus() {
        host.scrollIntoView({ block: "nearest" });
        $("#status").textContent =
          "Watcher is already active in this tab. Use Sync now, Resume, or Stop below.";
      },
    };
    const hello = () => send({ type: "citetracker-watch-hello" });
    hello();
    helloTimer = setInterval(hello, 1000);
    timeoutTimer = setTimeout(() => {
      if (ready || !active) return;
      $("#status").textContent =
        "Could not connect. Keep the local server running and allow pop-ups. Browser cross-window policies may block this workflow. Stop, reopen the tracker, and add the bookmark again.";
      clearInterval(helloTimer);
    }, 20000);
  }
  const api = {
    installWatcher,
    bookmarkletCode(dashboardUrl) {
      return (
        "(" +
        installWatcher.toString() +
        ")(" +
        JSON.stringify(dashboardUrl) +
        ");void 0;"
      );
    },
  };
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.CiteWatcher = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
