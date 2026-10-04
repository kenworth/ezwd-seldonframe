#!/usr/bin/env python3
"""Verify the SeldonFrame Coolify service end to end.

Checks DNS -> TLS -> app -> container state, without needing any credential for the
public side. The Coolify piece reads ~/.hermes/coolify-api-token (0600).

Usage: python3 verify-seldonframe.py [host]   (default ai.ezwderp.com)
"""
import base64, json, os, socket, ssl, sys, urllib.error, urllib.request

HOST = sys.argv[1] if len(sys.argv) > 1 else "ai.ezwderp.com"
SERVICE = "fubbrjt4nkczuv0wjcyitkan"  # Coolify service "SeldonFrame"
COOLIFY = "https://coolify.healingafterdivorce.com/api/v1"
EXPECT_IP = "SERVER_IP"
results = []


def record(ok, label, detail=""):
    results.append(ok)
    print(f"[{'PASS' if ok else 'FAIL'}] {label}" + (f": {detail}" if detail else ""))


def first_response(url, timeout=25):
    """GET without following redirects (urlopen follows by default)."""
    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, *a, **k):
            return None
    opener = urllib.request.build_opener(NoRedirect)
    try:
        with opener.open(url, timeout=timeout) as r:
            return r.status, r.headers.get("Location"), r.read(2000)
    except urllib.error.HTTPError as e:
        return e.code, e.headers.get("Location"), e.read(2000)


def doh(name):
    req = urllib.request.Request(
        f"https://cloudflare-dns.com/dns-query?name={name}&type=A",
        headers={"Accept": "application/dns-json"})
    return json.loads(urllib.request.urlopen(req, timeout=30).read())


# 1) DNS -> the Coolify host
try:
    d = doh(HOST)
    ips = {a["data"] for a in d.get("Answer", []) if a.get("type") == 1}
    chain = [a["data"] for a in d.get("Answer", []) if a.get("type") == 5]
    record(EXPECT_IP in ips, f"DNS {HOST} resolves to {EXPECT_IP}",
           f"A={sorted(ips) or 'none'} CNAME={chain or 'none'}")
except Exception as e:
    record(False, f"DNS lookup for {HOST}", str(e))

# 2) http -> https redirect
try:
    code, loc, _ = first_response(f"http://{HOST}/")
    record(code in (301, 302, 307, 308) and (loc or "").startswith("https://"),
           "http redirects to https", f"http {code} -> {loc}")
except Exception as e:
    record(False, "http->https redirect", str(e))

def cert_field(cert, field):
    """cert[field] is a tuple of RDNs: ((('commonName', 'x'),), ...)."""
    out = {}
    for rdn in (cert or {}).get(field) or []:
        for pair in rdn:
            try:
                k, v = pair
            except (TypeError, ValueError):
                continue
            out[k] = v
    return out


# 3) TLS certificate
try:
    ctx = ssl.create_default_context()
    with socket.create_connection((HOST, 443), timeout=25) as s:
        with ctx.wrap_socket(s, server_hostname=HOST) as ss:
            cert = ss.getpeercert()
    issuer = cert_field(cert, "issuer").get("organizationName")
    subject = cert_field(cert, "subject").get("commonName")
    record(subject == HOST, "TLS certificate valid",
           f"issuer={issuer} subject={subject} notAfter={(cert or {}).get('notAfter')}")
except Exception as e:
    record(False, "TLS certificate", str(e))

# 4) the app answers, and its own version endpoint
try:
    code, loc, body = first_response(f"https://{HOST}/")
    record(code in (200, 302, 307, 308), "https responds", f"http {code} -> {loc or ''}")
except Exception as e:
    record(False, "https responds", str(e))

try:
    with urllib.request.urlopen(f"https://{HOST}/api/version", timeout=25) as r:
        payload = r.read(400).decode("utf-8", "ignore")
    record(r.status == 200, "app healthcheck endpoint /api/version", f"200 {payload[:120]}")
except Exception as e:
    record(False, "app healthcheck endpoint /api/version", str(e))

# 4b) auth routes must not be pinned to a host that only exists inside the container.
#     app-host-redirect.ts pins /signup, /login and /record to NEXT_PUBLIC_APP_URL,
#     so a stale value (http://localhost:3000) sends real visitors nowhere.
try:
    for path in ("/signup", "/login"):
        code, loc, _ = first_response(f"https://{HOST}{path}")
        if code in (200,):
            record(True, f"{path} served directly", f"http {code}")
        elif loc:
            bad = "localhost" in loc or "127.0.0.1" in loc
            record(not bad, f"{path} redirect target is public",
                   f"http {code} -> {loc}" + ("  <-- NEXT_PUBLIC_APP_URL is wrong" if bad else ""))
        else:
            record(False, f"{path} responds", f"http {code}")
except Exception as e:
    record(False, "auth route check", str(e))

# 5) Coolify service + container state
try:
    tok = open(os.path.expanduser("~/.hermes/coolify-api-token")).read().strip()
    req = urllib.request.Request(f"{COOLIFY}/services/{SERVICE}",
                                 headers={"Authorization": "Bearer " + tok,
                                          "Accept": "application/json"})
    svc = json.loads(urllib.request.urlopen(req, timeout=45).read())
    print(f"[INFO] coolify service: {svc.get('name')} status={svc.get('status')}")
    for a in svc.get("applications") or []:
        print(f"[INFO]   app {a['name']:<12} status={a['status']:<9} fqdn={a.get('fqdn')}")
    for db in svc.get("databases") or []:
        print(f"[INFO]   db  {db['name']:<12} status={db['status']:<9} image={db['image']}")
    # 'migrate' is a one-shot job: excluded from status, expected to exit 0
    running = [a["name"] for a in svc.get("applications") or []
               if a["status"].startswith("running") and not a.get("exclude_from_status")]
    record(bool(running), "service has running containers", f"running={running or 'none'}")
except Exception as e:
    print("[INFO] coolify check skipped:", e)

print(f"\nRESULT: {'ALL CHECKS PASSED' if all(results) else 'FAILURES PRESENT'}")
sys.exit(0 if all(results) else 1)
