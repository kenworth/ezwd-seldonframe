#!/usr/bin/env python3
"""Read-only status probe for the SeldonFrame deployment on Coolify. Prints nothing secret."""
import json
import os
import sys
import urllib.error
import urllib.request

BASE = os.environ.get("COOLIFY_URL", "https://coolify.healingafterdivorce.com")
TOKEN_FILE = os.path.expanduser("~/.hermes/coolify-api-token")


def token() -> str:
    with open(TOKEN_FILE) as fh:
        return fh.read().strip()


def api(path: str, method: str = "GET", body: dict | None = None):
    url = f"{BASE}/api/v1{path}"
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Authorization", f"Bearer {token()}")
    req.add_header("Accept", "application/json")
    if data:
        req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=45) as resp:
            raw = resp.read().decode()
            return resp.status, (json.loads(raw) if raw.strip() else {})
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()[:300]
    except Exception as e:  # noqa: BLE001
        return 0, f"{type(e).__name__}: {e}"


def main() -> int:
    print(f"base: {BASE}")
    print("health:", api("/health"))

    st, servers = api("/servers")
    print(f"\nservers ({st}):")
    if isinstance(servers, list):
        for s in servers:
            print(f"  - {s.get('name')}  uuid={s.get('uuid')}  ip={s.get('ip')}  proxy={ (s.get('proxy') or {}).get('type') }  dynamic_timeout={(s.get('settings') or {}).get('dynamic_timeout')}")
    else:
        print("  ", servers)

    st, projects = api("/projects")
    print(f"\nprojects ({st}):")
    if isinstance(projects, list):
        for p in projects:
            print(f"  - {p.get('name')!r}  uuid={p.get('uuid')}  apps={len(p.get('applications') or [])}  services={len(p.get('services') or [])}  dbs={len(p.get('databases') or [])}")
    else:
        print("  ", projects)

    st, apps = api("/applications")
    print(f"\napplications ({st}):")
    if isinstance(apps, list):
        for a in apps:
            print(f"  - {a.get('name')!r}  uuid={a.get('uuid')}  status={a.get('status')}  build={a.get('build_pack')}  fqdn={a.get('fqdn')}")
    else:
        print("  ", apps)

    st, services = api("/services")
    print(f"\nservices ({st}):")
    if isinstance(services, list):
        for s in services:
            print(f"  - {s.get('name')!r}  uuid={s.get('uuid')}  status={s.get('status')}  type={s.get('service_type')}")

    st, deploy = api("/deployments")
    print(f"\nrecent deployments ({st}):")
    if isinstance(deploy, list):
        for d in deploy[:5]:
            print(f"  - {d.get('application_name')}  {d.get('status')}  {d.get('created_at')}  uuid={d.get('deployment_uuid')}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
