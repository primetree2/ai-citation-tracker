(function () {
  "use strict";
  const KEY = "citetracker.runs.v1",
    P = CiteParser,
    PLAT = P.PROVIDERS;
  const $ = (s) => document.querySelector(s);
  const esc = (s) =>
    String(s ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
  const key = (r) => r.platform + ":" + r.id,
    label = (p) => (Object.hasOwn(PLAT, p) ? PLAT[p] : p);
  const rate = (r) => {
    const m = P.metrics(Array.isArray(r) ? r : [r]);
    return m.rate == null ? "—" : Math.round(m.rate * 100) + "%";
  };
  const fmtDate = (d) => {
    if (!d) return "Not available";
    const date = new Date(d);
    return Number.isFinite(date.getTime())
      ? date.toLocaleDateString(undefined, { dateStyle: "medium" })
      : String(d);
  };
  const tag = (p) =>
    `<span class="tag ${Object.hasOwn(PLAT, p) ? p : "custom"}">${esc(label(p))}</span>`;
  let storageWarning = "",
    selectedId = null,
    filter = "all",
    search = "",
    collection = "personal";
  function normalizeLegacy(r) {
    const n = P.parseOne(r);
    return {
      ...n,
      demo: r.demo === true,
      synthetic: r.synthetic === true,
      provenance:
        r.provenance ||
        "Supplied saved-chat artifact; timestamps and model labels are reported by the file.",
    };
  }
  function load() {
    try {
      const text = localStorage.getItem(KEY);
      if (text !== null) {
        const data = JSON.parse(text);
        if (!Array.isArray(data)) throw Error("Invalid storage");
        return data.map(normalizeLegacy);
      }
    } catch {
      storageWarning =
        "Saved storage could not be read. Export any available data before changing browser storage.";
    }
    return (window.DEMO_RUNS || []).map((r) => ({
      ...normalizeLegacy(r),
      demo: true,
      sample: true,
      analysisScope:
        "Saved conversation · included messages; sources and citations may span multiple answers. Prompt shown is the first user message.",
    }));
  }
  let runs = load();
  try {
    collection = localStorage.getItem(KEY + ".collection") || "personal";
  } catch {}
  if (!["samples", "personal"].includes(collection)) collection = "personal";
  const visibleRuns = () =>
    runs.filter((r) => (collection === "samples" ? r.sample : !r.sample));
  function setCollection(value) {
    collection = value;
    selectedId = null;
    filter = "all";
    search = "";
    try {
      localStorage.setItem(KEY + ".collection", value);
    } catch {}
    render();
  }
  document
    .querySelectorAll("[data-collection]")
    .forEach((b) => (b.onclick = () => setCollection(b.dataset.collection)));
  function evidenceBadge(r) {
    if (r.synthetic) return '<span class="tag demo">Synthetic fixture</span>';
    if (r.chatSync)
      return '<span class="tag sync">Chat sync · saved snapshot</span>';
    if (r.capture)
      return `<span class="tag ret">Network capture</span>${!r.capture.complete ? ' <span class="tag demo">Incomplete capture</span>' : ""}`;
    return `<span class="tag ret">${["chatgpt", "claude"].includes(r.platform) ? "Saved chat" : "Saved response"}</span>`;
  }
  function filteredSources(r) {
    const q = search.trim().toLowerCase();
    return r.sources.filter(
      (s) =>
        (filter === "all" ||
          (filter === "cited"
            ? s.cited
            : filter === "citation-only"
              ? s.cited && !s.retrieved
              : s.retrieved && !s.cited)) &&
        (!q ||
          [s.title, s.url, s.domain, s.snippet].some((v) =>
            String(v || "")
              .toLowerCase()
              .includes(q),
          )),
    );
  }
  function sourceRows(sources) {
    return sources
      .map(
        (s) =>
          `<tr><td><span class="tag ${s.cited ? "cited" : "ret"}">${s.cited ? (s.retrieved ? "Retrieved + cited" : "Cited; retrieval not visible") : "Retrieved only"}</span></td><td><a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.title)} ↗</a><div class="muted small">${esc(s.domain)}${s.type === "youtube" ? " · YouTube" : ""}${s.date ? " · " + esc(fmtDate(s.date)) : ""}</div>${s.snippet ? `<p class="small">${esc(s.snippet)}</p>` : ""}<details><summary>Source details <span class="muted">· full snapshot</span></summary><pre>${esc(JSON.stringify({ ...s.snapshot, observedUrls: s.observedUrls }, null, 2))}</pre><p class="muted small">Only fields present in the response are shown. No transcript is fetched.</p></details></td><td class="small">${s.evidence.length ? s.evidence.map(esc).join("<br>") : "Imported flags; no native field path"}</td></tr>`,
      )
      .join("");
  }
  function refreshSourceResults(r) {
    const sources = filteredSources(r);
    $("#source-rows").innerHTML = sourceRows(sources);
    $("#source-result-count").textContent =
      `${sources.length} of ${r.sources.length} sources shown`;
    $("#source-empty").classList.toggle("hidden", sources.length > 0);
    $("#export-visible").disabled = sources.length === 0;
  }
  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg;
    t.classList.remove("hidden");
    clearTimeout(t._t);
    t._t = setTimeout(() => t.classList.add("hidden"), 6500);
  }
  function commit(next) {
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      throw Error(
        "Browser storage is full or unavailable. Export a backup or free storage; no runs were saved.",
      );
    }
    runs = next;
    render();
  }
  function addRuns(items, source) {
    let next = [...runs];
    let last;
    for (const item of items) {
      const r = {
        ...item,
        source,
        sample:
          source === "sample" ||
          item.sample === true ||
          item.synthetic === true,
      };
      const i = next.findIndex(
        (x) => key(x) === key(r) && x.sample === r.sample,
      );
      if (i < 0) next.unshift(r);
      else next[i] = r;
      last = r;
    }
    const previous = collection;
    collection = last.sample ? "samples" : "personal";
    try {
      commit(next);
    } catch (e) {
      collection = previous;
      throw e;
    }
    try {
      localStorage.setItem(KEY + ".collection", collection);
    } catch {}
    return last;
  }
  function addRaw(raw, source) {
    return addRuns(P.parseInput(raw.raw || raw), source || "upload");
  }
  function showTab(name) {
    document.querySelectorAll("#tabs button").forEach((b) => {
      b.classList.toggle("active", b.dataset.tab === name);
      b.setAttribute("aria-current", b.dataset.tab === name ? "page" : "false");
    });
    document
      .querySelectorAll(".tab")
      .forEach((t) => t.classList.toggle("active", t.id === "tab-" + name));
  }
  document
    .querySelectorAll("#tabs button")
    .forEach((b) => (b.onclick = () => showTab(b.dataset.tab)));
  document.addEventListener("click", (e) => {
    const g = e.target.closest("[data-goto]");
    if (g) {
      e.preventDefault();
      showTab(g.dataset.goto);
    }
  });
  function render() {
    const active = visibleRuns();
    document.querySelectorAll("[data-collection]").forEach((b) => {
      b.setAttribute(
        "aria-pressed",
        String(b.dataset.collection === collection),
      );
    });
    $("#sample-count").textContent = `(${runs.filter((r) => r.sample).length})`;
    $("#personal-count").textContent =
      `(${runs.filter((r) => !r.sample).length})`;
    $("#demo-banner").classList.toggle(
      "hidden",
      collection !== "samples" || !active.length,
    );
    $("#export-csv").disabled =
      $("#export-json").disabled =
      $("#clear-all").disabled =
        !active.length;
    const m = P.metrics(active),
      q = active.reduce((a, r) => a + r.queries.length, 0);
    $("#kpis").innerHTML = [
      [
        "Analyses",
        m.runs,
        `${new Set(active.map((r) => r.platform)).size} provider format(s)`,
      ],
      [
        "Observed retrievals",
        m.retrieved,
        `${q} distinct queries within analyses; missing ≠ zero`,
      ],
      [
        "Cited sources",
        m.cited,
        `${m.citationOnly} citation-only URL/run pairs`,
      ],
      [
        "Retrieved sources cited (%)",
        rate(active),
        `${m.matched} retrieved + cited / ${m.retrieved} retrieved`,
      ],
    ]
      .map(
        ([k, v, h]) =>
          `<div class="card"><div class="k">${k}</div><div class="v">${v}</div><div class="h">${h}</div></div>`,
      )
      .join("");
    renderBars();
    renderTables();
    renderDetail();
  }
  function bars(rows) {
    const max = Math.max(1, ...rows.map((r) => r.ret));
    if (!rows.length)
      return '<div class="empty">No data yet. Connect your AI chat in How it works; synced sources will appear here.</div>';
    return rows
      .map(
        (r) =>
          `<div class="bar-row"><div class="lbl" title="${esc(r.label)}">${esc(r.label)}</div><div class="bar" aria-hidden="true"><div class="r" style="width:${(r.ret / max) * 100}%"></div><div class="c" style="width:${(r.matched / max) * 100}%"></div></div><div class="num" aria-label="${r.matched} matched of ${r.ret} retrieved">${r.matched}/${r.ret}</div></div>`,
      )
      .join("");
  }
  function renderBars() {
    const active = visibleRuns();
    const providers = [...new Set(active.map((r) => r.platform))];
    $("#platform-bars").innerHTML = bars(
      providers
        .map((p) => ({
          label: label(p),
          ...P.metrics(active.filter((r) => r.platform === p)),
        }))
        .map((r) => ({ ...r, ret: r.retrieved })),
    );
    const domains = new Map();
    for (const s of active.flatMap((r) => r.sources)) {
      const d = domains.get(s.domain) || {
        label: s.domain,
        ret: 0,
        matched: 0,
      };
      if (s.retrieved) d.ret++;
      if (s.retrieved && s.cited) d.matched++;
      domains.set(s.domain, d);
    }
    $("#domain-bars").innerHTML = bars(
      [...domains.values()]
        .sort((a, b) => b.matched - a.matched || b.ret - a.ret)
        .slice(0, 10),
    );
    const m = P.metrics(active),
      queries = active.filter((r) => r.queries.length).length;
    if (!active.length) {
      $("#insights").innerHTML =
        "<li>Connect a new or current AI chat in How it works. Source insights appear after the first saved snapshot syncs.</li>";
      return;
    }
    $("#insights").innerHTML = [
      `${m.uncited} observed retrievals have no citation evidence in these files.`,
      `${m.citationOnly} citations have no matching retrieval record; they are excluded from the rate numerator.`,
      `${queries} of ${active.length} analyses include observable search queries. Missing query data does not mean no searches occurred.`,
      "Each normalized URL counts once per analysis. These figures describe exported evidence, not provider quality.",
    ]
      .map((t) => `<li>${esc(t)}</li>`)
      .join("");
  }
  function table(list) {
    if (!list.length)
      return '<div class="empty">No analyses yet. Connect your chat in How it works, then send a web-search prompt. Synced chats appear here automatically. You can also import a file.</div>';
    return `<div class="table-scroll"><table class="tbl"><thead><tr><th>Provider / evidence</th><th>Prompt / conversation</th><th>Date</th><th>Queries</th><th>Retrieved</th><th>Cited</th><th>Retrieved cited (%)</th></tr></thead><tbody>${list.map((r) => `<tr><td>${tag(r.platform)} ${evidenceBadge(r)}</td><td><button class="run-link" data-run="${esc(key(r))}">${esc((r.prompt || r.title).slice(0, 110))}</button></td><td>${esc(fmtDate(r.createdAt))}</td><td>${r.queries.length || "—"}</td><td>${r.retrieved || "—"}</td><td>${r.cited}</td><td>${rate(r)}</td></tr>`).join("")}</tbody></table></div>`;
  }
  function renderTables() {
    $("#latest-runs").innerHTML = table(visibleRuns().slice(0, 5));
    $("#runs-table").innerHTML = table(visibleRuns());
    document.querySelectorAll("[data-run]").forEach(
      (b) =>
        (b.onclick = () => {
          selectedId = b.dataset.run;
          filter = "all";
          search = "";
          showTab("runs");
          renderDetail();
          $("#run-detail").scrollIntoView({
            behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
              ? "instant"
              : "smooth",
          });
        }),
    );
  }
  function renderDetail() {
    const r = visibleRuns().find((x) => key(x) === selectedId);
    if (!r) {
      $("#run-detail").innerHTML = visibleRuns().length
        ? '<div class="panel empty">Select an analysis above to inspect its queries and sources.</div>'
        : "";
      return;
    }
    const sources = filteredSources(r);
    $("#run-detail").innerHTML =
      `<div class="panel"><div class="detail-head"><div>${tag(r.platform)} ${evidenceBadge(r)} <span class="muted small">${esc(r.model || "Model unavailable")} · ${esc(fmtDate(r.createdAt))}</span><h3>${esc(r.title)}</h3><p>${esc(r.prompt || "Prompt not present in this response.")}</p></div><div class="actions"><button class="btn" id="dl-run">Download analysis</button><button class="btn danger" id="del-run">Delete analysis</button></div></div>
    <p class="muted small">${esc(r.provenance)}${r.capture ? ` · ${esc(r.capture.transport)} · ${r.capture.eventCount} events · ${r.capture.complete ? "transport finished" : "completion not confirmed"}` : ""}</p>
    <p class="scope-note"><b>Analysis scope:</b> ${esc(r.analysisScope)}<br><b>URL counting:</b> ${r.sources.length} normalized source URLs from ${new Set(r.sources.flatMap((s) => s.observedUrls || [s.url])).size} observed URL variants. Tracking parameters, fragments, and equivalent trailing slashes are removed for matching; original variants remain in source details and exports.</p>
    <div class="cards">${[
      ["Retrieved", r.retrieved],
      ["Cited", r.cited],
      ["Retrieved cited (%)", rate(r)],
      ["Observed queries", r.queries.length || "—"],
    ]
      .map(
        ([k, v]) =>
          `<div class="card"><div class="k">${k}</div><div class="v">${v}</div></div>`,
      )
      .join("")}</div>
    ${r.warnings.length ? `<details class="notice" open><summary>Evidence limits (${r.warnings.length})</summary><ul>${r.warnings.map((w) => `<li>${esc(w)}</li>`).join("")}</ul></details>` : ""}
    <h4>AI search queries <span class="muted small">(fan-out)</span></h4>${r.queries.length ? `<div class="chips">${r.queries.map((q) => `<span class="chip">${esc(q)}</span>`).join("")}</div>` : '<p class="muted">No query evidence in the supported fields. This is not a count of zero searches.</p>'}
    ${r.status.length ? `<details><summary>Provider-visible status / summaries</summary><ul>${r.status.map((s) => `<li>${esc(s)}</li>`).join("")}</ul><p class="muted">Public status labels, not hidden chain of thought.</p></details>` : ""}
    <h4>Sources</h4><div class="filters">${[
      ["all", "All"],
      ["cited", "Cited"],
      ["retrieved", "Retrieved only"],
      ["citation-only", "Cited; retrieval not visible"],
    ]
      .map(
        ([f, l]) =>
          `<button data-f="${f}" class="${filter === f ? "on" : ""}">${l}</button>`,
      )
      .join("")}</div>
    <div class="source-tools"><div class="source-search"><label for="source-search">Search sources</label><input type="search" id="source-search" placeholder="Title, domain, URL, or snippet" value="${esc(search)}" autocomplete="off"></div><button class="btn" id="export-visible">Export visible sources CSV</button></div>
    <p class="muted small" id="source-result-count" role="status" aria-live="polite">${sources.length} of ${r.sources.length} sources shown</p>
    <div class="table-scroll"><table class="tbl sources"><thead><tr><th>Status</th><th>Source and details</th><th>Evidence field</th></tr></thead><tbody id="source-rows">${sourceRows(sources)}</tbody></table></div><p id="source-empty" class="empty ${sources.length ? "hidden" : ""}">No sources match. Try another search or choose All.</p></div>`;
    $("#source-search").oninput = (e) => {
      search = e.target.value;
      refreshSourceResults(r);
    };
    $("#export-visible").disabled = !sources.length;
    $("#export-visible").onclick = () =>
      download(
        `${r.platform}-visible-sources.csv`,
        P.sourcesCsv([{ ...r, sources: filteredSources(r) }]),
        "text/csv;charset=utf-8",
      );
    document.querySelectorAll("[data-f]").forEach(
      (b) =>
        (b.onclick = () => {
          filter = b.dataset.f;
          renderDetail();
        }),
    );
    $("#dl-run").onclick = () =>
      download(
        `${r.platform}-run.json`,
        P.workspaceJson([r]),
        "application/json",
      );
    $("#del-run").onclick = () => {
      if (
        confirm(
          "Delete this locally saved analysis? Download a backup first if needed.",
        )
      )
        try {
          commit(
            runs.filter((x) => !(key(x) === key(r) && x.sample === r.sample)),
          );
          selectedId = null;
          renderDetail();
        } catch (e) {
          toast(e.message);
        }
    };
  }
  function download(name, text, type) {
    const a = document.createElement("a"),
      url = URL.createObjectURL(new Blob([text], { type }));
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  $("#export-json").onclick = () =>
    download(
      "citation-workspace.json",
      P.workspaceJson(visibleRuns()),
      "application/json",
    );
  $("#export-csv").onclick = () =>
    download(
      "citation-sources.csv",
      P.sourcesCsv(visibleRuns()),
      "text/csv;charset=utf-8",
    );
  $("#clear-all").onclick = () => {
    if (
      confirm(
        "Clear the selected collection? The other collection will be kept. Export a backup first; this cannot be undone.",
      )
    )
      try {
        commit(
          runs.filter((r) => (collection === "samples" ? !r.sample : r.sample)),
        );
        selectedId = null;
        renderDetail();
        toast(
          "Collection cleared. The other collection was kept. Samples can be loaded again from Add data.",
        );
      } catch (e) {
        toast(e.message);
      }
  };
  function importText(value, filename) {
    const parsed = P.parseText(value, filename, $("#provider-hint").value);
    const r = addRuns(parsed, "import");
    selectedId = key(r);
    showTab("runs");
    renderDetail();
    return parsed.length;
  }
  async function importFiles(files) {
    let ok = 0;
    const errors = [];
    for (const f of files) {
      try {
        if (f.size > 15 * 1024 * 1024) throw Error("File exceeds 15 MB");
        ok += importText(await f.text(), f.name);
      } catch (e) {
        errors.push(f.name + ": " + e.message);
      }
    }
    $("#import-feedback").textContent =
      `Imported ${ok} analysis(es). ${errors.join(" ")}`;
    toast($("#import-feedback").textContent);
  }
  const drop = $("#drop");
  drop.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      $("#file-input").click();
    }
  });
  $("#file-input").onchange = (e) => {
    importFiles([...e.target.files]);
    e.target.value = "";
  };
  ["dragenter", "dragover"].forEach((ev) =>
    drop.addEventListener(ev, (e) => {
      e.preventDefault();
      drop.classList.add("over");
    }),
  );
  ["dragleave", "drop"].forEach((ev) =>
    drop.addEventListener(ev, (e) => {
      e.preventDefault();
      drop.classList.remove("over");
    }),
  );
  drop.addEventListener("drop", (e) => importFiles([...e.dataTransfer.files]));
  $("#paste-btn").onclick = () => {
    try {
      const n = importText($("#paste").value, "");
      $("#paste").value = "";
      $("#import-feedback").textContent = `Imported ${n} analysis(es).`;
      toast($("#import-feedback").textContent);
    } catch (e) {
      $("#import-feedback").textContent = e.message;
      toast(e.message);
    }
  };
  async function loadSample(which) {
    try {
      let result;
      for (const p of which === "all" ? ["chatgpt", "claude"] : [which]) {
        const file = ["chatgpt", "claude"].includes(p)
          ? `${p}_raw.json`
          : `api/${p}.json`;
        const res = await fetch("../sample-data/" + file);
        if (!res.ok) throw Error("Sample could not be loaded");
        let parsed = P.parseInput(await res.json());
        if (!["chatgpt", "claude"].includes(p))
          parsed = parsed.map((r) => ({
            ...r,
            synthetic: true,
            provenance:
              "Synthetic API-format fixture, not a live provider capture.",
          }));
        result = addRuns(parsed, "sample");
      }
      selectedId = key(result);
      showTab("runs");
      renderDetail();
      toast("Sample parsed in this browser. No new provider request was made.");
    } catch (e) {
      toast(e.message + "; serve the site over HTTP or drop a bundled file.");
    }
  }
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-sample]");
    if (b) loadSample(b.dataset.sample);
  });
  $("#other-sample").onclick = () => loadSample($("#sample-provider").value);

  $("#copy-starter-prompt").onclick = async () => {
    const field = $("#starter-prompt");
    try {
      await navigator.clipboard.writeText(field.value);
      toast(
        "Prompt copied. Paste it into ChatGPT or Claude with web search enabled.",
      );
    } catch {
      field.focus();
      field.select();
      toast("Select and copy the prompt, then paste it into your AI chat.");
    }
  };
  function openFileGuide() {
    showTab("add");
    $("#file-guide").open = true;
    $("#file-guide").scrollIntoView({ block: "start" });
    $("#file-guide summary").focus({ preventScroll: true });
  }
  $("#show-file-guide").onclick = openFileGuide;
  $("#guide-provider").onchange = (e) => {
    const provider = e.target.value;
    $("#guide-name").textContent =
      provider === "chatgpt" ? "ChatGPT" : "Claude";
    $("#guide-filename").textContent = provider + "_raw.json";
    $("#guide-command").textContent = $("#capture-command").textContent =
      "node runner/capture.mjs --provider " + provider;
  };
  $("#open-capture-guide").onclick = () => {
    $("#capture-guide").open = true;
    $("#capture-guide").scrollIntoView({ block: "start" });
    $("#capture-guide summary").focus({ preventScroll: true });
  };
  document.querySelectorAll("[data-walkthrough]").forEach(
    (b) =>
      (b.onclick = async () => {
        b.disabled = true;
        try {
          const res = await fetch("../sample-data/chatgpt_raw.json");
          if (!res.ok)
            throw Error(
              "Example could not load. Serve this project over HTTP or use Add data.",
            );
          const parsed = P.parseInput(await res.json());
          if (b.dataset.walkthrough === "export") {
            download(
              "chatgpt-example-sources.csv",
              P.sourcesCsv(parsed),
              "text/csv;charset=utf-8",
            );
            toast("Example CSV downloaded. Your data was not changed.");
          } else {
            const r = addRuns(parsed, "sample");
            selectedId = key(r);
            search = "";
            filter = "all";
            showTab("runs");
            renderDetail();
            const target =
              b.dataset.walkthrough === "inspect"
                ? $("#source-search")
                : $("#run-detail");
            target.scrollIntoView({ block: "start" });
            if (target.focus) target.focus({ preventScroll: true });
            toast("ChatGPT saved-chat example loaded in Sample data.");
          }
        } catch (e) {
          toast(e.message);
        } finally {
          b.disabled = false;
        }
      }),
  );

  const dashUrl = location.origin + location.pathname;
  const watcherHref =
    "javascript:" + encodeURIComponent(CiteWatcher.bookmarkletCode(dashUrl));
  document.querySelectorAll("[data-watch-bookmark]").forEach((a) => {
    a.href = watcherHref;
    a.onclick = (e) => {
      e.preventDefault();
      toast(
        "Drag this button to your bookmarks bar. Then open ChatGPT or Claude and click the bookmark there—not here.",
      );
    };
  });
  const onSyncedSnapshot = (raw, provider, observedAt) => {
    const parsed = P.parseInput(raw);
    if (parsed.some((r) => r.platform !== provider))
      throw Error("The snapshot does not match the connected AI provider.");
    const prior = selectedId,
      oldCollection = collection,
      scroll = window.scrollY;
    const focused = document.activeElement?.id;
    const selection =
      focused === "source-search"
        ? [
            document.activeElement.selectionStart,
            document.activeElement.selectionEnd,
          ]
        : null;
    const expanded = [...document.querySelectorAll("#run-detail .sources tr")]
      .filter((row) => row.querySelector("details")?.open)
      .map((row) => row.querySelector("a")?.href);
    const synced = parsed.map((r) => ({
      ...r,
      chatSync: {
        mode: "saved-chat-poll",
        observedAt: observedAt || new Date().toISOString(),
      },
      provenance:
        "Automatic saved-chat sync from your connected AI tab. Not a live network-stream capture.",
    }));
    const r = addRuns(synced, "chat-sync");
    if (!prior) {
      selectedId = key(r);
      filter = "all";
      search = "";
      showTab("runs");
    } else if (oldCollection !== collection) selectedId = key(r);
    renderDetail();
    document.querySelectorAll("#run-detail .sources tr").forEach((row) => {
      if (expanded.includes(row.querySelector("a")?.href))
        row.querySelector("details").open = true;
    });
    if (focused && document.getElementById(focused)) {
      document.getElementById(focused).focus({ preventScroll: true });
      if (selection)
        document.getElementById(focused).setSelectionRange(...selection);
    }
    if (prior) window.scrollTo(0, scroll);
  };
  CiteLiveSync.init(onSyncedSnapshot);

  let lastReceipt = "";
  window.addEventListener("message", (e) => {
    if (
      !["https://chatgpt.com", "https://claude.ai"].includes(e.origin) ||
      !e.source ||
      e.source !== window.opener ||
      e.data?.type !== "citetracker-conversation"
    )
      return;
    try {
      const receipt = JSON.stringify(e.data.raw);
      if (receipt !== lastReceipt) {
        const r = addRaw(e.data.raw, "bookmarklet");
        selectedId = key(r);
        showTab("runs");
        renderDetail();
        lastReceipt = receipt;
        toast(
          "Imported once with the old bookmark. Replace it with Watch this chat in How it works for automatic updates.",
        );
      }
      e.source.postMessage({ type: "citetracker-received" }, e.origin);
    } catch (err) {
      toast(err.message);
    }
  });
  if (location.hash === "#receive")
    history.replaceState(null, "", location.pathname);
  window.CiteApp = { addRaw, showTab };
  render();
  if (storageWarning) toast(storageWarning);
})();
