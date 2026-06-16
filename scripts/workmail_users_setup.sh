#!/usr/bin/env bash
set -euo pipefail

ORG_ID="${ORG_ID:-m-aa88102360524a8284aeaa681f65818a}"
DOMAIN="${DOMAIN:-myflynai.com}"
AWS_REGION="${AWS_REGION:-us-east-1}"
OUT_FILE="${OUT_FILE:-/Users/ansh/Desktop/workmail_credentials_${DOMAIN}.txt}"
RESET_PASSWORDS="${RESET_PASSWORDS:-0}"

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || { echo "Missing required command: $1"; exit 1; }
}

require_cmd aws
require_cmd python3

rand_pass() {
  python3 - <<'PY'
import secrets, string
alphabet = string.ascii_letters + string.digits + '!@#%^*_-'
# Ensure complexity
p = 'A' + ''.join(secrets.choice(alphabet) for _ in range(22)) + '1!'
print(p)
PY
}

get_user_id_by_name() {
  local name="$1"
  aws workmail list-users --organization-id "$ORG_ID" --region "$AWS_REGION" \
    | python3 -c "import sys,json; d=json.load(sys.stdin); users=d.get('Users',[]); m=[u for u in users if u.get('Name')=='${name}']; print(m[0].get('Id','') if m else '')"
}

get_group_id_by_name() {
  local name="$1"
  aws workmail list-groups --organization-id "$ORG_ID" --region "$AWS_REGION" \
    | python3 -c "import sys,json; d=json.load(sys.stdin); gs=d.get('Groups',[]); m=[g for g in gs if g.get('Name')=='${name}']; print(m[0].get('Id','') if m else '')"
}

delete_group_if_exists() {
  local name="$1"
  local gid
  gid=$(get_group_id_by_name "$name")
  if [[ -z "$gid" ]]; then
    return 0
  fi

  # Free up the email address and remove the group so we can create a user mailbox with the same address.
  aws workmail deregister-from-work-mail --organization-id "$ORG_ID" --entity-id "$gid" --region "$AWS_REGION" >/dev/null || true
  aws workmail delete-group --organization-id "$ORG_ID" --group-id "$gid" --region "$AWS_REGION" >/dev/null || true
}

create_user_if_needed() {
  local name="$1"
  local display="$2"
  local email="$3"

  local uid
  uid=$(get_user_id_by_name "$name")
  if [[ -n "$uid" ]]; then
    if [[ "$RESET_PASSWORDS" == "1" ]]; then
      local pass
      pass=$(rand_pass)
      aws workmail reset-password --organization-id "$ORG_ID" --user-id "$uid" --password "$pass" --region "$AWS_REGION" >/dev/null
      printf '%s\n' "${email} TEMP_PASSWORD=${pass}" >> "$OUT_FILE"
    fi
    echo "$uid"
    return 0
  fi

  local pass
  pass=$(rand_pass)

  uid=$(aws workmail create-user --organization-id "$ORG_ID" --name "$name" --display-name "$display" --password "$pass" --region "$AWS_REGION" \
    | python3 -c "import sys,json; print(json.load(sys.stdin)['UserId'])")

  aws workmail register-to-work-mail --organization-id "$ORG_ID" --entity-id "$uid" --email "$email" --region "$AWS_REGION" >/dev/null

  printf '%s\n' "${email} TEMP_PASSWORD=${pass}" >> "$OUT_FILE"
  echo "$uid"
}

create_group_if_needed() {
  local name="$1"
  local email="$2"

  local gid
  gid=$(get_group_id_by_name "$name")
  if [[ -n "$gid" ]]; then
    echo "$gid"
    return 0
  fi

  gid=$(aws workmail create-group --organization-id "$ORG_ID" --name "$name" --region "$AWS_REGION" \
    | python3 -c "import sys,json; print(json.load(sys.stdin)['GroupId'])")

  aws workmail register-to-work-mail --organization-id "$ORG_ID" --entity-id "$gid" --email "$email" --region "$AWS_REGION" >/dev/null
  echo "$gid"
}

associate_member() {
  local gid="$1"
  local mid="$2"
  aws workmail associate-member-to-group --organization-id "$ORG_ID" --group-id "$gid" --member-id "$mid" --region "$AWS_REGION" >/dev/null || true
}

: > "$OUT_FILE"
chmod 600 "$OUT_FILE" || true

echo "WorkMail org: $ORG_ID ($AWS_REGION)" >> "$OUT_FILE"
echo "Webmail URL: https://flyn-office.awsapps.com/mail" >> "$OUT_FILE"
echo "" >> "$OUT_FILE"

erica_email="erica.j@${DOMAIN}"
roosevelt_email="a.roosevelt@${DOMAIN}"

u1=$(create_user_if_needed "erica.j" "Erica J" "$erica_email")
u2=$(create_user_if_needed "a.roosevelt" "A Roosevelt" "$roosevelt_email")

# support@ and marketing@ should be real mailboxes (users), not groups.
delete_group_if_exists "support"
delete_group_if_exists "marketing"

u_support=$(create_user_if_needed "support" "Support" "support@${DOMAIN}")
u_marketing=$(create_user_if_needed "marketing" "Marketing" "marketing@${DOMAIN}")

echo "" >> "$OUT_FILE"
echo "Mailboxes:" >> "$OUT_FILE"
echo "support@${DOMAIN} (userId=${u_support})" >> "$OUT_FILE"
echo "marketing@${DOMAIN} (userId=${u_marketing})" >> "$OUT_FILE"

echo "Done. Credentials (if any new users were created) written to: $OUT_FILE"
