#!/bin/sh
set -eu
cd /root/seldonframe
python3 - <<'PYINNER'
from pathlib import Path
p=Path('docker-compose.yml')
s=p.read_text()
old='seldonframe-ezwd:sek-voice-init-fix-20261003'
assert s.count(old)==1, 'App image changed since this fix; inspect before rolling back'
p.write_text(s.replace(old,'seldonframe-ezwd:agency-scale-capfix-20261002'))
PYINNER
docker compose up -d --no-deps app
