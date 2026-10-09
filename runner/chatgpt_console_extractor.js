(async () => {
  // get this chat's ID from the address bar
  const id = location.pathname.split('/c/')[1];
  if (!id) { console.error('Open a chat first (URL must contain /c/...)'); return; }

  // get your login token and download the full saved conversation
  const session = await (await fetch('/api/auth/session')).json();
  const res = await fetch(`/backend-api/conversation/${id}`, {
    headers: { Authorization: `Bearer ${session.accessToken}` }
  });
  if (!res.ok) { console.error('Request failed:', res.status); return; }
  const convo = await res.json();

  // retrieved vs cited depends on where the URL sits
  const queries = new Set(), sources = new Map();
  const META = ['title','snippet','description','pub_date','attribution','channel_name','channel','views','view_count','likes','like_count','subscribers','followers','verified','duration'];
  const walk = (o, path) => {
    if (Array.isArray(o)) return o.forEach(v => walk(v, path));
    if (o && typeof o === 'object') {
      const url = ['url','link'].map(k => o[k]).find(v => typeof v === 'string' && /^https?:\/\//.test(v));
      if (url) {
        const s = sources.get(url) || { url, retrieved: false, cited: false };
        if (/content_references|citation|footnote/i.test(path)) s.cited = true; else s.retrieved = true;
        META.forEach(k => { if (o[k] != null && o[k] !== '' && s[k] == null) s[k] = o[k]; });
        sources.set(url, s);
      }
      for (const [k, v] of Object.entries(o)) {
        if (/^(queries|query|q|search_query|search_queries)$/i.test(k)) {
          [].concat(v).forEach(x => { const t = typeof x === 'string' ? x : x?.q || x?.query; if (t && !/^https?:/.test(t)) queries.add(t); });
        }
        walk(v, path + '/' + k);
      }
    } else if (typeof o === 'string' && /^\s*[\[{]/.test(o) && /search|quer/i.test(o)) {
      try { walk(JSON.parse(o), path); } catch (e) {}   // tool calls store JSON inside strings
    }
  };
  walk(convo, '');

  // show results
  const list = [...sources.values()];
  console.log(`%cFan-out queries (${queries.size})`, 'font-weight:bold;font-size:14px');
  console.table([...queries].map(q => ({ query: q })));
  console.log(`%cSources: ${list.filter(s => s.retrieved).length} retrieved / ${list.filter(s => s.cited).length} cited`, 'font-weight:bold;font-size:14px');
  console.table(list.map(s => ({ status: s.cited ? 'CITED' : 'retrieved-only', title: s.title, url: s.url, date: s.pub_date, source: s.attribution })));

  // download raw + extracted files
  const save = (obj, name) => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' })); a.download = name; a.click(); };
  save(convo, 'chatgpt_raw.json');
  save({ prompt_chat_id: id, fan_out_queries: [...queries], sources: list }, 'chatgpt_extracted.json');
  console.log('Downloaded chatgpt_raw.json and chatgpt_extracted.json');
})();
