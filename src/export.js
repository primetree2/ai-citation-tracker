export function workspaceJson(runs) {
  return JSON.stringify(
    { schemaVersion: 3, exportedAt: new Date().toISOString(), runs },
    null,
    2,
  );
}
export function sourcesCsv(runs) {
  const cell = (v) => {
    let s = String(v ?? "");
    if (/^[\s]*[=+@-]/.test(s)) s = "'" + s;
    return '"' + s.replaceAll('"', '""') + '"';
  };
  const rows = [
    [
      "run_id",
      "provider",
      "model",
      "prompt",
      "queries_json",
      "title",
      "url",
      "domain",
      "retrieved",
      "cited",
      "evidence",
      "snippet",
      "published_at",
      "snapshot_json",
    ],
  ];
  for (const r of runs)
    for (const s of r.sources)
      rows.push([
        r.id,
        r.platform,
        r.model,
        r.prompt,
        JSON.stringify(r.queries),
        s.title,
        s.url,
        s.domain,
        s.retrieved,
        s.cited,
        s.evidence.join("; "),
        s.snapshot?.snippet,
        s.snapshot?.publishedAt,
        JSON.stringify(s.snapshot || {}),
      ]);
  return "\ufeff" + rows.map((row) => row.map(cell).join(",")).join("\r\n");
}
