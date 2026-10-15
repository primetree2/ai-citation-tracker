import { normalizeRun } from './model.js';
const KEY = 'citetracker.workspace.v3';
export function loadWorkspace(storage) {
  const saved = storage.getItem(KEY);
  if (saved !== null) {
    const data = JSON.parse(saved);
    if (!Array.isArray(data.runs)) throw new Error('Saved workspace could not be read. It has not been overwritten.');
    return { runs: data.runs.map(normalizeRun), migrated: false };
  }
  const old = storage.getItem('citetracker.runs.v1');
  if (!old) return { runs: [], migrated: false };
  const runs = JSON.parse(old).map(r => normalizeRun({ ...r, schemaVersion: 3,
    sources: r.sources.map(s => ({ ...s, retrieved: true, evidence: ['V1 import; retrieval assumed by the earlier parser'] })),
    warnings: [...(r.warnings || []), 'This run was migrated from v1. Its original evidence has not been revalidated.']
  }));
  saveWorkspace(storage, runs);
  return { runs, migrated: true };
}
export function saveWorkspace(storage, runs) {
  storage.setItem(KEY, JSON.stringify({ schemaVersion: 3, runs }));
}
export function mergeRuns(existing, incoming) {
  const map = new Map(existing.map(r => [`${r.platform}:${r.id}`, r]));
  let replaced = 0;
  for (const r of incoming) {
    const key = `${r.platform}:${r.id}`;
    if (map.has(key)) replaced++;
    map.set(key, r);
  }
  return { runs: [...map.values()], added: map.size - existing.length, replaced };
}
