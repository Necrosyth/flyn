#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# Seed test conversations into Chatwoot
# Usage: bash seed_chatwoot.sh
# ─────────────────────────────────────────────────────────────

BASE_URL="http://54.167.75.154"
# Using the values from backend/.env if possible, but keeping defaults here for now
ACCOUNT_ID="1"
TOKEN="YOUR_CHATWOOT_API_TOKEN"
API="$BASE_URL/api/v1/accounts/$ACCOUNT_ID"
HDR=(-H "Content-Type: application/json" -H "api_access_token: $TOKEN")

echo "🔍 Fetching inboxes..."
INBOXES=$(curl -s "${HDR[@]}" "$API/inboxes")
echo "$INBOXES" | python3 -c "
import sys, json
data = json.load(sys.stdin)
inboxes = data.get('payload', [])
if not inboxes:
    print('❌ No inboxes found. Create one first in Chatwoot Settings → Inboxes.')
    sys.exit(1)
for i in inboxes:
    print(f'  inbox_id={i[\"id\"]}  name={i[\"name\"]}  channel={i[\"channel_type\"]}')
" || { echo "❌ Failed to fetch inboxes"; exit 1; }

# ── Pick first inbox id ─────────────────────────────────────
INBOX_ID=$(echo "$INBOXES" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['payload'][0]['id'])" 2>/dev/null)
if [ -z "$INBOX_ID" ]; then
  echo ""
  echo "❌ No inboxes found. Please create an inbox first:"
  echo "   https://app.chatwoot.com/app/accounts/$ACCOUNT_ID/settings/inboxes/new"
  exit 1
fi
echo ""
echo "✅ Using inbox_id=$INBOX_ID"

# ── Helper: create contact ───────────────────────────────────
create_contact() {
  local name="$1" email="$2" phone="$3"
  curl -s -X POST "${HDR[@]}" "$API/contacts" \
    -d "{\"name\":\"$name\",\"email\":\"$email\",\"phone_number\":\"$phone\"}" \
    | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('id','') or d.get('payload',{}).get('contact',{}).get('id',''))"
}

# ── Helper: create conversation + opening message ────────────
create_conversation() {
  local contact_id="$1" message="$2"
  CONV=$(curl -s -X POST "${HDR[@]}" "$API/conversations" \
    -d "{\"inbox_id\":$INBOX_ID,\"contact_id\":$contact_id}")
  CONV_ID=$(echo "$CONV" | python3 -c "import sys,json; print(json.load(sys.stdin).get('id',''))")
  if [ -n "$CONV_ID" ]; then
    # Post the incoming message as the customer
    curl -s -X POST "${HDR[@]}" "$API/conversations/$CONV_ID/messages" \
      -d "{\"content\":\"$message\",\"message_type\":\"incoming\",\"private\":false}" > /dev/null
    echo "  ✅ Conversation #$CONV_ID created"
  else
    echo "  ❌ Failed to create conversation for contact $contact_id"
    echo "     $CONV"
  fi
}

echo ""
echo "👤 Creating test contacts..."
C1=$(create_contact "Alice Johnson" "alice@example.com" "+14155550101")
C2=$(create_contact "Bob Smith"     "bob@example.com"   "+14155550102")
C3=$(create_contact "Carol White"   "carol@example.com" "+14155550103")
echo "  contact ids: $C1, $C2, $C3"

echo ""
echo "💬 Creating test conversations..."
create_conversation "$C1" "Hi, I need help with my recent order. It hasn't arrived yet and I'm very frustrated."
create_conversation "$C2" "Hey! Just wanted to say your product is amazing. Everything works perfectly, thank you!"
create_conversation "$C3" "I've been waiting for a refund for 2 weeks now. This is completely unacceptable."

echo ""
echo "🎉 Done! Check your inbox:"
echo "   https://app.chatwoot.com/app/accounts/$ACCOUNT_ID/conversations"
