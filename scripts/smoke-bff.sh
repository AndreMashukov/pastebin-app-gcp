#!/usr/bin/env bash
# smoke-bff.sh — exercise create → projection → read for the pastebin GCP stack.
set -euo pipefail

SMOKE_TEST_KEY="${SMOKE_TEST_KEY:-dev-smoke-key-change-me}"
PROJECT_ID="${PROJECT_ID:-your-gcp-project-id}"
REGION="${REGION:-asia-southeast1}"

AUTHOR_BFF_URL="${AUTHOR_BFF_URL:-https://author-bff-REPLACE-me.a.run.app}"
PUBLIC_BFF_URL="${PUBLIC_BFF_URL:-https://public-bff-REPLACE-me.a.run.app}"

PASTE_CONTENT="${PASTE_CONTENT:-console.log(\"smoke-$(date +%s)\");}"

ADC_FILE="${GOOGLE_APPLICATION_CREDENTIALS:-$HOME/.config/gcloud/application_default_credentials.json}"
if [[ ! -f "${ADC_FILE}" ]]; then
  echo "ERROR: ADC file not found at ${ADC_FILE}" >&2
  exit 1
fi

ID_TOKEN="$(python3 - <<PY
import json, urllib.parse, urllib.request
adc = json.load(open("${ADC_FILE}"))
data = urllib.parse.urlencode({
    "client_id": adc["client_id"],
    "client_secret": adc["client_secret"],
    "refresh_token": adc["refresh_token"],
    "grant_type": "refresh_token",
}).encode()
req = urllib.request.Request("https://oauth2.googleapis.com/token", data=data, method="POST")
resp = json.load(urllib.request.urlopen(req))
print(resp["id_token"])
PY
)"

echo "== smoke-pastebin =="
echo "AUTHOR_BFF_URL=${AUTHOR_BFF_URL}"
echo "PUBLIC_BFF_URL=${PUBLIC_BFF_URL}"
echo

echo "== 1) POST ${AUTHOR_BFF_URL}/pastes =="
CREATE_RESP="$(curl -sS -w '\nHTTP_STATUS:%{http_code}\n' \
  -X POST "${AUTHOR_BFF_URL}/pastes" \
  -H "Authorization: Bearer ${ID_TOKEN}" \
  -H "X-Smoke-Test: ${SMOKE_TEST_KEY}" \
  -H "Content-Type: application/json" \
  -d "{\"content\":$(python3 -c 'import json,sys; print(json.dumps(sys.argv[1]))' "${PASTE_CONTENT}"),\"contentType\":\"application/javascript\"}")"
echo "${CREATE_RESP}"
CREATE_BODY="$(echo "${CREATE_RESP}" | sed '/^HTTP_STATUS:/d')"
CREATE_STATUS="$(echo "${CREATE_RESP}" | sed -n 's/^HTTP_STATUS://p')"
PASTE_ID="$(echo "${CREATE_BODY}" | python3 -c 'import sys,json; print(json.load(sys.stdin).get("pasteId",""))' 2>/dev/null || true)"

if [[ -z "${PASTE_ID}" ]]; then
  echo "ERROR: no pasteId in create response (status=${CREATE_STATUS})" >&2
  exit 1
fi
echo "pasteId=${PASTE_ID}"
echo

echo "== 2) wait 15s for Eventarc → bus → lean_view =="
sleep 15
echo

echo "== 3) GET ${PUBLIC_BFF_URL}/p/${PASTE_ID}/meta =="
META_RESP="$(curl -sS -w '\nHTTP_STATUS:%{http_code}\n' \
  -X GET "${PUBLIC_BFF_URL}/p/${PASTE_ID}/meta")"
echo "${META_RESP}"
echo

echo "== 4) GET ${PUBLIC_BFF_URL}/p/${PASTE_ID} =="
BODY_RESP="$(curl -sS -w '\nHTTP_STATUS:%{http_code}\n' \
  -X GET "${PUBLIC_BFF_URL}/p/${PASTE_ID}")"
echo "${BODY_RESP}"
echo

echo "== 5) GET ${AUTHOR_BFF_URL}/me/pastes =="
LIST_RESP="$(curl -sS -w '\nHTTP_STATUS:%{http_code}\n' \
  -X GET "${AUTHOR_BFF_URL}/me/pastes" \
  -H "Authorization: Bearer ${ID_TOKEN}" \
  -H "X-Smoke-Test: ${SMOKE_TEST_KEY}")"
echo "${LIST_RESP}"
echo

echo "== done =="
echo "create_status=${CREATE_STATUS} pasteId=${PASTE_ID}"
