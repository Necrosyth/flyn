#!/usr/bin/env bash
set -euo pipefail

DOMAIN="${DOMAIN:-myflynai.com}"
CF_TOKEN="${CF_TOKEN:-}"
AWS_REGION="${AWS_REGION:-us-east-1}"

if [[ -z "${CF_TOKEN}" ]]; then
  echo "CF_TOKEN is required"
  exit 1
fi

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || { echo "Missing required command: $1"; exit 1; }
}

require_cmd curl
require_cmd python3
require_cmd aws

ZONE_ID=$(curl -s -X GET "https://api.cloudflare.com/client/v4/zones?name=${DOMAIN}" \
  -H "Authorization: Bearer ${CF_TOKEN}" \
  -H "Content-Type: application/json" | python3 -c "import sys,json; d=json.load(sys.stdin); r=d.get('result') or []; print(r[0]['id'] if r else '')")

if [[ -z "${ZONE_ID}" ]]; then
  echo "Could not find zone for ${DOMAIN}"
  exit 1
fi

echo "Zone: ${DOMAIN} (${ZONE_ID})"

cf_api() {
  local method="$1"; shift
  local url="$1"; shift
  local data="${1:-}"

  if [[ -n "${data}" ]]; then
    curl -s -X "${method}" "${url}" \
      -H "Authorization: Bearer ${CF_TOKEN}" \
      -H "Content-Type: application/json" \
      --data "${data}"
  else
    curl -s -X "${method}" "${url}" \
      -H "Authorization: Bearer ${CF_TOKEN}" \
      -H "Content-Type: application/json"
  fi
}

upsert_record() {
  local type="$1"
  local name="$2"
  local content="$3"
  local ttl="$4"
  local priority="${5:-}"
  local proxied="${6:-}"

  local fqdn
  if [[ "${name}" == "@" ]]; then
    fqdn="${DOMAIN}"
  else
    fqdn="${name}.${DOMAIN}"
  fi

  local lookup
  lookup=$(cf_api GET "https://api.cloudflare.com/client/v4/zones/${ZONE_ID}/dns_records?type=${type}&name=${fqdn}&per_page=100")
  local record_id
  record_id=$(echo "$lookup" | python3 -c "import sys,json; d=json.load(sys.stdin); r=d.get('result') or []; print(r[0]['id'] if r else '')")

  local payload
  if [[ "${type}" == "MX" ]]; then
    payload=$(python3 -c "import json; print(json.dumps({'type':'MX','name':'${fqdn}','content':'${content}','ttl':${ttl},'priority':int('${priority}') }))")
  elif [[ "${type}" == "CNAME" ]]; then
    payload=$(python3 -c "import json; print(json.dumps({'type':'CNAME','name':'${fqdn}','content':'${content}','ttl':${ttl},'proxied':False }))")
  else
    payload=$(python3 -c "import json; print(json.dumps({'type':'${type}','name':'${fqdn}','content':'${content}','ttl':${ttl} }))")
  fi

  if [[ -n "${record_id}" ]]; then
    echo "Updating ${type} ${fqdn}"
    cf_api PUT "https://api.cloudflare.com/client/v4/zones/${ZONE_ID}/dns_records/${record_id}" "${payload}" >/dev/null
  else
    echo "Creating ${type} ${fqdn}"
    cf_api POST "https://api.cloudflare.com/client/v4/zones/${ZONE_ID}/dns_records" "${payload}" >/dev/null
  fi
}

SES_TOKEN="${SES_TOKEN:-}"
DKIM_1="${DKIM_1:-}"
DKIM_2="${DKIM_2:-}"
DKIM_3="${DKIM_3:-}"

if [[ -z "${SES_TOKEN}" || -z "${DKIM_1}" || -z "${DKIM_2}" || -z "${DKIM_3}" ]]; then
  echo "SES_TOKEN, DKIM_1, DKIM_2, DKIM_3 are required"
  exit 1
fi

upsert_record "TXT" "_amazonses" "${SES_TOKEN}" 3600
upsert_record "MX" "@" "inbound-smtp.${AWS_REGION}.amazonaws.com" 3600 10
upsert_record "CNAME" "${DKIM_1}._domainkey" "${DKIM_1}.dkim.amazonses.com" 3600
upsert_record "CNAME" "${DKIM_2}._domainkey" "${DKIM_2}.dkim.amazonses.com" 3600
upsert_record "CNAME" "${DKIM_3}._domainkey" "${DKIM_3}.dkim.amazonses.com" 3600

echo "DNS records applied. Waiting for SES verification..."

attempts=30
sleep_seconds=20

for i in $(seq 1 "$attempts"); do
  ver=$(aws ses get-identity-verification-attributes --identities "${DOMAIN}" --region "${AWS_REGION}" | python3 -c "import sys,json; d=json.load(sys.stdin); a=(d.get('VerificationAttributes') or {}).get('${DOMAIN}',{}); print(a.get('VerificationStatus',''))")
  dkim=$(aws ses get-identity-dkim-attributes --identities "${DOMAIN}" --region "${AWS_REGION}" | python3 -c "import sys,json; d=json.load(sys.stdin); a=(d.get('DkimAttributes') or {}).get('${DOMAIN}',{}); print(a.get('DkimVerificationStatus',''))")
  echo "${i}/${attempts}: SES=${ver} DKIM=${dkim}"
  if [[ "${ver}" == "Success" && "${dkim}" == "Success" ]]; then
    echo "SES/DKIM verified."
    exit 0
  fi
  sleep "${sleep_seconds}"
done

echo "Timed out waiting for SES/DKIM verification. Check DNS propagation and try again."
exit 2
