"""
Batch runner for the citation tracker.

Sends each prompt in prompts.txt to ChatGPT and/or Claude, waits for the answer,
pulls the saved conversation JSON and prints queries / retrieved / cited.
Files land in ./out/ and can be dropped into the dashboard.

Usage
  python batch_runner.py --login                 # 1st time: log in, then press Enter
  python batch_runner.py                         # run all prompts on both platforms
  python batch_runner.py --platform chatgpt      # only one platform
  python batch_runner.py --channel chrome        # use your installed Google Chrome

Runs on your own logged-in account. Keep it to a few prompts, it can hit captchas.
"""
import argparse, json, re, sys, time
from pathlib import Path

from playwright.sync_api import sync_playwright, TimeoutError as PWTimeout
import parser as cite_parser  # ./parser.py

HERE = Path(__file__).parent
PROFILE = HERE / "browser-profile"
OUT = HERE / "out"

PLATFORMS = {
    "chatgpt": {
        "home": "https://chatgpt.com/",
        "box": "#prompt-textarea",
        "id_re": r"/c/([0-9a-f-]{36})",
        "fetch_js": """async (id) => {
            const s = await (await fetch('/api/auth/session')).json();
            const r = await fetch('/backend-api/conversation/' + id,
                      {headers: {Authorization: 'Bearer ' + s.accessToken}});
            return r.ok ? await r.text() : null; }""",
    },
    "claude": {
        "home": "https://claude.ai/new",
        "box": "div[contenteditable='true']",
        "id_re": r"/chat/([0-9a-f-]{36})",
        "fetch_js": """async (id) => {
            const c = (document.cookie.match(/lastActiveOrg=([^;]+)/) || [])[1];
            let orgs = c ? [c] : [];
            try { orgs.push(...(await (await fetch('/api/organizations')).json()).map(o => o.uuid)); } catch (e) {}
            for (const org of [...new Set(orgs)]) {
              const r = await fetch(`/api/organizations/${org}/chat_conversations/${id}?tree=True&rendering_mode=messages&render_all_tools=true`);
              if (r.ok) return await r.text();
            }
            return null; }""",
    },
}


def has_answer(platform, raw):
    if platform == "chatgpt":
        for node in (raw.get("mapping") or {}).values():
            m = node.get("message") or {}
            if (m.get("author") or {}).get("role") == "assistant":
                parts = (m.get("content") or {}).get("parts") or []
                if any(isinstance(p, str) and p.strip() for p in parts):
                    return True
        return False
    for msg in raw.get("chat_messages") or []:
        if msg.get("sender") == "assistant":
            for block in msg.get("content") or []:
                if block.get("type") == "text" and (block.get("text") or "").strip():
                    return True
    return False


def summarize(platform, raw):
    fn = cite_parser.chatgpt if platform == "chatgpt" else cite_parser.claude
    queries, sources, _cites, _notes = fn(raw)
    return queries, len(sources), sum(1 for s in sources if s.get("cited"))


def run_prompt(page, platform, prompt, idx, timeout_s):
    cfg = PLATFORMS[platform]
    page.goto(cfg["home"], wait_until="domcontentloaded")
    box = page.locator(cfg["box"]).first
    box.wait_for(state="visible", timeout=30000)
    box.click()
    page.keyboard.type(prompt, delay=15)
    time.sleep(0.5)
    page.keyboard.press("Enter")

    # chat id shows up in the URL once the message is sent
    deadline = time.time() + 60
    chat_id = None
    while time.time() < deadline and not chat_id:
        m = re.search(cfg["id_re"], page.url)
        chat_id = m.group(1) if m else None
        time.sleep(1)
    if not chat_id:
        raise RuntimeError("no chat id in URL - are you logged in? did a captcha appear?")
    print(f"   chat id {chat_id} - waiting for the answer...")

    # poll until the answer is there and the JSON stops growing
    deadline = time.time() + timeout_s
    last_len, stable, text = -1, 0, None
    while time.time() < deadline:
        time.sleep(4)
        text = page.evaluate(cfg["fetch_js"], chat_id)
        if not text:
            continue
        raw = json.loads(text)
        if has_answer(platform, raw) and len(text) == last_len:
            stable += 1
            if stable >= 2:
                break
        else:
            stable = 0
        last_len = len(text)
    if not text:
        raise RuntimeError("could not download the conversation (401? try --login again)")

    OUT.mkdir(exist_ok=True)
    path = OUT / f"{platform}_{idx:02d}.json"
    path.write_text(text, encoding="utf-8")
    queries, retrieved, cited = summarize(platform, json.loads(text))
    print(f"   saved {path.name}: {len(queries)} fan-out queries | {retrieved} retrieved | {cited} cited")
    for q in queries:
        print(f"     q: {q}")
    return {"platform": platform, "prompt": prompt, "chat_id": chat_id, "file": path.name,
            "queries": queries, "retrieved": retrieved, "cited": cited}


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--login", action="store_true", help="open the browser so you can log in once")
    ap.add_argument("--platform", choices=["chatgpt", "claude", "both"], default="both")
    ap.add_argument("--prompts", default=str(HERE / "prompts.txt"))
    ap.add_argument("--channel", default=None, help="e.g. 'chrome' to use installed Google Chrome")
    ap.add_argument("--timeout", type=int, default=240, help="seconds to wait per answer")
    args = ap.parse_args()

    plats = ["chatgpt", "claude"] if args.platform == "both" else [args.platform]
    with sync_playwright() as pw:
        ctx = pw.chromium.launch_persistent_context(
            str(PROFILE), headless=False, channel=args.channel,
            viewport={"width": 1280, "height": 860},
            args=["--disable-blink-features=AutomationControlled"])
        page = ctx.pages[0] if ctx.pages else ctx.new_page()

        if args.login:
            for p in plats:
                page.goto(PLATFORMS[p]["home"])
                input(f"Log in to {p} in the browser window (use email login), then press Enter here... ")
            print("Login saved in ./browser-profile. Now run: python batch_runner.py")
            ctx.close()
            return

        prompts = [l.strip() for l in Path(args.prompts).read_text(encoding="utf-8").splitlines()
                   if l.strip() and not l.startswith("#")]
        results = []
        for i, prompt in enumerate(prompts, 1):
            for p in plats:
                print(f"[{p}] prompt {i}/{len(prompts)}: {prompt}")
                try:
                    results.append(run_prompt(page, p, prompt, i, args.timeout))
                except (RuntimeError, PWTimeout) as e:
                    print(f"   FAILED: {e}")
                    results.append({"platform": p, "prompt": prompt, "error": str(e)})
                time.sleep(5)
        ctx.close()

    OUT.mkdir(exist_ok=True)
    (OUT / "summary.json").write_text(json.dumps(results, indent=2, ensure_ascii=False), encoding="utf-8")
    print("\nDone. Summary in out/summary.json")
    print("Drag the out/*.json files (not summary.json) into the dashboard's 'Add data' tab.")


if __name__ == "__main__":
    main()
