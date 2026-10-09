(async () => {
  // chat ID from the address bar (claude.ai/chat/<id>)
  const chatId = location.pathname.split('/chat/')[1];
  if (!chatId) { console.error('Open a chat first (URL must contain /chat/...)'); return; }

  // find your organization ID (cookie first, then API)
  const cookieOrg = (document.cookie.match(/lastActiveOrg=([^;]+)/) || [])[1];
  let orgIds = cookieOrg ? [cookieOrg] : [];
  try { const orgs = await (await fetch('/api/organizations')).json(); orgIds.push(...orgs.map(o => o.uuid)); } catch (e) {}
  orgIds = [...new Set(orgIds)];

  // download the full saved conversation, including tool calls and results
  let convo = null;
  for (const org of orgIds) {
    const r = await fetch(`/api/organizations/${org}/chat_conversations/${chatId}?tree=True&rendering_mode=messages&render_all_tools=true`);
    if (r.ok) { convo = await r.json(); break; }
  }
  if (!convo) { console.error('Could not load the conversation. Refresh the page and try again.'); return; }

  // tool_use.input.query = fan-out, tool_result = retrieved, citations = cited
  const queries = new Set(), sources = new Map();
  const META = ['title','site_name','site_domain','published_date','page_age','author','channel','views'];
  const walk = (o, path) => {
    if (Array.isArray(o)) return o.forEach(v => walk(v, path));
    if (!o || typeof o !== 'object') return;
    if (o.type === 'tool_use' && o.input) {
      const q = o.input.query || o.input.q || o.input.queries;
      [].concat(q || []).forEach(x => typeof x === 'string' && queries.add(x));
    }
    const url = ['url','link','uri'].map(k => o[k]).find(v => typeof v === 'string' && /^https?:\/\//.test(v));
    if (url) {
      const s = sources.get(url) || { url, retrieved: false, cited: false };
      if (/citation/i.test(path)) s.cited = true; else s.retrieved = true;
      const flat = { ...o, ...(o.metadata || {}) };
      META.forEach(k => { if (flat[k] != null && flat[k] !== '' && s[k] == null) s[k] = flat[k]; });
      if (!s.snippet && typeof o.text === 'string') s.snippet = o.text.slice(0, 300);
      sources.set(url, s);
    }
    for (const [k, v] of Object.entries(o)) walk(v, path + '/' + k);
  };
  walk(convo, '');

  // show + download
  const list = [...sources.values()];
  console.log(`%cFan-out queries (${queries.size})`, 'font-weight:bold;font-size:14px');
  console.table([...queries].map(q => ({ query: q })));
  console.log(`%cSources: ${list.filter(s => s.retrieved).length} retrieved / ${list.filter(s => s.cited).length} cited`, 'font-weight:bold;font-size:14px');
  console.table(list.map(s => ({ status: s.cited ? 'CITED' : 'retrieved-only', title: s.title, site: s.site_name || s.site_domain, url: s.url })));
  const save = (obj, name) => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' })); a.download = name; a.click(); };
  save(convo, 'claude_raw.json');
  save({ chat_id: chatId, fan_out_queries: [...queries], sources: list }, 'claude_extracted.json');
  console.log('Downloaded claude_raw.json and claude_extracted.json');
})();
