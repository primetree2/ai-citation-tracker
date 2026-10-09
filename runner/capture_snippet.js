// Paste in DevTools Console on chatgpt.com / perplexity.ai / claude.ai / grok.com BEFORE sending the prompt.
// It tees every streamed response so the UI keeps working, then lets you download the raw stream.
(() => {
  const KEEP = /conversation|completion|perplexity_ask|StreamGenerate|app-chat|responses/i;
  window.__streams = [];
  const orig = window.fetch;
  window.fetch = async (...args) => {
    const res = await orig(...args);
    const url = typeof args[0] === 'string' ? args[0] : args[0]?.url;
    if (KEEP.test(url || '') && res.body) {
      const [a, b] = res.body.tee();
      const rec = { url, status: res.status, startedAt: new Date().toISOString(), body: '' };
      window.__streams.push(rec);
      (async () => {
        const reader = b.getReader(); const dec = new TextDecoder();
        for (;;) { const { done, value } = await reader.read(); if (done) break; rec.body += dec.decode(value, { stream: true }); }
        console.log('[capture] finished', url, rec.body.length, 'chars');
      })();
      return new Response(a, { status: res.status, statusText: res.statusText, headers: res.headers });
    }
    return res;
  };
  window.__download = () => {
    const blob = new Blob([JSON.stringify(window.__streams, null, 2)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `stream_${location.hostname}_${Date.now()}.json`; a.click();
  };
  console.log('[capture] ready. Send your prompt, wait for the answer, then run __download()');
})();
