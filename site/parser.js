/* parser.js - turns a saved ChatGPT / Claude conversation (raw JSON) into
   { fan-out queries, every retrieved source, which ones were cited }.
   Same logic as extract_v2.py, ported to JS so it runs in the browser. */
(function (root) {
  const cleanUrl = u => (u || '').replace(/[?&]utm_source=chatgpt(\.com)?/, '').replace(/\/$/, '');
  const domainOf = u => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch (e) { return ''; } };
  const isYouTube = u => /(^|\.)youtube\.com$|(^|\.)youtu\.be$/.test(domainOf(u));

  function detect(raw) {
    if (raw && raw.mapping) return 'chatgpt';
    if (raw && Array.isArray(raw.chat_messages)) return 'claude';
    return null;
  }

  function parseChatGPT(raw) {
    const results = {}, citedRefs = [], citedUrls = new Set(), queries = [], status = [];
    let prompt = '';
    const nodes = Object.values(raw.mapping || {})
      .filter(n => n.message)
      .sort((a, b) => (a.message.create_time || 0) - (b.message.create_time || 0));

    for (const n of nodes) {
      const m = n.message, md = m.metadata || {}, c = m.content || {};
      const role = m.author && m.author.role;
      const text = (c.parts || []).filter(x => typeof x === 'string').join('');

      if (role === 'user' && !prompt && text.trim()) prompt = text.trim();

      // retrieved: search_result_groups -> entries, each with a ref_id
      for (const g of md.search_result_groups || []) {
        for (const e of g.entries || []) {
          const r = e.ref_id || {};
          const key = `turn${r.turn_index}${r.ref_type}${r.ref_index}`;
          if (!results[key]) results[key] = {
            refs: [key], type: r.ref_type || 'search', url: e.url, title: e.title || '',
            snippet: e.snippet || '', site: e.attribution || domainOf(e.url),
            date: e.pub_date ? new Date(e.pub_date * 1000).toISOString().slice(0, 10) : null, cited: false
          };
        }
      }

      // fan-out queries (rarely saved, mostly in the live stream)
      if (md.search_model_queries && Array.isArray(md.search_model_queries.queries)) queries.push(...md.search_model_queries.queries);
      if (role === 'assistant' && (m.recipient || '').startsWith('web') && text.trim().startsWith('{')) {
        try {
          const call = JSON.parse(text);
          for (const q of [].concat(call.search_query || call.queries || [])) {
            const t = typeof q === 'string' ? q : (q && (q.q || q.query));
            if (t) queries.push(t);
          }
        } catch (e) { /* not JSON */ }
      }
      for (const t of md.reasoning_titles || []) if (!status.includes(t)) status.push(t);

      // cited: inline markers in the answer text
      if (role === 'assistant' && c.content_type === 'text') {
        for (const grp of text.matchAll(/refs=\{\[(.*?)\]\}/g))           // <Cite refs={["turn0search3"]}/>
          for (const r of grp[1].matchAll(/"([^"]+)"/g)) citedRefs.push(r[1]);
        for (const grp of text.matchAll(/\ue200cite((?:\ue202[^\ue201\ue202]+)+)\ue201/g)) // older private-use markers
          for (const r of grp[1].split('\ue202').filter(Boolean)) citedRefs.push(r);
        for (const cr of md.content_references || [])                     // older grouped_webpages format
          for (const it of [].concat(cr.items || [], cr.sources || [])) if (it && it.url) citedUrls.add(cleanUrl(it.url));
      }
    }

    for (const ref of citedRefs) if (results[ref]) results[ref].cited = true;

    // same page appears twice (search step + footer with ?utm_source), dedupe
    const uniq = {};
    for (const s of Object.values(results)) {
      const u = cleanUrl(s.url);
      if (uniq[u]) {
        uniq[u].cited = uniq[u].cited || s.cited; uniq[u].refs.push(...s.refs);
        uniq[u].snippet = uniq[u].snippet || s.snippet; uniq[u].date = uniq[u].date || s.date;
      } else uniq[u] = { ...s, url: u };
    }
    for (const u of Object.keys(uniq)) if (citedUrls.has(u)) uniq[u].cited = true;

    return {
      id: raw.conversation_id || raw.id || ('chatgpt-' + Date.now()),
      platform: 'chatgpt', title: raw.title || '', prompt,
      model: raw.default_model_slug || '',
      createdAt: raw.create_time ? new Date(raw.create_time * 1000).toISOString() : new Date().toISOString(),
      queries: [...new Set(queries)], status, sources: Object.values(uniq), citeMarkers: citedRefs.length
    };
  }

  function parseClaude(raw) {
    const sources = {}, queries = [], status = [];
    let prompt = '', citeMarkers = 0;
    for (const msg of raw.chat_messages || []) {
      for (const b of msg.content || []) {
        if (msg.sender === 'human' && b.type === 'text' && !prompt) prompt = (b.text || '').trim();
        if (b.type === 'tool_use' && /search/i.test(b.name || '')) {
          let input = b.input;
          if (typeof input === 'string') { try { input = JSON.parse(input); } catch (e) { input = { query: input }; } }
          const q = input && (input.query || input.q);
          if (q) queries.push(q);
        } else if (b.type === 'tool_result' && /search/i.test(b.name || '')) {
          for (const r of Array.isArray(b.content) ? b.content : []) {
            if (!r || !r.url) continue;
            const md = r.metadata || {};
            if (!sources[r.url]) sources[r.url] = {
              refs: [], type: isYouTube(r.url) ? 'youtube' : 'search', url: r.url, title: r.title || '',
              snippet: typeof r.text === 'string' ? r.text.slice(0, 300) : '',
              site: md.site_name || md.site_domain || domainOf(r.url), date: md.published_date || md.page_age || null, cited: false
            };
          }
        } else if (b.type === 'thinking') {
          for (const s of b.summaries || []) if (s && s.summary) status.push(s.summary);
        } else if (b.type === 'text') {
          for (const c of b.citations || []) {
            citeMarkers++;
            for (const s of (c.sources && c.sources.length ? c.sources : [c])) if (s && sources[s.url]) sources[s.url].cited = true;
          }
        }
      }
    }
    return {
      id: raw.uuid || ('claude-' + Date.now()), platform: 'claude', title: raw.name || '', prompt,
      model: raw.model || '', createdAt: raw.created_at || new Date().toISOString(),
      queries: [...new Set(queries)], status, sources: Object.values(sources), citeMarkers
    };
  }

  function parseConversation(raw) {
    const p = detect(raw);
    if (!p) throw new Error('This does not look like a saved ChatGPT or Claude conversation.');
    const run = p === 'chatgpt' ? parseChatGPT(raw) : parseClaude(raw);
    for (const s of run.sources) { s.domain = domainOf(s.url); if (isYouTube(s.url)) s.type = 'youtube'; }
    run.retrieved = run.sources.length;
    run.cited = run.sources.filter(s => s.cited).length;
    run.importedAt = new Date().toISOString();
    return run;
  }

  const api = { parseConversation, detect, domainOf };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.CiteParser = api;
})(typeof window !== 'undefined' ? window : globalThis);
