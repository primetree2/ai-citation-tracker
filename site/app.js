// Dashboard logic. Runs live in localStorage only.
(function () {
  const KEY = 'citetracker.runs.v1';
  const ALLOWED_ORIGINS = ['https://chatgpt.com', 'https://claude.ai'];
  const $ = s => document.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pct = (a, b) => b ? Math.round((a / b) * 100) : 0;
  const fmtDate = iso => { try { return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }); } catch (e) { return iso; } };
  const PLAT = { chatgpt: 'ChatGPT', claude: 'Claude' };

  let runs = load();
  let selectedId = null, filter = 'all';

  function load() {
    try { const r = JSON.parse(localStorage.getItem(KEY)); if (Array.isArray(r) && r.length) return r; } catch (e) {}
    return (window.DEMO_RUNS || []).slice();
  }
  function save() { localStorage.setItem(KEY, JSON.stringify(runs)); }
  function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.remove('hidden'); clearTimeout(t._t); t._t = setTimeout(() => t.classList.add('hidden'), 3500); }

  function addRaw(raw, source) {
    const run = CiteParser.parseConversation(raw);
    run.source = source || 'upload';
    runs = runs.filter(r => !r.demo);                         // drop demo runs once real data comes in
    const i = runs.findIndex(r => r.id === run.id);
    if (i >= 0) runs[i] = run; else runs.unshift(run);        // re-import of the same chat overwrites it
    save(); render();
    return run;
  }

  // tabs
  function showTab(name) {
    document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
    document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.id === 'tab-' + name));
  }
  document.querySelectorAll('#tabs button').forEach(b => b.onclick = () => showTab(b.dataset.tab));
  document.addEventListener('click', e => { const g = e.target.closest('[data-goto]'); if (g) { e.preventDefault(); showTab(g.dataset.goto); } });

  // render
  function render() {
    $('#demo-banner').classList.toggle('hidden', !runs.some(r => r.demo));
    renderKpis(); renderPlatformBars(); renderDomainBars(); renderRunsTables(); renderDetail();
  }

  function renderKpis() {
    const ret = runs.reduce((a, r) => a + r.retrieved, 0), cit = runs.reduce((a, r) => a + r.cited, 0);
    const q = runs.reduce((a, r) => a + r.queries.length, 0);
    const yt = runs.flatMap(r => r.sources).filter(s => s.type === 'youtube');
    $('#kpis').innerHTML = [
      ['Runs', runs.length, `${new Set(runs.map(r => r.platform)).size} platform(s)`],
      ['Pages retrieved', ret, `${q} fan-out queries captured`],
      ['Pages cited', cit, `${pct(cit, ret)}% of retrieved`],
      ['YouTube cited', `${yt.filter(s => s.cited).length}/${yt.length}`, 'YouTube results cited / retrieved'],
    ].map(([k, v, h]) => `<div class="card"><div class="k">${k}</div><div class="v">${v}</div><div class="h">${h}</div></div>`).join('');
  }

  function bars(rows, max) {
    if (!rows.length) return '<div class="empty">No data yet</div>';
    return rows.map(r => `<div class="bar-row"><div class="lbl" title="${esc(r.label)}">${r.labelHtml || esc(r.label)}</div>
      <div class="bar"><div class="r" style="width:${pct(r.ret, max)}%"></div><div class="c" style="width:${pct(r.cit, max)}%"></div></div>
      <div class="num">${r.cit}/${r.ret}</div></div>`).join('');
  }
  function renderPlatformBars() {
    const by = {};
    for (const r of runs) { const p = by[r.platform] || (by[r.platform] = { ret: 0, cit: 0, n: 0 }); p.ret += r.retrieved; p.cit += r.cited; p.n++; }
    const rows = Object.entries(by).map(([p, v]) => ({ label: PLAT[p] || p, labelHtml: `<span class="tag ${p}">${PLAT[p] || p}</span> <span class="muted small">${pct(v.cit, v.ret)}%</span>`, ret: v.ret, cit: v.cit }));
    $('#platform-bars').innerHTML = bars(rows, Math.max(1, ...rows.map(r => r.ret)));
  }
  function renderDomainBars() {
    const by = {};
    for (const s of runs.flatMap(r => r.sources)) { const d = by[s.domain] || (by[s.domain] = { ret: 0, cit: 0 }); d.ret++; if (s.cited) d.cit++; }
    const rows = Object.entries(by).map(([d, v]) => ({ label: d, ...v })).sort((a, b) => b.cit - a.cit || b.ret - a.ret).slice(0, 10);
    $('#domain-bars').innerHTML = bars(rows, Math.max(1, ...rows.map(r => r.ret)));
  }

  function runsTable(list) {
    if (!list.length) return '<div class="empty">No runs yet. Add one on the Add data tab.</div>';
    return `<table class="tbl"><tr><th>Platform</th><th>Prompt</th><th>When</th><th>Queries</th><th>Retrieved</th><th>Cited</th><th>Cite rate</th></tr>` +
      list.map(r => `<tr class="click" data-run="${esc(r.id)}"><td><span class="tag ${r.platform}">${PLAT[r.platform]}</span>${r.demo ? ' <span class="tag demo">demo</span>' : ''}</td>
        <td>${esc(r.prompt.slice(0, 90))}${r.prompt.length > 90 ? '…' : ''}</td><td class="muted">${fmtDate(r.createdAt)}</td>
        <td>${r.queries.length}</td><td>${r.retrieved}</td><td>${r.cited}</td><td>${pct(r.cited, r.retrieved)}%</td></tr>`).join('') + '</table>';
  }
  function renderRunsTables() {
    $('#latest-runs').innerHTML = runsTable(runs.slice(0, 5));
    $('#runs-table').innerHTML = runsTable(runs);
    document.querySelectorAll('tr[data-run]').forEach(tr => tr.onclick = () => { selectedId = tr.dataset.run; filter = 'all'; showTab('runs'); renderDetail(); $('#run-detail').scrollIntoView({ behavior: 'smooth' }); });
  }

  function renderDetail() {
    const r = runs.find(x => x.id === selectedId);
    if (!r) { $('#run-detail').innerHTML = runs.length ? '<div class="panel empty">Click a run above to see its sources.</div>' : ''; return; }
    const list = r.sources.filter(s => filter === 'all' || (filter === 'cited' ? s.cited : !s.cited))
      .sort((a, b) => (b.cited - a.cited) || (a.domain || '').localeCompare(b.domain || ''));
    $('#run-detail').innerHTML = `<div class="panel">
      <div class="detail-head"><div><span class="tag ${r.platform}">${PLAT[r.platform]}</span> <span class="muted small">${esc(r.model)} · ${fmtDate(r.createdAt)}</span>
        <div class="prompt">${esc(r.prompt)}</div></div>
        <div class="actions"><button class="btn" id="dl-run">Download this run</button><button class="btn danger" id="del-run">Delete</button></div></div>
      <div class="cards" style="margin-top:12px">
        <div class="card"><div class="k">Retrieved</div><div class="v">${r.retrieved}</div></div>
        <div class="card"><div class="k">Cited</div><div class="v">${r.cited}</div><div class="h">${r.citeMarkers} citation markers in the answer</div></div>
        <div class="card"><div class="k">Cite rate</div><div class="v">${pct(r.cited, r.retrieved)}%</div></div>
        <div class="card"><div class="k">Fan-out queries</div><div class="v">${r.queries.length}</div></div></div>
      <h4>Fan-out queries</h4>
      ${r.queries.length ? `<div class="chips">${r.queries.map(q => `<span class="chip">🔎 ${esc(q)}</span>`).join('')}</div>`
        : `<p class="muted small">None in the saved conversation${r.platform === 'chatgpt' ? ' (ChatGPT only sends these in the live stream).' : '.'}</p>`}
      ${r.status.length ? `<p class="muted small">Status / reasoning text: ${r.status.map(esc).join(' · ')}</p>` : ''}
      <h4>Sources</h4>
      <div class="filters">${['all', 'cited', 'retrieved'].map(f => `<button data-f="${f}" class="${filter === f ? 'on' : ''}">${{ all: 'All', cited: 'Cited', retrieved: 'Retrieved only' }[f]}</button>`).join('')}</div>
      <table class="tbl"><tr><th>Status</th><th>Title</th><th>Domain</th><th>Type</th><th>Published</th></tr>
      ${list.map(s => `<tr class="${s.cited ? 'cited' : ''}"><td>${s.cited ? '<span class="tag cited">CITED</span>' : '<span class="tag ret">retrieved</span>'}</td>
        <td><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title || s.url)}</a>${s.snippet ? `<div class="muted small">${esc(s.snippet.slice(0, 160))}…</div>` : ''}</td>
        <td>${esc(s.domain)}</td><td>${s.type === 'youtube' ? '<span class="tag yt">YouTube</span>' : esc(s.type)}</td><td class="muted">${esc(s.date || '-')}</td></tr>`).join('')}
      </table></div>`;
    document.querySelectorAll('.filters button').forEach(b => b.onclick = () => { filter = b.dataset.f; renderDetail(); });
    $('#del-run').onclick = () => { runs = runs.filter(x => x.id !== r.id); selectedId = null; save(); render(); toast('Run deleted'); };
    $('#dl-run').onclick = () => download(`${r.platform}_${r.id.slice(0, 8)}.json`, JSON.stringify(r, null, 2), 'application/json');
  }

  // export
  function download(name, text, type) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click(); }
  $('#export-json').onclick = () => download('citation_runs.json', JSON.stringify(runs, null, 2), 'application/json');
  $('#export-csv').onclick = () => {
    const cols = ['platform', 'run_id', 'prompt', 'run_date', 'cited', 'type', 'domain', 'title', 'url', 'published'];
    const q = v => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
    const lines = [cols.join(',')];
    for (const r of runs) for (const s of r.sources) lines.push([r.platform, r.id, r.prompt, r.createdAt, s.cited, s.type, s.domain, s.title, s.url, s.date].map(q).join(','));
    download('citation_sources.csv', lines.join('\n'), 'text/csv');
  };
  $('#clear-all').onclick = () => { if (confirm('Delete all runs? (Demo data will come back.)')) { localStorage.removeItem(KEY); runs = load(); selectedId = null; render(); } };

  // upload / paste
  async function importFiles(files) {
    let ok = 0, bad = [];
    for (const f of files) {
      try {
        const data = JSON.parse(await f.text());
        const items = Array.isArray(data) ? data : [data];         // a file can hold one chat or a list
        for (const it of items) { addRaw(it.raw || it, 'upload'); ok++; }
      } catch (e) { bad.push(f.name); }
    }
    toast(`Imported ${ok} run(s)` + (bad.length ? ` · couldn't read: ${bad.join(', ')}` : ''));
    if (ok) { selectedId = runs[0].id; showTab('runs'); renderDetail(); }
  }
  const drop = $('#drop');
  $('#file-input').onchange = e => importFiles([...e.target.files]);
  ['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('over'); }));
  drop.addEventListener('drop', e => importFiles([...e.dataTransfer.files]));
  $('#paste-btn').onclick = () => {
    try { const run = addRaw(JSON.parse($('#paste').value), 'paste'); $('#paste').value = ''; toast(`Imported ${PLAT[run.platform]} run`); selectedId = run.id; showTab('runs'); renderDetail(); }
    catch (e) { toast('Could not import: ' + e.message); }
  };

  // bookmarklet
  function bookmarkletCode(dash) {
    return `(async()=>{const D=${JSON.stringify(dash)};const h=location.hostname;const w=window.open(D+'#receive','citetracker');let raw,p;
try{if(h.endsWith('chatgpt.com')){const id=(location.pathname.match(/\\/c\\/([\\w-]+)/)||[])[1];if(!id)throw'Open a chat first';
const s=await(await fetch('/api/auth/session')).json();const r=await fetch('/backend-api/conversation/'+id,{headers:{Authorization:'Bearer '+s.accessToken}});
if(!r.ok)throw'ChatGPT returned '+r.status;raw=await r.json();p='chatgpt'}
else if(h.endsWith('claude.ai')){const id=(location.pathname.match(/\\/chat\\/([\\w-]+)/)||[])[1];if(!id)throw'Open a chat first';
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
  $('#bookmarklet').href = 'javascript:' + encodeURIComponent(bookmarkletCode(dashUrl).replace(/\n/g, ''));
  $('#bookmarklet').onclick = e => { e.preventDefault(); toast('Drag this button to your bookmarks bar, don\'t click it here.'); };

  // bookmarklet hand-off
  window.addEventListener('message', e => {
    if (!ALLOWED_ORIGINS.includes(e.origin) || !e.data || e.data.type !== 'citetracker-conversation') return;
    try { e.source.postMessage({ type: 'citetracker-received' }, e.origin); } catch (err) {}
    if (window.__lastRaw === JSON.stringify(e.data.raw).length) return;   // bookmarklet resends until acked
    window.__lastRaw = JSON.stringify(e.data.raw).length;
    try { const run = addRaw(e.data.raw, 'bookmarklet'); selectedId = run.id; showTab('runs'); renderDetail(); toast(`Captured ${PLAT[run.platform]} chat: ${run.cited}/${run.retrieved} cited`); }
    catch (err) { toast('Could not read that chat: ' + err.message); }
  });
  if (location.hash === '#receive') history.replaceState(null, '', location.pathname);

  window.CiteApp = { addRaw };   
  render();
})();
