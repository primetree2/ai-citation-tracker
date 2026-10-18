/* Dashboard side of the opt-in cross-window saved-chat connection. */
(function (root) {
  "use strict";
  const ALLOWED = new Set(["https://chatgpt.com", "https://claude.ai"]);
  function init(onSnapshot) {
    const match = location.hash.match(/^#watch=([a-f0-9]{32})$/);
    const panel = document.querySelector("#chat-connection");
    if (!panel) return;
    const $ = (id) => document.getElementById(id);
    let channel = match?.[1] || "",
      source = null,
      origin = "",
      state = channel ? "connecting" : "offline";
    let lastSeen = 0,
      lastRevision = 0,
      observedAt = "",
      stopped = false,
      provider = "",
      blocked = false;
    const controls = [
      "chat-sync-now",
      "chat-pause",
      "chat-stop",
      "chat-return",
    ];
    function draw(next, detail) {
      state = next;
      panel.classList.toggle("hidden", state === "offline");
      panel.dataset.state = state;
      $("connection-title").textContent = source
        ? `${provider === "chatgpt" ? "ChatGPT" : "Claude"} · saved-chat sync`
        : "Use this with your own AI chat";
      $("connection-state").textContent =
        {
          offline: "Not connected",
          connecting: "Connecting",
          waiting: "Waiting for your prompt",
          syncing: "Checking for updates",
          watching: "Watching this chat",
          paused: "Paused",
          backoff: "Rate limited · waiting",
          error: "Needs attention",
          stale: "Connection idle",
          stopped: "Disconnected",
        }[state] || "Connection update";
      $("connection-detail").textContent = detail;
      $("connection-updated").textContent = observedAt
        ? "Last saved snapshot checked: " +
          new Date(observedAt).toLocaleTimeString()
        : "";
      controls.forEach((id) =>
        $(id).classList.toggle("hidden", !source || stopped),
      );
      $("chat-pause").textContent = state === "paused" ? "Resume" : "Pause";
      $("chat-sync-now").disabled =
        state === "paused" ||
        state === "backoff" ||
        state === "syncing" ||
        blocked;
      $("chat-pause").disabled = blocked;
    }
    function command(command) {
      if (!source || stopped) return;
      try {
        source.postMessage(
          { type: "citetracker-watch-command", channel, command },
          origin,
        );
      } catch {
        draw(
          "error",
          "The AI tab is no longer reachable. Click the bookmark there to reconnect.",
        );
      }
    }
    function onMessage(e) {
      const m = e.data;
      if (
        !channel ||
        stopped ||
        !ALLOWED.has(e.origin) ||
        !m ||
        m.channel !== channel ||
        !e.source
      )
        return;
      if (!source) {
        if (m.type !== "citetracker-watch-hello" || e.source !== window.opener)
          return;
        source = e.source;
        origin = e.origin;
        provider = e.origin.includes("chatgpt") ? "chatgpt" : "claude";
      }
      if (e.source !== source || e.origin !== origin) return;
      lastSeen = Date.now();
      if (m.type === "citetracker-watch-hello") {
        source.postMessage(
          { type: "citetracker-watch-ready", channel },
          origin,
        );
        draw(
          "waiting",
          "Connected to this AI tab. Enable web search and send a prompt. Keep both tabs open; updates arrive as the chat is saved, about every 15 seconds.",
        );
      } else if (m.type === "citetracker-watch-status") {
        const states = [
          "waiting",
          "syncing",
          "watching",
          "paused",
          "backoff",
          "error",
          "stopped",
        ];
        if (!states.includes(m.state)) return;
        if (
          typeof m.observedAt === "string" &&
          Number.isFinite(Date.parse(m.observedAt))
        )
          observedAt = m.observedAt;
        if (m.state === "stopped") stopped = true;
        if (m.blocked === true) blocked = true;
        draw(m.state, String(m.detail || "").slice(0, 1000));
      } else if (m.type === "citetracker-watch-snapshot") {
        if (!Number.isSafeInteger(m.revision) || m.revision <= 0) return;
        try {
          if (m.revision > lastRevision) {
            if (
              !m.raw ||
              typeof m.raw !== "object" ||
              JSON.stringify(m.raw).length > 15 * 1024 * 1024
            )
              throw Error("Snapshot is empty or exceeds 15 MB.");
            onSnapshot(m.raw, provider, m.observedAt);
            lastRevision = m.revision;
            observedAt = Number.isFinite(Date.parse(m.observedAt))
              ? m.observedAt
              : new Date().toISOString();
          }
          source.postMessage(
            {
              type: "citetracker-watch-ack",
              channel,
              revision: m.revision,
              observedAt,
            },
            origin,
          );
          draw(
            "watching",
            "Snapshot synced. This reads available saved-chat evidence—not the answer's network stream. Missing queries or sources may appear after the response is saved.",
          );
        } catch (e) {
          source.postMessage(
            { type: "citetracker-watch-rejected", channel, error: e.message },
            origin,
          );
          draw("error", "Snapshot could not be saved: " + e.message);
        }
      }
    }
    $("chat-sync-now").onclick = () => command("sync");
    $("chat-pause").onclick = () =>
      command(state === "paused" ? "resume" : "pause");
    $("chat-stop").onclick = () => {
      command("stop");
      stopped = true;
      draw(
        "stopped",
        "Sync stopped. Previously synced analyses remain in My data. Click the bookmark in the AI tab to start a new connection.",
      );
    };
    $("chat-return").onclick = () => {
      try {
        source?.focus();
      } catch {}
    };
    window.addEventListener("message", onMessage);
    const heartbeat = setInterval(() => {
      if (
        !source ||
        stopped ||
        state === "paused" ||
        state === "backoff" ||
        state === "error"
      )
        return;
      if (source.closed || Date.now() - lastSeen > 45000)
        draw(
          "stale",
          "No recent updates. The AI tab may be closed, reloaded, or background-throttled. Open it and click the bookmark again if needed; the displayed analysis may be old.",
        );
    }, 5000);
    if (channel) {
      draw(
        "connecting",
        "Waiting for the AI tab. Keep it open. If no connection appears, allow pop-ups, reopen this tracker, and replace the bookmark with the current version.",
      );
      history.replaceState(null, "", location.pathname + location.search);
      setTimeout(() => {
        if (!source && !stopped)
          draw(
            "error",
            "No AI tab connected. Browser cross-window policies may have blocked the connection. Re-add the bookmark from this tracker and click it in ChatGPT or Claude. Saved-file import is available as a fallback.",
          );
      }, 20000);
    } else
      draw(
        "offline",
        "Add the Watch this chat bookmark, open ChatGPT or Claude, then click it there. You can connect before sending the first prompt—no JSON download needed.",
      );
    window.addEventListener(
      "pagehide",
      () => {
        command("stop");
        clearInterval(heartbeat);
        window.removeEventListener("message", onMessage);
      },
      { once: true },
    );
    return { getState: () => state };
  }
  root.CiteLiveSync = { init };
})(typeof globalThis !== "undefined" ? globalThis : this);
