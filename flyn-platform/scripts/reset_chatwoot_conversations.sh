#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# Reset & re-seed Chatwoot conversations
# 1) Resolves ALL existing conversations (Chatwoot cloud has no delete API)
# 2) Creates fresh contacts + conversations with realistic messages
# ─────────────────────────────────────────────────────────────
set -euo pipefail

BASE_URL="https://app.chatwoot.com"
ACCOUNT_ID="154888"
TOKEN="YOUR_CHATWOOT_API_TOKEN"
API="$BASE_URL/api/v1/accounts/$ACCOUNT_ID"
HDR=(-H "Content-Type: application/json" -H "api_access_token: $TOKEN")

# ── Step 1: Resolve all existing open conversations ──────────
echo "═══════════════════════════════════════════════════"
echo "  Step 1: Closing all existing conversations"
echo "═══════════════════════════════════════════════════"

for STATUS in open pending snoozed; do
  PAGE=1
  while true; do
    RESP=$(curl -s "${HDR[@]}" "$API/conversations?status=$STATUS&page=$PAGE")
    IDS=$(echo "$RESP" | python3 -c "
import sys, json
data = json.load(sys.stdin)
payload = data.get('data', {}).get('payload', [])
if not payload:
    payload = data.get('payload', [])
for c in payload:
    print(c['id'])
" 2>/dev/null || true)

    if [ -z "$IDS" ]; then
      break
    fi

    for CID in $IDS; do
      # Resolve the conversation using toggle_status
      curl -s -X POST "${HDR[@]}" "$API/conversations/$CID/toggle_status" \
        -d '{"status":"resolved"}' > /dev/null
      echo "  ✅ Resolved conversation #$CID"
    done

    PAGE=$((PAGE + 1))
  done
done

echo ""
echo "═══════════════════════════════════════════════════"
echo "  Step 2: Finding inbox"
echo "═══════════════════════════════════════════════════"

INBOXES=$(curl -s "${HDR[@]}" "$API/inboxes")
INBOX_ID=$(echo "$INBOXES" | python3 -c "
import sys, json
data = json.load(sys.stdin)
inboxes = data.get('payload', [])
if not inboxes:
    print('')
else:
    print(inboxes[0]['id'])
" 2>/dev/null)

if [ -z "$INBOX_ID" ]; then
  echo "❌ No inboxes found!"
  exit 1
fi
echo "  Using inbox_id=$INBOX_ID"

# ── Helpers ──────────────────────────────────────────────────
create_contact() {
  local name="$1" email="$2" phone="$3"
  RESULT=$(curl -s -X POST "${HDR[@]}" "$API/contacts" \
    -d "{\"name\":\"$name\",\"email\":\"$email\",\"phone_number\":\"$phone\"}")

  # Try to get ID from response (new contact or existing)
  ID=$(echo "$RESULT" | python3 -c "
import sys, json
d = json.load(sys.stdin)
cid = d.get('id') or d.get('payload',{}).get('contact',{}).get('id','')
if not cid:
    # Contact already exists — search for it
    pass
print(cid)
" 2>/dev/null)

  # If contact already exists, search for it
  if [ -z "$ID" ]; then
    SEARCH=$(curl -s "${HDR[@]}" "$API/contacts/search?q=$email")
    ID=$(echo "$SEARCH" | python3 -c "
import sys, json
d = json.load(sys.stdin)
contacts = d.get('payload', [])
if contacts:
    print(contacts[0]['id'])
else:
    print('')
" 2>/dev/null)
  fi

  echo "$ID"
}

create_conversation_with_messages() {
  local contact_id="$1"
  shift
  # First arg after contact_id is the incoming message, rest are reply messages
  local incoming_msg="$1"
  shift

  # Create conversation
  CONV=$(curl -s -X POST "${HDR[@]}" "$API/conversations" \
    -d "{\"inbox_id\":$INBOX_ID,\"contact_id\":$contact_id,\"status\":\"open\"}")
  CONV_ID=$(echo "$CONV" | python3 -c "import sys,json; print(json.load(sys.stdin).get('id',''))" 2>/dev/null)

  if [ -z "$CONV_ID" ]; then
    echo "  ❌ Failed to create conversation for contact $contact_id"
    return
  fi

  # Post incoming message (from customer)
  curl -s -X POST "${HDR[@]}" "$API/conversations/$CONV_ID/messages" \
    -d "{\"content\":\"$incoming_msg\",\"message_type\":\"incoming\",\"private\":false}" > /dev/null

  echo "  ✅ Conversation #$CONV_ID created with message"
}

echo ""
echo "═══════════════════════════════════════════════════"
echo "  Step 3: Creating fresh contacts"
echo "═══════════════════════════════════════════════════"

C1=$(create_contact "Priya Sharma"     "priya.sharma@techworks.io"    "+919876543210")
C2=$(create_contact "James Mitchell"   "james.m@globeretail.com"      "+14085551234")
C3=$(create_contact "Sarah Chen"       "sarah.chen@startupx.co"       "+447700900123")
C4=$(create_contact "Raj Patel"        "raj.patel@finserve.in"        "+919988776655")
C5=$(create_contact "Maria Gonzalez"   "maria.g@designhub.mx"         "+525512345678")

echo "  Contact IDs: $C1, $C2, $C3, $C4, $C5"

echo ""
echo "═══════════════════════════════════════════════════"
echo "  Step 4: Creating fresh conversations"
echo "═══════════════════════════════════════════════════"

# Conversation 1 — Product inquiry / Sales lead
create_conversation_with_messages "$C1" \
  "Hi there! I saw your workflow automation platform and I'm really interested. We're a team of 50 engineers and we currently spend hours manually routing customer requests. Can you tell me more about your pricing plans and if you offer a free trial?"

# Conversation 2 — Support / Billing complaint
create_conversation_with_messages "$C2" \
  "I was charged twice for my subscription this month. Order #FL-20260312-0089. I need an immediate refund for the duplicate charge. This is the third billing issue I've had in 2 months."

# Conversation 3 — Technical help / Integration question
create_conversation_with_messages "$C3" \
  "Hey, we're trying to integrate your API with our Slack workspace but keep getting a 401 error. We followed the docs at docs.flyn.io/integrations but the webhook URL doesn't seem to be accepting our auth token. Can someone help?"

# Conversation 4 — Account upgrade request
create_conversation_with_messages "$C4" \
  "Hello, I'm currently on the Starter plan but our team has grown to 25 people and we need more workflow executions per month. What are the options for upgrading? Also, do you offer annual billing discounts?"

# Conversation 5 — Feature request / Feedback
create_conversation_with_messages "$C5" \
  "Love the visual builder! Quick feature request — it would be amazing if we could add conditional delays in workflows, like wait 2 hours if the customer sentiment is negative before sending a follow-up. Is this on your roadmap?"

echo ""
echo "═══════════════════════════════════════════════════"
echo "  ✅ Done! 5 fresh conversations created."
echo ""
echo "  Priya Sharma    → Product inquiry / Sales lead"
echo "  James Mitchell  → Billing complaint / Refund request"
echo "  Sarah Chen      → Technical support / API integration"
echo "  Raj Patel       → Account upgrade inquiry"
echo "  Maria Gonzalez  → Feature request / Feedback"
echo "═══════════════════════════════════════════════════"
