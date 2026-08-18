#!/usr/bin/env python3
"""WCAG AA contrast audit for Shiftly (CI).

Runs against a headless Chrome exposed on CDP and the built app served by
audit/serve.mjs (which proxies the API). Logs in via the seeded FAMILY
account, visits every route in both themes, samples visible text nodes,
resolves their effective background by walking up the DOM (compositing
alpha over the root background), and fails if any text is below WCAG AA
(4.5:1 normal, 3.0:1 for text >= 18px).

Env:
  CDP_PORT   Chrome CDP port (default 9222)
  APP_BASE   built app base URL (default http://localhost:5173/shiftly)
  API_BASE   API base URL (default http://localhost:3000)
  EMAIL      audit account email (default family@shiftly.test)
  PASSWORD   audit account password (default password123)

Exit codes: 0 = clean, 1 = low-contrast items found, 2 = setup/auth error.
"""
import json
import os
import re
import sys
import time
import urllib.request

import websocket

CDP = "http://127.0.0.1:" + os.environ.get("CDP_PORT", "9222")
BASE = os.environ.get("APP_BASE", "http://localhost:5173/shiftly")
API = os.environ.get("API_BASE", "http://localhost:3000")
EMAIL = os.environ.get("EMAIL", "family@shiftly.test")
PASSWORD = os.environ.get("PASSWORD", "password123")

ROUTES = [
    ("/", "home"),
    ("/tasks", "tasks"),
    ("/shopping", "shopping"),
    ("/care-profile", "care"),
    ("/incidents", "incidents"),
    ("/recurring", "recurring"),
    ("/calendar", "calendar"),
]


def get_token():
    req = urllib.request.Request(
        f"{API}/api/auth/login",
        data=json.dumps({"email": EMAIL, "password": PASSWORD}).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=15) as r:
        return json.loads(r.read())["accessToken"]


def http_cdp(path, method="GET", data=None):
    req = urllib.request.Request(CDP + path, method=method, data=data)
    with urllib.request.urlopen(req, timeout=30) as r:
        v = r.read()
        return json.loads(v) if v else {}


def parse_color(s):
    m = re.findall(r"[\d.]+", s or "")[:3]
    if len(m) != 3 or not (s or "").startswith("rgb"):
        return None
    return tuple(int(x) for x in m)


def alpha_tuple(s):
    m = re.match(r"rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)", s or "")
    if not m:
        return None
    parts = [float(m.group(i)) for i in (1, 2, 3)]
    alpha = float(m.group(4)) if m.group(4) else 1.0
    return tuple(parts) + (alpha,)


def lin(v):
    v = v / 255.0
    return v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4


def L(rgb):
    r, g, b = [lin(x) for x in rgb[:3]]
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def contrast(fg, bg):
    l1, l2 = L(fg), L(bg)
    if l1 < l2:
        l1, l2 = l2, l1
    return (l1 + 0.05) / (l2 + 0.05)


SAMPLE_JS = r"""(() => {
  const out = [];
  const cs0 = getComputedStyle(document.documentElement);
  const rootBg = cs0.backgroundColor;
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const seen = new Set();
  while (walker.nextNode()) {
    const n = walker.currentNode;
    const t = (n.textContent || '').trim();
    if (!t || t.length < 2 || t.length > 60) continue;
    const el = n.parentElement;
    if (!el) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2 || r.top > 10000) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || parseFloat(cs.opacity) < 0.2) continue;
    // walk up to find first non-transparent background
    let bg = 'rgba(0, 0, 0, 0)';
    let node = el;
    while (node && node !== document.documentElement) {
      const b = getComputedStyle(node).backgroundColor;
      if (b && !/rgba\(0, 0, 0, 0\)/.test(b)) { bg = b; break; }
      node = node.parentElement;
    }
    const key = t.slice(0, 30) + '|' + cs.color;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({t: t.slice(0, 40), c: cs.color, b: bg, fs: cs.fontSize});
  }
  const isLogin = !!document.querySelector('input[type="password"]');
  const onPath = location.pathname;
  return JSON.stringify({items: out, rootBg, isLogin, onPath});
})()"""


def audit(token, path, name, dark):
    targets = http_cdp("/json/list")
    pages = [t for t in targets if t["type"] == "page"]
    if not pages:
        pages = [http_cdp("/json/new?about:blank", method="PUT")]
    ws = websocket.create_connection(pages[0]["webSocketDebuggerUrl"], timeout=60)
    mid = [0]

    def send(method, params=None):
        mid[0] += 1
        ws.send(json.dumps({"id": mid[0], "method": method, "params": params or {}}))
        while True:
            m = json.loads(ws.recv())
            if m.get("id") == mid[0]:
                if m.get("error"):
                    raise RuntimeError(f"{method}: {m['error']}")
                return m["result"]

    def js(expr):
        return send("Runtime.evaluate", {"expression": expr, "returnByValue": True})["result"].get("value")

    theme = "dark" if dark else "light"
    send("Page.enable")
    # Seed localStorage on the APP origin: navigate there once without a token
    # (lands on the login page — harmless), then set keys, then reload.
    # Setting them before the first navigation would write to the tab's
    # current origin, not the app's.
    send("Page.navigate", {"url": BASE + "/"})
    time.sleep(2)
    js(
        f"localStorage.setItem('shiftly_theme', {json.dumps(theme)});"
        f"localStorage.setItem('shiftly_token', {json.dumps(token)})"
    )
    send("Page.navigate", {"url": BASE + path})
    time.sleep(5)

    data = js(SAMPLE_JS)
    ws.close()

    d = json.loads(data)
    if d.get("isLogin"):
        raise RuntimeError(f"[{theme} {path}] landed on the LOGIN page — auth failed (token/API down?)")
    root_bg = parse_color(d["rootBg"]) or (11, 18, 32)
    bad = []
    for it in d["items"]:
        fg = parse_color(it["c"])
        if fg is None:
            continue
        bg = parse_color(it["b"])
        if bg is None:
            bg = root_bg
        elif "rgba(" in it["b"]:
            bt = alpha_tuple(it["b"])
            if bt and bt[3] < 1:
                bg = tuple(round(x * bt[3] + y * (1 - bt[3])) for x, y in zip(bt[:3], root_bg))
        cr = contrast(fg, bg)
        fs = float(it["fs"].rstrip("px") or 16)
        threshold = 3.0 if fs >= 18 else 4.5
        if cr < threshold:
            bad.append((round(cr, 2), fs, it["t"], it["c"], it["b"]))
    print(f"[{theme} {name}] {d['onPath']} — sampled {len(d['items'])} texts, {len(bad)} below threshold", flush=True)
    for cr, fs, t, c, b in sorted(bad):
        print(f"    {cr:>5}x fs={fs:.0f}  {t!r:42} fg={c} bg={b}", flush=True)
    return bad


def main():
    try:
        token = get_token()
    except Exception as e:
        print(f"ERROR: login failed: {e}", file=sys.stderr)
        return 2
    total = 0
    try:
        for path, name in ROUTES:
            for dark in (False, True):
                total += len(audit(token, path, name, dark))
    except Exception as e:
        print(f"ERROR: {e}", file=sys.stderr)
        return 2
    print(f"TOTAL LOW-CONTRAST ITEMS: {total}")
    return 1 if total else 0


if __name__ == "__main__":
    sys.exit(main())
