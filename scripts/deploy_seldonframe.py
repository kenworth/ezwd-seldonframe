#!/usr/bin/env python3
"""Deploy SeldonFrame (github.com/seldonframe/seldonframe) into the Coolify project "Agency Platform".

Modes:
  --status    read-only: current app, its compose/domain settings, recent deployments
  --dry-run   prints every call that --deploy would make, writes nothing
  --deploy    creates/updates the app, sets env vars, deploys, polls to a terminal status

Secrets: read from ~/.hermes/seldonframe-secrets.env (0600) and ~/.hermes/coolify-api-token (0600).
Nothing secret is ever printed; only keys are shown.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.request

BASE = os.environ.get("COOLIFY_URL", "https://coolify.healingafterdivorce.com")
TOKEN_FILE = os.path.expanduser("~/.hermes/coolify-api-token")
SECRETS_FILE = os.path.expanduser("~/.hermes/seldonframe-secrets.env")
COMPOSE_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "docker-compose.coolify.yml")

PROJECT_NAME = "Agency Platform"
APP_NAME = "SeldonFrame"
HOST = "seldonframe.healingafterdivorce.com"
DOMAIN = f"https://{HOST}"
ENVIRONMENT_NAME = "production"
SERVER_NAME = "localhost"
REPO = "https://github.com/seldonframe/seldonframe"
BRANCH = "main"
COMPOSE_LOCATION = "/docker-compose.yml"
PORT = "3000"
COMPOSE_SERVICE = "app"

TERMINAL = {"finished", "failed", "cancelled-by-user"}


def token() -> str:
    with open(TOKEN_FILE) as fh:
        return fh.read().strip()


def secrets() -> dict[str, str]:
    out = {}
    with open(SECRETS_FILE) as fh:
        for line in fh:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                out[k.strip()] = v.strip()
    return out


def api(path: str, method: str = "GET", body: dict | None = None, dry: bool = False):
    if dry and method != "GET":
        print(f"  [dry-run] {method} {path}  body={json.dumps(body)[:160]}")
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
            return resp.status, (json.loads(raw) if raw.strip() else {})
    except urllib.error.HTTPError as e:
        body_txt = e.read().decode()[:500]
        try:
            parsed = json.loads(body_txt)
            return e.code, parsed if isinstance(parsed, dict) else {"_body": parsed}
        except Exception:  # noqa: BLE001
            return e.code, {"_body": body_txt}
    except Exception as e:  # noqa: BLE001
        return 0, {"_error": f"{type(e).__name__}: {e}"}


def find_project() -> tuple[str | None, str | None]:
    st, projects = api("/projects")
    if not isinstance(projects, list):
        print("! cannot list projects:", st, projects)
        return None, None
    for p in projects:
        if (p.get("name") or "").strip().lower() == PROJECT_NAME.lower():
            st2, detail = api(f"/projects/{p['uuid']}")
            env_name = None
            if isinstance(detail, dict):
                envs = detail.get("environments") or []
                names = [e.get("name") for e in envs]
                env_name = ENVIRONMENT_NAME if ENVIRONMENT_NAME in names else (names[0] if names else None)
            return p["uuid"], env_name
    return None, None


def find_server() -> str | None:
    st, servers = api("/servers")
    if isinstance(servers, list):
        for s in servers:
            if (s.get("name") or "").strip().lower() == SERVER_NAME:
                return s.get("uuid")
        if servers:
            return servers[0].get("uuid")
    return None


def find_app() -> dict | None:
    st, apps = api("/applications")
    if isinstance(apps, list):
        for a in apps:
            if (a.get("name") or "").strip().lower() == APP_NAME.lower():
                return a
    return None


def status() -> int:
    app = find_app()
    if not app:
        print(f"app {APP_NAME!r}: NOT CREATED")
    else:
        print(f"app {APP_NAME!r}: uuid={app.get('uuid')} status={app.get('status')} build={app.get('build_pack')} fqdn={app.get('fqdn')}")
        st, full = api(f"/applications/{app['uuid']}")
        if isinstance(full, dict):
            print("  compose location:", full.get("docker_compose_location"))
            print("  compose domains :", full.get("docker_compose_domains"))
            raw = full.get("docker_compose_raw") or ""
            print("  compose raw len :", len(raw))
            for marker in ("env_file: .env\n", "NEXT_PUBLIC_APP_URL: https://" + HOST, "WORKSPACE_BASE_DOMAIN", "expose:"):
                print(f"    marker {marker.strip()!r}:", marker in raw)
            print("  health check    :", full.get("health_check_path"), "start", full.get("health_check_start_period"), "retries", full.get("health_check_retries"))
        st, envs = api(f"/applications/{app['uuid']}/envs")
        if isinstance(envs, list):
            print("  env keys        :", sorted(e.get("key") for e in envs))
    st, deps = api("/deployments")
    if isinstance(deps, list):
        print("\nrecent deployments:")
        for d in deps[:6]:
            print(f"  - {d.get('application_name')}  {d.get('status')}  {d.get('created_at')}  uuid={d.get('deployment_uuid')}")
    return 0


def deploy(dry: bool) -> int:
    compose_raw = open(COMPOSE_FILE).read()
    sec = secrets()

    project_uuid, env_name = find_project()
    print(f"project {PROJECT_NAME!r}: {project_uuid} (env {env_name!r})")
    if not project_uuid:
        return 1
    server_uuid = find_server()
    print(f"server: {server_uuid}")

    app = find_app()
    if app:
        app_uuid = app["uuid"]
        print(f"app exists, reusing uuid={app_uuid}")
    else:
        payload = {
            "name": APP_NAME,
            "project_uuid": project_uuid,
            "environment_name": env_name,
            "server_uuid": server_uuid,
            "git_repository": REPO,
            "git_branch": BRANCH,
            "build_pack": "dockercompose",
            "docker_compose_location": COMPOSE_LOCATION,
            "docker_compose_domains": [{"name": COMPOSE_SERVICE, "domain": DOMAIN}],
            "ports_exposes": PORT,
            "instant_deploy": False,
            "is_auto_deploy_enabled": True,
            "health_check_enabled": True,
            "health_check_path": "/api/version",
            "health_check_scheme": "http",
            "health_check_return_code": 200,
            "health_check_start_period": 120,
            "health_check_interval": 15,
            "health_check_retries": 12,
            "health_check_timeout": 10,
        }
        st, body = api("/applications/public", "POST", payload, dry=dry)
        print("create app:", st, json.dumps(body)[:400] if not dry else "")
        if dry:
            app_uuid = "<new>"
        elif isinstance(body, dict) and body.get("uuid"):
            app_uuid = body["uuid"]
        else:
            print("! app creation failed")
            return 1

    update = {
        "docker_compose_raw": compose_raw,
        "docker_compose_domains": [{"name": COMPOSE_SERVICE, "domain": DOMAIN}],
        "ports_exposes": PORT,
        "build_pack": "dockercompose",
        "docker_compose_location": COMPOSE_LOCATION,
        "instant_deploy": False,
    }
    if not dry:
        st, body = api(f"/applications/{app_uuid}", "PATCH", update)
        print("patch compose:", st, json.dumps(body)[:200] if isinstance(body, dict) else body)
        st, full = api(f"/applications/{app_uuid}")
        raw = (full.get("docker_compose_raw") if isinstance(full, dict) else "") or ""
        print("  stored compose len:", len(raw), "| markers:",
              "env_file .env" if "env_file: .env\n" in raw else "MISSING env_file",
              "| public url" if f"NEXT_PUBLIC_APP_URL: {DOMAIN}" in raw else "| MISSING public url",
              "| base domain" if "WORKSPACE_BASE_DOMAIN" in raw else "| MISSING base domain",
              "| expose" if "expose:" in raw else "| MISSING expose")
    else:
        print("  [dry-run] PATCH /applications/<uuid> with compose", COMPOSE_FILE)

    env_data = [
        {"key": "NEXT_PUBLIC_APP_URL", "value": DOMAIN, "is_preview": False},
        {"key": "WORKSPACE_BASE_DOMAIN", "value": HOST, "is_preview": False},
        {"key": "NEXTAUTH_URL", "value": DOMAIN, "is_preview": False},
        {"key": "AUTH_URL", "value": DOMAIN, "is_preview": False},
        {"key": "AUTH_TRUST_HOST", "value": "true", "is_preview": False},
        {"key": "AUTH_SECRET", "value": sec["AUTH_SECRET"], "is_preview": False},
        {"key": "NEXTAUTH_SECRET", "value": sec["NEXTAUTH_SECRET"], "is_preview": False},
        {"key": "ENCRYPTION_KEY", "value": sec["ENCRYPTION_KEY"], "is_preview": False},
        {"key": "DO_NOT_TRACK", "value": "1", "is_preview": False},
    ]
    print("env keys to set:", sorted(e["key"] for e in env_data))
    if dry:
        print("  [dry-run] PATCH /applications/<uuid>/envs/bulk (values hidden)")
    else:
        st, body = api(f"/applications/{app_uuid}/envs/bulk", "PATCH", {"data": env_data})
        print("envs bulk:", st)
        st, envs = api(f"/applications/{app_uuid}/envs")
        if isinstance(envs, list):
            print("  env keys now:", sorted(e.get("key") for e in envs))

    if dry:
        print("  [dry-run] POST /deploy {uuid:", app_uuid, "}")
        return 0

    st, body = api("/deploy", "POST", {"uuid": app_uuid})
    print("deploy:", st, json.dumps(body)[:300] if isinstance(body, dict) else body)
    dep_uuid = None
    if isinstance(body, dict):
        deps = body.get("deployments") or []
        if deps:
            dep_uuid = deps[0].get("deployment_uuid")
    if st == 403:
        print("! token lacks 'deploy'; falling back to instant_deploy via PATCH")
        st, body = api(f"/applications/{app_uuid}", "PATCH", {"instant_deploy": True})
        print("instant_deploy:", st, json.dumps(body)[:200] if isinstance(body, dict) else body)

    deadline = time.time() + 3600
    last = None
    while time.time() < deadline:
        time.sleep(20)
        st, deps = api("/deployments")
        dep = None
        if isinstance(deps, list):
            for d in deps:
                if dep_uuid and d.get("deployment_uuid") == dep_uuid:
                    dep = d
                    break
                if not dep_uuid and d.get("application_name") == APP_NAME:
                    dep = d
                    break
        if dep:
            s = dep.get("status")
            if s != last:
                print(f"  [{time.strftime('%H:%M:%S')}] deployment status: {s}  ({dep.get('deployment_uuid')})")
                last = s
            if s in TERMINAL:
                print("FINAL:", s)
                return 0 if s == "finished" else 1
    print("! timed out waiting for a terminal deployment status")
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
