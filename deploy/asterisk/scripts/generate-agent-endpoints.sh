#!/usr/bin/env bash
# Generates pjsip agent endpoints from CortexCC export API or JSON file.
# Prefer sync-agent-endpoints.sh for local dev (writes conf + reloads Asterisk).
# Usage:
#   ./generate-agent-endpoints.sh endpoints.json > conf/pjsip_agents.conf
#   ./sync-agent-endpoints.sh

set -euo pipefail
INPUT="${1:-}"

if [[ -z "$INPUT" ]]; then
  echo "Usage: $0 endpoints.json" >&2
  exit 1
fi

python3 - "$INPUT" <<'PY'
import json, sys

data = json.load(open(sys.argv[1]))
for ep in data.get("endpoints", []):
    ext = ep["extension"]
    pwd = ep["password"]
    print(f"""[{ext}]
type=endpoint
context=from-internal
disallow=all
allow=ulaw
auth={ext}-auth
aors={ext}
transport=transport-wss
from_user={ext}
from_domain=localhost
webrtc=yes
media_encryption=dtls
dtls_auto_generate_cert=yes
ice_support=yes
rtcp_mux=yes
use_avpf=yes
media_use_received_transport=yes
direct_media=no
rtp_symmetric=yes
rewrite_contact=yes
force_rport=yes

[{ext}-auth]
type=auth
auth_type=userpass
username={ext}
password={pwd}

[{ext}]
type=aor
max_contacts=5
remove_existing=no
remove_unavailable=no
qualify_frequency=0
""")
PY
