import { PROVIDERS, metrics } from '../core/model.js';
import { parseText } from '../core/adapters.js';
import { loadWorkspace, saveWorkspace, mergeRuns } from '../core/storage.js';
import { workspaceJson, sourcesCsv } from '../core/export.js';
const $ = s => document.querySelector(s);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const rate = v => v == null ? '—' : `${Math.round(v * 100)}%`;
const date = v => v ? new Date(v).toLocaleDateString(undefined, { year:'numeric', month:'short', day:'numeric' }) : 'Date is unavailable';
const providerName = p => PROVIDERS[p] || p;
const badge = p => `<span class="provider"><span class="provider-icon" aria-hidden="true">${esc(({chatgpt:'CG',claude:'CL',openai:'OA',anthropic:'AN',gemini:'GE',perplexity:'PX',grok:'GX'})[p] || p.slice(0,2).toUpperCase())}</span>${esc(providerName(p))}</span>`;
const state = { runs:[], page:'overview', search:'', provider:'', period:'', status:'', sort:'title', pagination:1, staged:[], importMessages:[], storageLocked:false, theme:'auto', demo:false, savedRuns:[], guideStep:0 };
const pages = {
  overview:['Overview','Evidence, in focus.','Track the gap between sources retrieved and sources cited.'],
  runs:['Runs','Research runs','Inspect saved responses, search queries, and source evidence.'],
  sources:['Source library','Source library.','Review one normalized URL per run, with its observed evidence.'],
  providers:['Provider formats','Provider compatibility','Import saved responses. Live provider-account access is not included.'],
  settings:['Data & privacy','Data & privacy','Manage local storage, backups, and privacy settings.']
};
let toastTimer;
function toast(message) { $('#toast').textContent = message; $('#toast').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => $('#toast').hidden = true, 5500); }
function persist(next) {
  if (state.demo) {toast('Demo changes are not saved. Exit demo to edit your workspace.');return false;}
  if (state.storageLocked) { toast('Saved data could not be read. Preserve the original storage value before resetting it in Data & privacy.'); return false; }
  try { saveWorkspace(localStorage, next); state.runs = next; return true; }
  catch { toast('Could not save locally. The existing workspace is unchanged. Export a backup before retrying.'); return false; }
}
function download(name, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function visibleRuns() {
  const cutoff = state.period ? Date.now() - Number(state.period) * 86400000 : null;
  return state.runs.filter(r => (!state.provider || r.platform === state.provider) &&
    (!cutoff || (r.createdAt && Date.parse(r.createdAt) >= cutoff)) &&
    (!state.search || [r.title,r.prompt,r.model,...r.sources.flatMap(s => [s.title,s.url])].join(' ').toLowerCase().includes(state.search.toLowerCase())));
}
function setPage(page) {
  state.page = page; state.pagination = 1; history.replaceState(null,'','#'+page); $('#workspace-nav').classList.remove('mobile-open'); $('#mobile-menu').setAttribute('aria-expanded','false'); render();
  $('#main').focus({ preventScroll:true });
}
function section(title, description, inner, action = '', note = '') {
  return `<section class="panel"><div class="section-head"><div><h2>${title}</h2>${description ? `<p>${description}</p>` : ''}</div>${action}</div>${inner}${note ? `<div class="panel-note">${note}</div>` : ''}</section>`;
}
function noMatches() { return `<div class="empty"><h2>No matching evidence.</h2><p>Reset filters or import another saved response.</p><button class="secondary" data-action="reset">Reset filters</button></div>`; }
function overview(runs) {
  const m = metrics(runs);
  const stats = `<div class="stats" aria-label="Filtered workspace metrics">${[
    ['Observed retrievals',m.retrieved,`${m.runs} saved runs · URL/run pairs`],
    ['Cited sources',m.cited,`${m.citationOnly} citation-only sources`],
    ['Matched citation rate',rate(m.rate),'Cited retrievals ÷ observed retrievals'],
    ['Uncited retrievals',m.uncited,'Observed, without citation evidence']
  ].map(([label,value,foot]) => `<div class="stat"><span class="stat-label">${label}</span><div class="stat-value">${value}</div><div class="stat-foot">${foot}</div></div>`).join('')}</div>`;
  if (!runs.length) return stats + noMatches();
  const groups = [...new Set(runs.map(r => r.platform))].map(p => ({ p, m:metrics(runs.filter(r => r.platform === p)) }));
  const compare = `<div class="table-wrap" tabindex="0" role="region" aria-label="Horizontally scrollable evidence table"><table><caption class="sr-only">Provider evidence within current filters</caption><thead><tr><th scope="col">Provider</th><th scope="col" class="num">Runs</th><th scope="col" class="num">Retrieved</th><th scope="col" class="num">Cited</th><th scope="col" class="num">Matched rate</th></tr></thead><tbody>${groups.map(({p,m}) => `<tr><td>${badge(p)}</td><td class="num">${m.runs}</td><td class="num">${m.retrieved}</td><td class="num">${m.cited}</td><td class="num">${rate(m.rate)}</td></tr>`).join('')}</tbody></table></div>`;
  const domains = new Map();
  for (const r of runs) for (const s of r.sources) {
    const item = domains.get(s.domain) || {domain:s.domain,observed:0,cited:0};
    item.observed++; item.cited += Number(s.cited); domains.set(s.domain,item);
  }
  const top = [...domains.values()].sort((a,b) => b.cited - a.cited || b.observed - a.observed).slice(0,5);
  const domainsTable = `<div class="table-wrap" tabindex="0" role="region" aria-label="Horizontally scrollable evidence table"><table><caption class="sr-only">Domains ranked by cited source/run pairs</caption><thead><tr><th>Domain</th><th class="num">Observed</th><th class="num">Cited</th></tr></thead><tbody>${top.map(d => `<tr><td>${esc(d.domain)}</td><td class="num">${d.observed}</td><td class="num">${d.cited}</td></tr>`).join('')}</tbody></table></div>`;
  const cautions = `<div class="note-list"><div class="note-item"><span class="tag info">DENOMINATOR</span><p>Each URL is counted once per run. The same URL in two runs counts twice.</p></div><div class="note-item"><span class="tag warn">COVERAGE LIMIT</span><p>Citation-only responses are not complete retrieval logs. A dash indicates an unavailable denominator.</p></div><div class="note-item"><span class="tag">COMPARISON LIMIT</span><p>These figures compare exported evidence, not provider quality. Formats expose different amounts of information.</p></div></div>`;
  return stats + section('Provider evidence','Only runs matching the current filters are included.',compare,'','Matched rate uses sources with both retrieval and citation evidence—not all citations divided by retrievals.') +
    `<div class="split">${section('Most-cited domains','Domains ranked by cited URL/run pairs.',domainsTable)}${section('Reading the evidence','Coverage limits stay visible alongside the metrics.',cautions)}</div>` + section('Recent runs','Open a run to inspect its underlying evidence.',runTable(runs.slice().reverse().slice(0,5)), '<button class="quiet" data-page="runs">View all runs →</button>');
}
function runTable(runs) {
  return `<div class="table-wrap" tabindex="0" role="region" aria-label="Horizontally scrollable evidence table"><table><caption class="sr-only">Saved response runs</caption><thead><tr><th>Prompt / response</th><th>Provider</th><th class="num">Retrieved</th><th class="num">Cited</th><th>Evidence</th></tr></thead><tbody>${runs.map(r => {
    const m = metrics([r]);
    return `<tr><td><button class="run-title" data-run="${esc(r.platform + ':' + r.id)}">${esc(r.title)}</button><span class="subline">${esc(date(r.createdAt))}${r.synthetic ? ' · Synthetic fixture' : ''}</span></td><td>${badge(r.platform)}<span class="subline">${esc(r.model || 'Model is unavailable')}</span></td><td class="num">${m.retrieved}</td><td class="num">${m.cited}</td><td><span class="tag ${m.retrieved ? 'good' : 'warn'}">${m.retrieved ? 'Retrievals observed' : 'Retrievals unavailable'}</span></td></tr>`;
  }).join('')}</tbody></table></div>`;
}
function pager(total) {
  const last = Math.max(1,Math.ceil(total/25)); state.pagination = Math.min(state.pagination,last);
  return `<div class="pagination"><span>Page ${state.pagination} of ${last} · ${total} rows</span><div><button data-page-step="-1" ${state.pagination === 1 ? 'disabled' : ''}>← Previous page</button> <button data-page-step="1" ${state.pagination === last ? 'disabled' : ''}>Next page →</button></div></div>`;
}
function runsPage(runs) {
  if (!runs.length) return noMatches();
  const pagination = pager(runs.length);
  return section('Run history','Normalized evidence is stored locally; complete raw conversations are not retained.',runTable(runs.slice().reverse().slice((state.pagination-1)*25,state.pagination*25))+pagination);
}
function sourceRows(rows, detailed = false) {
  return `<div class="table-wrap" tabindex="0" role="region" aria-label="Horizontally scrollable evidence table"><table><caption class="sr-only">Source evidence, one URL per run</caption><thead><tr><th>Source</th>${detailed ? '<th>Evidence path</th>' : '<th>Provider</th>'}<th>Observed status</th></tr></thead><tbody>${rows.map(({s,r}) => `<tr><td><a class="source-title" href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.title)} ↗</a><span class="source-url">${esc(s.url)}</span>${s.snapshot?.snippet?`<span class="snapshot-snippet">${esc(s.snapshot.snippet)}</span>`:""}${detailed?`<details class="snapshot-details"><summary>Source snapshot</summary><pre>${esc(Object.keys(s.snapshot||{}).length?JSON.stringify(s.snapshot,null,2):"No snapshot metadata is available in this response.")}</pre></details>`:""}</td><td>${detailed ? `<span class="evidence">${esc(s.evidence.join(' · '))}</span>` : badge(r.platform)}</td><td>${s.cited && s.retrieved ? '<span class="tag good">Retrieved + cited</span>' : s.cited ? '<span class="tag info">Citation only</span>' : s.retrieved ? '<span class="tag warn">Retrieval only</span>' : '<span class="tag">Evidence unspecified</span>'}</td></tr>`).join('')}</tbody></table></div>`;
}
function sourcesPage(runs) {
  let rows = runs.flatMap(r => r.sources.map(s => ({s,r})));
  if (state.search) rows = rows.filter(({s,r}) => [s.url,s.title,r.title,r.prompt].join(' ').toLowerCase().includes(state.search.toLowerCase()));
  rows = rows.filter(({s}) => !state.status || (state.status === 'cited' ? s.cited : state.status === 'uncited' ? s.retrieved && !s.cited : s.cited && !s.retrieved));
  rows.sort((a,b) => state.sort === 'domain' ? a.s.domain.localeCompare(b.s.domain) : state.sort === 'cited' ? Number(b.s.cited)-Number(a.s.cited) || a.s.title.localeCompare(b.s.title) : a.s.title.localeCompare(b.s.title));
  const pagination = pager(rows.length);
  return `<div class="toolbar"><p>${rows.length} URL/run pairs</p><label class="select-label">Status <select id="source-status"><option value="">All evidence</option><option value="cited" ${state.status==='cited'?'selected':''}>Cited sources</option><option value="uncited" ${state.status==='uncited'?'selected':''}>Uncited retrievals</option><option value="citationOnly" ${state.status==='citationOnly'?'selected':''}>Citation-only sources</option></select></label><label class="select-label">Sort <select id="source-sort">${[['title','Source title'],['domain','Source domain'],['cited','Citations first']].map(([v,t]) => `<option value="${v}" ${state.sort===v?'selected':''}>${t}</option>`).join('')}</select></label><button class="secondary" data-action="csv">Export filtered CSV</button></div>` + section('Normalized sources','Tracking parameters and URL fragments are removed; meaningful query parameters are preserved.',rows.length ? sourceRows(rows.slice((state.pagination-1)*25,state.pagination*25))+pagination : noMatches());
}
function providersPage() {
  const rows = [
    ['chatgpt','Saved conversation JSON','Search-result groups + assistant reference markers','Follows the active branch when current_node exists.'],
    ['claude','Saved chat JSON','Named search tool results + text citations','Requires tool results in the export.'],
    ['openai','Responses API JSON','Web search sources + URL annotations','Request include: ["web_search_call.action.sources"].'],
    ['anthropic','Messages API JSON','Server search results + web search citations','Requires a saved response from a search-enabled request.'],
    ['gemini','GenerateContent JSON','Grounding chunks + grounding support indices','Uses the first candidate; grounding is not a full search log.'],
    ['perplexity','Sonar chat completion JSON','search_results + citations','Citation evidence is counted separately when retrievals are absent.'],
    ['grok','Grok chat completion JSON','Citations + URL annotations','Requires citations in the payload; retrievals are not inferred.']
  ];
  return section('Native import adapters','Validated against the included synthetic fixtures.',`<div class="table-wrap" tabindex="0" role="region" aria-label="Horizontally scrollable evidence table"><table><caption class="sr-only">Supported provider formats</caption><thead><tr><th>Provider</th><th>Input</th><th>Evidence fields</th><th>Caveat</th></tr></thead><tbody>${rows.map(([p,input,fields,note]) => `<tr><td>${badge(p)}</td><td>${esc(input)}</td><td>${esc(fields)}</td><td>${esc(note)}</td></tr>`).join('')}</tbody></table></div>`,'','Authenticated provider websites and all API versions have not been live-tested. Import non-streaming JSON, not SSE streams or copied chat text.') + section('Other providers','Use an explicit schema for other payload formats.',`<div class="docs"><p>Import Copilot, Mistral, DeepSeek, or another provider through normalized v3 JSON. Map URLs and observed evidence flags explicitly. Native parsing for those exports is not included.</p><div class="actions"><a href="public/examples/custom.json" download>Download custom-provider template ↗</a><a href="docs/PROVIDERS.md">Read adapter reference ↗</a></div></div>`);
}
function settingsPage() {
  return section('Workspace controls','Export a backup before removing local evidence.',`<div class="settings-row"><div><h3>Portable backup</h3><p>Export all runs, including those outside the current filters, as round-trip JSON.</p></div><button class="secondary" data-action="backup">Export all data</button></div><div class="settings-row"><div><h3>Sample workspace</h3><p>Load seven small synthetic fixtures to explore the interface. These are not real provider benchmarks.</p></div><button class="secondary" data-action="demo">Load sample runs</button></div><div class="settings-row"><div><h3>Local reset</h3><p>Delete this app’s saved runs and legacy v1 run key. Recovery requires an exported backup.</p></div><button class="danger" data-action="clear">Delete saved runs</button></div>`) + section('Privacy boundary','Understand what stays local and what does not.',`<div class="docs"><p>Imports are parsed in the browser. No file uploads, stored API keys, analytics, or automatic provider requests.</p><p>Normalized prompts, source titles, URLs, model labels, queries, and evidence paths are stored in localStorage. Complete raw responses are not saved. Anyone with access to this browser profile can read that storage.</p><p>Loading the site and bundled examples makes normal hosting requests. Opening a source link contacts that source. GitHub Pages can record access logs.</p><p>Manually mapped evidence flags are assertions, not independent verification. Native adapter evidence paths are available in the run inspector.</p><p>Browser storage is scoped per origin, not per GitHub Pages repository path. Avoid sharing the same storage key with unrelated apps.</p><a href="docs/PRIVACY.md">Read full privacy notes ↗</a></div>`);
}
function onboarding() {
  return `<section class="panel"><div class="empty"><div class="eyebrow">LOCAL-FIRST RESEARCH DESK</div><h2>Start with evidence, not assumptions.</h2><p>Import saved AI responses, inspect their sources, and see which observed retrievals became citations. Files are processed in this browser.</p><div class="actions"><button class="primary" data-action="import">+ Import first response</button><button class="secondary" data-action="demo">Try 60-second demo →</button></div></div><div class="intro-steps"><div><span class="stepnum">01 / INPUT</span><h3>Import saved JSON.</h3><p>Use seven native provider formats or the normalized v3 schema.</p></div><div><span class="stepnum">02 / EVIDENCE</span><h3>Inspect every source.</h3><p>Keep retrieval, citation, and citation-only evidence separate.</p></div><div><span class="stepnum">03 / WORKSPACE</span><h3>Keep control of your data.</h3><p>Filter locally and export JSON backups or source-level CSV.</p></div></div></section>`;
}
function exitDemo() {
  if(!state.demo)return;
  state.runs=state.savedRuns;state.savedRuns=[];state.demo=false;state.page='overview';resetFilters();
  toast('Demo closed. Your saved workspace has been restored.');
}
function tourStep(step) {
  state.guideStep=step;
  state.search='';state.provider='';state.period='';state.status='';state.pagination=1;
  $('#search').value='';$('#period').value='';
  state.page=['overview','runs','sources','overview'][step];
  if(step===2)state.status='citationOnly';
  render();$('#walkthrough').scrollIntoView({block:'start'});
}
function renderWalkthrough() {
  if(!state.demo){$('#walkthrough').innerHTML='';return;}
  const steps=[
    ['Read the overview','This synthetic dataset has 12 observed retrievals and 8 cited sources. Only 6 sources have both flags, so the matched rate is 50%. The other 2 citations have no retrieval record.'],
    ['Inspect one run','Open a run title to see its search queries, evidence paths, and source snapshots. The sample ChatGPT response has 2 retrievals and 1 citation. Close the inspector to continue.'],
    ['Find citation-only evidence','The source library is filtered to 2 Grok citations without retrieval records. A citation-only response must not be reported as a complete search log.'],
    ['Export or test an import','Export demo JSON downloads this sample workspace. Try example import opens a preview without saving anything. Exiting the demo restores the saved workspace.']
  ];
  const [title,description]=steps[state.guideStep];
  $('#walkthrough').innerHTML=`<section class="walkthrough"><div><span class="eyebrow">GUIDED DEMO · STEP ${state.guideStep+1} OF 4</span><h2>${title}</h2><p>${description}</p></div><div class="actions">${state.guideStep===3?'<button class="secondary" data-action="backup">Export demo JSON</button><button class="primary" data-action="example-import">Try example import</button>':''}${state.guideStep===1?'<button class="secondary" data-action="tour-inspect">Open sample run</button>':''}${state.guideStep?'<button class="secondary" data-action="tour-back">Back</button>':''}${state.guideStep<3?'<button class="primary" data-action="tour-next">Next step →</button>':''}<button class="quiet" data-action="exit-demo">Exit demo</button></div></section>`;
}
function render() {
  const [crumb,title,description] = pages[state.page];
  $('#crumb').textContent = crumb; $('#page-title').textContent = title; $('#page-description').textContent = description;
  document.querySelectorAll('nav [data-page]').forEach(b => { b.classList.toggle('active',b.dataset.page === state.page); if(b.dataset.page === state.page) b.setAttribute('aria-current','page'); else b.removeAttribute('aria-current'); });
  $('#run-count').textContent = state.runs.length;
  const providers = [...new Set(state.runs.map(r => r.platform))].sort();
  if (state.provider && !providers.includes(state.provider)) state.provider = '';
  $('#provider').innerHTML = '<option value="">All providers</option>' + providers.map(p => `<option value="${esc(p)}">${esc(providerName(p))}</option>`).join('');
  $('#provider').value = state.provider;
  $('#filterbar').hidden = ['providers','settings'].includes(state.page);
  $('#filterbar').style.display = $('#filterbar').hidden ? 'none' : '';
  const notices = [];
  if(state.demo) notices.push('Demo mode · Synthetic data only · Your saved workspace is untouched.');
  if (state.storageLocked) notices.push('Saved data could not be read and has not been overwritten. Preserve the original storage value before resetting it in Data & privacy.');
  const synthetic = state.runs.filter(r => r.synthetic).length;
  if (synthetic) notices.push(`Demo data: ${synthetic} synthetic sample run(s). These test formats, not provider performance.`);
  $('#notice').hidden = !notices.length;
  $('#notice').textContent = notices.join(' ');
  renderWalkthrough();
  const runs = visibleRuns();
  $('#view').innerHTML = state.page === 'providers' ? providersPage() : state.page === 'settings' ? settingsPage() : !state.runs.length ? onboarding() : state.page === 'overview' ? overview(runs) : state.page === 'runs' ? runsPage(runs) : sourcesPage(runs);
}
function resetFilters() {
  state.search=''; state.provider=''; state.period=''; state.status=''; state.pagination=1;
  $('#search').value=''; $('#provider').value=''; $('#period').value=''; render();
}
async function loadDemo() {
  try {
    const response = await fetch('public/examples/workspace.json'); if (!response.ok) throw new Error();
    const incoming = parseText(await response.text()).map(r => ({...r,synthetic:true}));
    if(!state.demo) state.savedRuns=state.runs;
    state.demo=true;state.runs=incoming;state.guideStep=0;state.page='overview';
    $('#help-dialog').close();resetFilters();toast('Demo ready. Follow the four steps above the workspace.');
  } catch { toast('Could not load samples. Use npm start or GitHub Pages, not file://.'); }
}
function inspectRun(key) {
  const r = state.runs.find(r => `${r.platform}:${r.id}` === key); if (!r) return;
  const m = metrics([r]);
  $('#run-detail').innerHTML = `<div class="dialog-heading"><div><div class="eyebrow">RUN INSPECTOR</div><h2 id="run-title">${esc(r.title)}</h2></div><button class="icon-button" data-close="run-dialog" aria-label="Close run inspector">×</button></div><div class="detail-meta">${badge(r.platform)}<span>${esc(r.model || 'Model is unavailable')}</span><span>${esc(date(r.createdAt))}</span>${r.synthetic ? '<span class="tag info">Synthetic fixture</span>' : ''}</div><p class="detail-summary">Evidence origin: ${esc(r.provenance)}</p><p class="detail-summary">${esc(r.prompt || 'No prompt is available in this saved response.')}</p><p class="detail-summary">${m.retrieved} observed retrievals · ${m.cited} cited sources · Matched citation rate: ${rate(m.rate)}</p>${r.warnings.length ? `<div class="warnings"><strong>Evidence limits</strong>${r.warnings.map(w => `<p>${esc(w)}</p>`).join('')}</div>` : ''}<h3>Observed queries</h3>${r.queries.length ? r.queries.map(q => `<div class="detail-query">${esc(q)}</div>`).join('') : '<p class="detail-summary">Search queries are not available in this file.</p>'}<h3>Source evidence</h3>${sourceRows(r.sources.map(s => ({s,r})),true)}<div class="dialog-actions"><button class="secondary" data-export-run="${esc(key)}">Export run</button><button class="danger" data-delete-run="${esc(key)}">Delete run</button></div>`;
  $('#run-dialog').showModal();
}
function renderImport() {
  $('#import-results').innerHTML = state.importMessages.map(m => `<div class="preview-item ${m.error?'error':''}">${esc(m.text)}</div>`).join('') + (state.staged.length ? `<div class="preview-item"><strong>${state.staged.length} run(s) ready to save.</strong><p>Existing runs are replaced when provider and run ID both match. Failed files are excluded.</p></div>` : '');
  $('#commit-import').disabled = !state.staged.length;
}
let importing = false;
async function importFiles(files) {
  if (importing) { toast('The previous batch is still being processed.'); return; }
  importing = true; $('#commit-import').disabled = true;
  for (const file of files) {
    try {
      if (!/\.(json|jsonl)$/i.test(file.name)) throw new Error('Only .json or .jsonl files are supported.');
      if (file.size > 15*1024*1024) throw new Error('Each file must be below 15 MB.');
      const runs = parseText(await file.text(),file.name);
      state.staged.push(...runs); state.importMessages.push({text:`Parsed ${file.name}: ${runs.length} run(s), ${runs.reduce((n,r)=>n+r.sources.length,0)} source/run pairs.`});
    } catch(e) { state.importMessages.push({error:true,text:`Skipped ${file.name}: ${e.message}`}); }
  }
  importing = false; renderImport(); $('#files').value='';
}
function openImport() { if(state.demo) exitDemo(); state.staged=[]; state.importMessages=[]; $('#paste').value=''; renderImport(); $('#import-dialog').showModal(); }
function exportSources() {
  let rows = visibleRuns().map(r => ({...r,sources:r.sources.filter(s => (!state.search || [s.title,s.url,r.title,r.prompt].join(' ').toLowerCase().includes(state.search.toLowerCase())) && (!state.status || (state.status === 'cited' ? s.cited : state.status === 'uncited' ? s.retrieved&&!s.cited : s.cited&&!s.retrieved)))}));
  download('my-citation-sources.csv',sourcesCsv(rows),'text/csv;charset=utf-8');
}
function applyTheme(theme) {
  state.theme = theme;
  const dark = theme === 'dark' || (theme === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  $('#theme').textContent = `Theme: ${theme}`;
}
$('#theme').onclick = () => {
  const next = ['auto','light','dark'][(['auto','light','dark'].indexOf(state.theme)+1)%3];
  applyTheme(next); try {localStorage.setItem('citetracker.theme.v3',next);} catch {toast('Theme changed for this session only; the preference could not be saved.');}
};
matchMedia('(prefers-color-scheme: dark)').addEventListener('change',() => applyTheme(state.theme));
$('#mobile-menu').onclick = () => {const open=$('#workspace-nav').classList.toggle('mobile-open');$('#mobile-menu').setAttribute('aria-expanded',String(open));};
$('#quick-start').onclick=()=>$('#help-dialog').showModal();
$('#import-top').onclick = openImport;
$('#export').onclick = () => download('my-citation-workspace.json',workspaceJson(state.runs),'application/json');
$('#reset-filters').onclick = resetFilters;
$('#search').addEventListener('input',e => {state.search=e.target.value;state.pagination=1;render();});
$('#provider').onchange = e => {state.provider=e.target.value;state.pagination=1;render();};
$('#period').onchange = e => {state.period=e.target.value;state.pagination=1;render();};
$('#files').onchange = e => importFiles([...e.target.files]);
$('#parse-paste').onclick = () => {
  if (importing) return;
  try { const runs = parseText($('#paste').value); state.staged.push(...runs); state.importMessages.push({text:`JSON preview: ${runs.length} run(s).`}); }
  catch(e) {state.importMessages.push({error:true,text:e.message});} renderImport();
};
$('#commit-import').onclick = () => {
  if (importing || !state.staged.length) return;
  const merged = mergeRuns(state.runs,state.staged);
  if (persist(merged.runs)) { $('#import-dialog').close(); render(); toast(`Saved ${merged.added} new run(s); replaced ${merged.replaced}.`); }
};
for (const type of ['dragenter','dragover']) $('#dropzone').addEventListener(type,e => {e.preventDefault();$('#dropzone').classList.add('drag');});
for (const type of ['dragleave','drop']) $('#dropzone').addEventListener(type,e => {e.preventDefault();$('#dropzone').classList.remove('drag');});
$('#dropzone').addEventListener('drop',e => importFiles([...e.dataTransfer.files]));
document.addEventListener('click',async e => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.page) setPage(b.dataset.page);
  if (b.dataset.close) $('#'+b.dataset.close).close();
  if (b.dataset.run) inspectRun(b.dataset.run);
  if (b.dataset.pageStep) {state.pagination+=Number(b.dataset.pageStep);render();}
  if (b.dataset.exportRun) {const r=state.runs.find(r=>`${r.platform}:${r.id}`===b.dataset.exportRun);if(r)download('my-citation-run.json',workspaceJson([r]),'application/json');}
  if (b.dataset.deleteRun && confirm('Permanently delete this saved run?')) {
    if(persist(state.runs.filter(r=>`${r.platform}:${r.id}`!==b.dataset.deleteRun))) {$('#run-dialog').close();render();toast('Run deleted.');}
  }
  switch(b.dataset.action) {
    case 'import':openImport();break;
    case 'help-import':$('#help-dialog').close();openImport();break;
    case 'exit-demo':exitDemo();break;
    case 'tour-next':tourStep(Math.min(3,state.guideStep+1));break;
    case 'tour-back':tourStep(Math.max(0,state.guideStep-1));break;
    case 'tour-inspect':{const r=state.runs.find(r=>r.platform==='chatgpt');if(r)inspectRun(`${r.platform}:${r.id}`);break;}
    case 'prior-evidence':{
      $('#help-dialog').close();openImport();
      try{const response=await fetch('public/examples/prior-evidence.json');if(!response.ok)throw new Error();state.staged.push(...parseText(await response.text()));state.importMessages.push({text:'Original saved-chat case: ChatGPT 29 retrieved / 7 cited; Claude 9 retrieved / 7 cited. Not a new live-stream capture. Nothing is saved yet.'});renderImport();}
      catch{toast('Could not load the original evidence.');}break;
    }
    case 'example-import':{
      $('#help-dialog').close();openImport();
      try{const response=await fetch('public/examples/openai.json');if(!response.ok)throw new Error();const runs=parseText(await response.text()).map(r=>({...r,synthetic:true}));state.staged.push(...runs);state.importMessages.push({text:'Bundled synthetic OpenAI example: 1 run, 2 observed retrievals, 1 cited source. Nothing is saved yet.'});renderImport();}
      catch{toast('Could not load the example. Choose a local file instead.');}break;
    }
    case 'demo':await loadDemo();break;
    case 'reset':resetFilters();break;
    case 'csv':exportSources();break;
    case 'backup':download('my-citation-workspace.json',workspaceJson(state.runs),'application/json');break;
    case 'clear':
      if(state.demo){toast('Exit demo before deleting saved data.');break;}
      if (!confirm('Delete all saved runs? Recovery requires an exported backup.')) break;
      try {localStorage.removeItem('citetracker.runs.v1');saveWorkspace(localStorage,[]);state.storageLocked=false;state.runs=[];resetFilters();toast('Saved runs deleted.');} catch {toast('Could not clear local storage.');}
  }
});
document.addEventListener('change',e => {
  if(e.target.id==='source-status'){state.status=e.target.value;state.pagination=1;render();}
  if(e.target.id==='source-sort'){state.sort=e.target.value;state.pagination=1;render();}
});
document.addEventListener('keydown',e => {
  if(e.key==='/' && !['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName) && !document.querySelector('dialog[open]') && !$('#filterbar').hidden){e.preventDefault();$('#search').focus();}
});
try {const loaded=loadWorkspace(localStorage);state.runs=loaded.runs;if(loaded.migrated)toast('Legacy v1 runs migrated. Review the migration warnings in each run.');} catch {state.storageLocked=true;}
try {applyTheme(['auto','light','dark'].includes(localStorage.getItem('citetracker.theme.v3'))?localStorage.getItem('citetracker.theme.v3'):'auto');} catch {applyTheme('auto');}
if(pages[location.hash.slice(1)]) state.page=location.hash.slice(1);
window.addEventListener('hashchange',()=>{if(pages[location.hash.slice(1)]){state.page=location.hash.slice(1);state.pagination=1;render();}});
render();
if(new URLSearchParams(location.search).get('demo')==='1' && !state.runs.length) loadDemo();
