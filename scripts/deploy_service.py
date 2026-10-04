#!/usr/bin/env python3
"""Deploy SeldonFrame as a Coolify **Service** (compose-based) in project "Agency Platform".

Why a Service and not an Application: in this Coolify version an Application with
build_pack=dockercompose cannot receive compose content over the API at all
(`docker_compose_raw` / `docker_compose` → "This field is not allowed"; the create payload
silently ignores it), and the repo's own compose is unusable as-is because its `app` service
references an `.env.docker` file that does not exist in the repo. A Service accepts the compose
on PATCH, base64-encoded.

Usage:
  python3 deploy_service.py --status | --dry-run | --deploy
"""
from __future__ import annotations

import argparse
import base64
import json
import os
import sys
import time
import urllib.error
import urllib.request

BASE = os.environ.get("COOLIFY_URL", "https://coolify.healingafterdivorce.com")
TOKEN_FILE = os.path.expanduser("~/.hermes/coolify-api-token")
SECRETS_FILE = os.path.expanduser("~/.hermes/seldonframe-secrets.env")
COMPOSE_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "docker-compose.service.yml")

PROJECT_NAME = "Agency Platform"
PROJECT_UUID = "yjmheoa3ldhswe6bxtqndovx"
SERVICE_NAME = "SeldonFrame"
HOST = "seldonframe.healingafterdivorce.com"
DOMAIN = f"https://{HOST}"
ENVIRONMENT_NAME = "production"
SERVER_UUID = "csk8wwwgwwo0kw8ogkgkccso"
APP_APP_UUID = "q8wodpgrtckgrdcvppc3onhb"  # the Application created first; removed once the Service is live
TERMINAL = {"finished", "failed", "cancelled-by-user"}


def token() -> str:
    with open(TOKEN_FILE) as fh:
        return fh.read().strip()


def secrets() -> dict[str, str]:
    out = {}
    with open(SECRETS_FILE) as fh:
        for line in fh:
            line = line.strip()
            if line and "=" in line and not line.startswith("#"):
                k, v = line.split("=", 1)
                out[k.strip()] = v.strip()
    return out


def api(path: str, method: str = "GET", body: dict | None = None, dry: bool = False):
    if dry and method != "GET":
        shown = json.dumps(body)[:200] if body is not None else ""
        print(f"  [dry-run] {method} {path} {shown}")
        return 0, {"_dry_run": True}
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(f"{BASE}/api/v1{path}", data=data, method=method)
    req.add_header("Authorization", f"Bearer {token()}")
    req.add_header("Accept", "application/json")
    if data:
        req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            raw = resp.read().decode()
            parsed = json.loads(raw) if raw.strip() else {}
            # keep lists intact: several endpoints (/services, /envs, /deployments) return arrays
            return resp.status, parsed if isinstance(parsed, (dict, list)) else {"_body": parsed}
    except urllib.error.HTTPError as e:
        txt = e.read().decode()[:400]
        try:
            parsed = json.loads(txt)
            return e.code, parsed if isinstance(parsed, (dict, list)) else {"_body": parsed}
        except Exception:  # noqa: BLE001
            return e.code, {"_body": txt}
    except Exception as e:  # noqa: BLE001
        return 0, {"_error": f"{type(e).__name__}: {e}"}


def find_service() -> dict | None:
    st, svcs = api("/services")
    if isinstance(svcs, list):
        for s in svcs:
            if (s.get("name") or "").strip().lower() == SERVICE_NAME.lower():
                return s
    return None


def status() -> int:
    svc = find_service()
    print(f"service {SERVICE_NAME!r}:", (svc or {}).get("uuid"), (svc or {}).get("status") or "NOT CREATED")
    if svc:
        st, envs = api(f"/services/{svc['uuid']}/envs")
        if isinstance(envs, list):
            print("  env keys:", sorted(e.get("key") for e in envs))
    st, apps = api("/applications")
    app = next((a for a in (apps or []) if a.get("uuid") == APP_APP_UUID), None) if isinstance(apps, list) else None
    if app:
        print(f"legacy application {APP_APP_UUID}: status={app.get('status')} (delete once the Service serves traffic)")
    st, deps = api("/deployments")
    for d in (deps if isinstance(deps, list) else [])[:5]:
        print(f"  deployment: {d.get('application_name')} {d.get('status')} {d.get('updated_at')} {d.get('deployment_uuid')}")
    return 0


def deploy(dry: bool) -> int:
    compose = open(COMPOSE_FILE).read()
    b64 = base64.b64encode(compose.encode()).decode()
    sec = secrets()

    svc = find_service()
    if svc:
        svc_uuid = svc["uuid"]
        print(f"service exists, reusing uuid={svc_uuid}")
    else:
        payload = {
            "name": SERVICE_NAME,
            "project_uuid": PROJECT_UUID,
            "environment_name": ENVIRONMENT_NAME,
            "server_uuid": SERVER_UUID,
            "description": "SeldonFrame — agency CRM (self-host compose: postgres + neon-http proxy + migrate + app)",
            "docker_compose_raw": b64,
        }
        st, body = api("/services", "POST", payload, dry=dry)
        print("create service:", st, json.dumps(body)[:220] if not dry else "")
        if dry:
            svc_uuid = "<new>"
        elif isinstance(body, dict) and body.get("uuid"):
            svc_uuid = body["uuid"]
        else:
            print("! service creation failed")
            return 1

    # Service compose must be PATCHed base64-encoded; create() silently drops it.
    st, body = api(f"/services/{svc_uuid}", "PATCH", {"docker_compose_raw": b64}, dry=dry)
    print("patch compose (base64):", st, json.dumps(body)[:200] if not dry else "")

    print("env keys to set:", sorted(sec.keys()))
    for key, value in sec.items():
        st, body = api(f"/services/{svc_uuid}/envs", "POST", {"key": key, "value": value}, dry=dry)
        print(f"  env {key}: {st}")

    if dry:
        print("  [dry-run] POST /deploy {uuid:", svc_uuid, "}")
        return 0

    st, body = api("/deploy", "POST", {"uuid": svc_uuid})
    print("deploy:", st, json.dumps(body)[:250] if isinstance(body, dict) else body)
    dep_uuid = None
    if isinstance(body, dict):
        deps = body.get("deployments") or []
        if deps:
            dep_uuid = deps[0].get("deployment_uuid")
    if st == 403:
        print("! token lacks 'deploy' — trying service start / instant_deploy fallbacks")
        for path, payload in ((f"/services/{svc_uuid}/start", None), (f"/services/{svc_uuid}", {"instant_deploy": True})):
            st2, body2 = api(path, "POST" if path.endswith("/start") else "PATCH", payload)
            print(f"  fallback {path}: {st2} {json.dumps(body2)[:150] if isinstance(body2, dict) else body2}")
            if st2 in (200, 201):
                break

    deadline = time.time() + 3600
    last = None
    while time.time() < deadline:
        time.sleep(20)
        st, deps = api("/deployments")
        dep = None
        for d in (deps if isinstance(deps, list) else []):
            if dep_uuid and d.get("deployment_uuid") == dep_uuid:
                dep = d
                break
            if not dep_uuid and d.get("application_name") == SERVICE_NAME:
                dep = d
                break
        if dep:
            s = dep.get("status")
            if s != last:
                print(f"  [{time.strftime('%H:%M:%S')}] {s} ({dep.get('deployment_uuid')})")
                last = s
            if s in TERMINAL:
                print("FINAL:", s)
                return 0 if s == "finished" else 1
    print("! timed out")
    return 1


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--status", action="store_true")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--deploy", action="store_true")
    a = ap.parse_args()
    if a.status:
        return status()
    if a.dry_run:
        return deploy(dry=True)
    if a.deploy:
        return deploy(dry=False)
    ap.print_help()
    return 1


if __name__ == "__main__":
    sys.exit(main())
