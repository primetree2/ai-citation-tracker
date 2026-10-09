"""
Reads a saved ChatGPT or Claude conversation JSON and prints the fan-out
queries plus every source, marked retrieved or cited.

python parser.py ../sample-data/chatgpt_raw.json
python parser.py ../sample-data/claude_raw.json
"""
import json, re, sys, csv
from datetime import datetime, timezone

def chatgpt(raw):
    sources, cited_refs, queries, notes = {}, [], [], []
    for node in raw["mapping"].values():
        msg = node.get("message")
        if not msg:
            continue
        md = msg.get("metadata", {})
        # retrieved: every search_result has a ref_id like {turn_index, ref_type, ref_index}
        for g in md.get("search_result_groups") or []:
            for e in g.get("entries", []):
                r = e.get("ref_id") or {}
                key = f"turn{r.get('turn_index')}{r.get('ref_type')}{r.get('ref_index')}"
                sources.setdefault(key, {
                    "ref": key, "type": r.get("ref_type"), "url": e.get("url"), "title": e.get("title"),
                    "snippet": e.get("snippet"), "attribution": e.get("attribution"),
                    "pub_date": datetime.fromtimestamp(e["pub_date"], timezone.utc).date().isoformat() if e.get("pub_date") else None,
                    "cited": False})
        for q in (md.get("search_model_queries") or {}).get("queries", []):   # usually only in the live stream
            queries.append(q)
        notes += md.get("reasoning_titles") or []
        # cited: the answer text has inline markers like <Cite refs={["turn501059search11"]}/>
        if msg["author"]["role"] == "assistant" and msg["content"].get("content_type") == "text":
            text = "".join(p for p in msg["content"].get("parts", []) if isinstance(p, str))
            for grp in re.findall(r'refs=\{\[(.*?)\]\}', text):
                cited_refs += re.findall(r'"([^"]+)"', grp)
    for ref in cited_refs:
        if ref in sources:
            sources[ref]["cited"] = True
    # same page shows up twice: once from the search turn, once in the final message's
    # source list with ?utm_source=chatgpt.com added -> dedupe on the cleaned URL
    uniq = {}
    for s in sources.values():
        u = re.sub(r"[?&]utm_source=chatgpt(\.com)?", "", s["url"]).rstrip("/")
        if u in uniq:
            uniq[u]["cited"] |= s["cited"]; uniq[u]["refs"].append(s["ref"])
            for k in ("snippet", "pub_date"):
                uniq[u][k] = uniq[u][k] or s[k]
        else:
            s = dict(s, url=u, refs=[s.pop("ref")]); uniq[u] = s
    return queries, list(uniq.values()), cited_refs, notes

def claude(raw):
    sources, queries, notes, cites = {}, [], [], 0
    for msg in raw["chat_messages"]:
        for b in msg["content"]:
            if b["type"] == "tool_use" and b.get("name") == "web_search":
                queries.append(b["input"].get("query"))
            elif b["type"] == "tool_result" and b.get("name") == "web_search":
                for r in b.get("content", []):
                    m = r.get("metadata") or {}
                    sources.setdefault(r["url"], {"url": r["url"], "title": r.get("title"),
                        "site": m.get("site_name"), "domain": m.get("site_domain"), "cited": False})
            elif b["type"] == "thinking":
                notes += [s.get("summary") for s in b.get("summaries") or []]
            elif b["type"] == "text":
                for c in b.get("citations") or []:
                    cites += 1
                    for s in c.get("sources") or [c]:
                        if s.get("url") in sources:
                            sources[s["url"]]["cited"] = True
    return queries, list(sources.values()), cites, notes

if __name__ == "__main__":
    path = sys.argv[1]
    raw = json.load(open(path, encoding="utf-8"))
    plat = "chatgpt" if "mapping" in raw else "claude"
    queries, sources, cites, notes = (chatgpt if plat == "chatgpt" else claude)(raw)
    n_c = sum(s["cited"] for s in sources)
    print(f"{plat}: {len(queries)} fan-out queries | {len(sources)} retrieved | {n_c} cited")
    for q in queries: print("  q:", q)
    print("  reasoning/status text:", notes)
    out = {"platform": plat, "fan_out_queries": queries, "retrieved": len(sources), "cited": n_c,
           "reasoning_status": notes, "sources": sources}
    json.dump(out, open(f"{plat}_final.json", "w", encoding="utf-8"), indent=2, ensure_ascii=False)
    with open(f"{plat}_sources.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(sources[0].keys())); w.writeheader(); w.writerows(sources)
