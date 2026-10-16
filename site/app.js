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
  const fmtDate = (d) =>
    d
      ? new Date(d).toLocaleDateString(undefined, { dateStyle: "medium" })
      : "Not available";
  const tag = (p) =>
    `<span class="tag ${Object.hasOwn(PLAT, p) ? p : "custom"}">${esc(label(p))}</span>`;
  let storageWarning = "",
    selectedId = null,
    filter = "all";
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
    }));
  }
  let runs = load();
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
    let next = runs.filter((r) => !r.demo);
    for (const item of items) {
      const r = { ...item, source };
      const i = next.findIndex((x) => key(x) === key(r));
      if (i < 0) next.unshift(r);
      else next[i] = r;
    }
    commit(next);
    return items.at(-1);
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
    $("#demo-banner").classList.toggle("hidden", !runs.some((r) => r.demo));
    const m = P.metrics(runs),
      q = runs.reduce((a, r) => a + r.queries.length, 0);
    $("#kpis").innerHTML = [
      [
        "Runs",
        m.runs,
        `${new Set(runs.map((r) => r.platform)).size} provider format(s)`,
      ],
      [
        "Observed retrievals",
        m.retrieved,
        `${q} distinct queries within runs; missing ≠ zero`,
      ],
      [
        "Cited sources",
        m.cited,
        `${m.citationOnly} citation-only URL/run pairs`,
      ],
      [
        "Matched citation rate",
        rate(runs),
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
      return '<div class="empty">No data yet. Load the samples or add a response.</div>';
    return rows
      .map(
        (r) =>
          `<div class="bar-row"><div class="lbl" title="${esc(r.label)}">${esc(r.label)}</div><div class="bar" aria-hidden="true"><div class="r" style="width:${(r.ret / max) * 100}%"></div><div class="c" style="width:${(r.matched / max) * 100}%"></div></div><div class="num" aria-label="${r.matched} matched of ${r.ret} retrieved">${r.matched}/${r.ret}</div></div>`,
      )
      .join("");
  }
  function renderBars() {
    const providers = [...new Set(runs.map((r) => r.platform))];
    $("#platform-bars").innerHTML = bars(
      providers
        .map((p) => ({
          label: label(p),
          ...P.metrics(runs.filter((r) => r.platform === p)),
        }))
        .map((r) => ({ ...r, ret: r.retrieved })),
    );
    const domains = new Map();
    for (const s of runs.flatMap((r) => r.sources)) {
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
    const m = P.metrics(runs),
      queries = runs.filter((r) => r.queries.length).length;
    $("#insights").innerHTML = [
      `${m.uncited} observed retrievals have no citation evidence in these files.`,
      `${m.citationOnly} citations have no matching retrieval record; they are excluded from the rate numerator.`,
      `${queries} of ${runs.length} runs include observable search queries. Missing query data does not mean no searches occurred.`,
      "Each URL counts once per run. These figures describe exported evidence, not provider quality.",
    ]
      .map((t) => `<li>${esc(t)}</li>`)
      .join("");
  }
  function table(list) {
    if (!list.length)
      return '<div class="empty">No runs yet. Load a sample on Add data.</div>';
    return `<div class="table-scroll"><table class="tbl"><thead><tr><th>Provider</th><th>Prompt / response</th><th>Date</th><th>Queries</th><th>Retrieved</th><th>Cited</th><th>Matched rate</th></tr></thead><tbody>${list.map((r) => `<tr><td>${tag(r.platform)}${r.synthetic ? ' <span class="tag demo">synthetic</span>' : ""}</td><td><button class="run-link" data-run="${esc(key(r))}">${esc((r.prompt || r.title).slice(0, 110))}</button></td><td>${esc(fmtDate(r.createdAt))}</td><td>${r.queries.length || "—"}</td><td>${r.retrieved || "—"}</td><td>${r.cited}</td><td>${rate(r)}</td></tr>`).join("")}</tbody></table></div>`;
  }
  function renderTables() {
    $("#latest-runs").innerHTML = table(runs.slice(0, 5));
    $("#runs-table").innerHTML = table(runs);
    document.querySelectorAll("[data-run]").forEach(
      (b) =>
        (b.onclick = () => {
          selectedId = b.dataset.run;
          filter = "all";
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
    const r = runs.find((x) => key(x) === selectedId);
    if (!r) {
      $("#run-detail").innerHTML = runs.length
        ? '<div class="panel empty">Select a run above to inspect its queries and sources.</div>'
        : "";
      return;
    }
    const sources = r.sources.filter(
      (s) =>
        filter === "all" ||
        (filter === "cited"
          ? s.cited
          : filter === "citation-only"
            ? s.cited && !s.retrieved
            : s.retrieved && !s.cited),
    );
    $("#run-detail").innerHTML =
      `<div class="panel"><div class="detail-head"><div>${tag(r.platform)} <span class="muted small">${esc(r.model || "Model unavailable")} · ${esc(fmtDate(r.createdAt))}</span><h3>${esc(r.title)}</h3><p>${esc(r.prompt || "Prompt not present in this response.")}</p></div><div class="actions"><button class="btn" id="dl-run">Download run</button><button class="btn danger" id="del-run">Delete run</button></div></div>
    <p class="muted small">${esc(r.provenance)}${r.capture ? ` · ${esc(r.capture.transport)} · ${r.capture.eventCount} events · ${r.capture.complete ? "transport finished" : "completion not confirmed"}` : ""}</p>
    <div class="cards">${[
      ["Retrieved", r.retrieved],
      ["Cited", r.cited],
      ["Matched rate", rate(r)],
      ["Observed queries", r.queries.length || "—"],
    ]
      .map(
        ([k, v]) =>
          `<div class="card"><div class="k">${k}</div><div class="v">${v}</div></div>`,
      )
      .join("")}</div>
    ${r.warnings.length ? `<details class="notice" open><summary>Evidence limits (${r.warnings.length})</summary><ul>${r.warnings.map((w) => `<li>${esc(w)}</li>`).join("")}</ul></details>` : ""}
    <h4>Fan-out / search queries</h4>${r.queries.length ? `<div class="chips">${r.queries.map((q) => `<span class="chip">${esc(q)}</span>`).join("")}</div>` : '<p class="muted">No query evidence in the supported fields. This is not a count of zero searches.</p>'}
    ${r.status.length ? `<details><summary>Provider-visible status / summaries</summary><ul>${r.status.map((s) => `<li>${esc(s)}</li>`).join("")}</ul><p class="muted">Public status labels, not hidden chain of thought.</p></details>` : ""}
    <h4>Sources</h4><div class="filters">${[
      ["all", "All"],
      ["cited", "Cited"],
      ["retrieved", "Retrieved only"],
      ["citation-only", "Citation only"],
    ]
      .map(
        ([f, l]) =>
          `<button data-f="${f}" class="${filter === f ? "on" : ""}">${l}</button>`,
      )
      .join("")}</div>
    <div class="table-scroll"><table class="tbl sources"><thead><tr><th>Status</th><th>Source and snapshot</th><th>Evidence field</th></tr></thead><tbody>${sources.map((s) => `<tr><td><span class="tag ${s.cited ? "cited" : "ret"}">${s.cited ? (s.retrieved ? "Retrieved + cited" : "Citation only") : "Retrieved only"}</span></td><td><a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.title)} ↗</a><div class="muted small">${esc(s.domain)}${s.type === "youtube" ? " · YouTube" : ""}${s.date ? " · " + esc(s.date) : ""}</div>${s.snippet ? `<p class="small">${esc(s.snippet)}</p>` : ""}<details><summary>Full source snapshot</summary><pre>${esc(JSON.stringify(s.snapshot, null, 2))}</pre><p class="muted small">Only fields present in the response are shown. No transcript is fetched.</p></details></td><td class="small">${s.evidence.length ? s.evidence.map(esc).join("<br>") : "Imported flags; no native field path"}</td></tr>`).join("")}</tbody></table></div>${!sources.length ? '<p class="empty">No sources in this filter.</p>' : ""}</div>`;
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
          "Delete this locally saved run? Download a backup first if needed.",
        )
      )
        try {
          commit(runs.filter((x) => key(x) !== key(r)));
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
      P.workspaceJson(runs),
      "application/json",
    );
  $("#export-csv").onclick = () =>
    download(
      "citation-sources.csv",
      P.sourcesCsv(runs),
      "text/csv;charset=utf-8",
    );
  $("#clear-all").onclick = () => {
    if (
      confirm(
        "Clear all locally saved runs? This cannot be undone without an exported backup.",
      )
    )
      try {
        commit([]);
        selectedId = null;
        renderDetail();
        toast("Runs cleared. Samples can be loaded again from Add data.");
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
      `Imported ${ok} run(s). ${errors.join(" ")}`;
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
      $("#import-feedback").textContent = `Imported ${n} run(s).`;
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

  function bookmarkletCode(dash) {
    return `(async()=>{const D=${JSON.stringify(dash)};const h=location.hostname;const w=window.open(D+'#receive','citetracker');let raw,p;
try{if(h==='chatgpt.com'){const id=(location.pathname.match(/\\/c\\/([\\w-]+)/)||[])[1];if(!id)throw'Open a chat first';
const s=await(await fetch('/api/auth/session')).json();const r=await fetch('/backend-api/conversation/'+id,{headers:{Authorization:'Bearer '+s.accessToken}});
if(!r.ok)throw'ChatGPT returned '+r.status;raw=await r.json();p='chatgpt'}
else if(h==='claude.ai'){const id=(location.pathname.match(/\\/chat\\/([\\w-]+)/)||[])[1];if(!id)throw'Open a chat first';
const orgs=[];const c=(document.cookie.match(/lastActiveOrg=([^;]+)/)||[])[1];if(c)orgs.push(c);
try{(await(await fetch('/api/organizations')).json()).forEach(o=>orgs.push(o.uuid))}catch(e){}
for(const o of orgs){const r=await fetch('/api/organizations/'+o+'/chat_conversations/'+id+'?tree=True&rendering_mode=messages&render_all_tools=true');if(r.ok){raw=await r.json();break}}
if(!raw)throw'Could not load this Claude chat';p='claude'}else throw'Open a ChatGPT or Claude chat first'}
catch(e){alert('Citation Tracker: '+e);if(w)w.close();return}
const msg={type:'citetracker-conversation',platform:p,raw};let done=false;const O=new URL(D).origin;
const send=()=>{try{w.postMessage(msg,O)}catch(e){}};
window.addEventListener('message',e=>{if(e.origin===O&&e.data&&e.data.type==='citetracker-received'){done=true;clearInterval(t)}});
const t=setInterval(send,800);
setTimeout(()=>{clearInterval(t);if(!done){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(raw)],{type:'application/json'}));a.download=p+'_raw.json';a.click();
alert('Citation Tracker: could not hand the chat to the dashboard (popup blocked?). The chat was downloaded as '+p+'_raw.json, drop it on the Add data tab.')}},12000)})();`;
  }
  const dashUrl = location.origin + location.pathname;
  $("#bookmarklet").href =
    "javascript:" +
    encodeURIComponent(bookmarkletCode(dashUrl).replace(/\n/g, ""));
  $("#bookmarklet").onclick = (e) => {
    e.preventDefault();
    toast("Drag this button to your bookmarks bar, don't click it here.");
  };

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
        toast("Saved chat imported. This is not a live stream capture.");
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
