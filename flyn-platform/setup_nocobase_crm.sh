#!/usr/bin/env bash
# =============================================================================
# NocoBase CRM Setup Script
# Creates contacts / deals / activities collections + seeds demo data
# =============================================================================

set -euo pipefail

BASE="http://localhost:13000"
EMAIL="admin@nocobase.com"
PASS="admin123"

echo "🔐  Authenticating with NocoBase..."
TOKEN=$(curl -s -X POST "$BASE/api/auth:signIn" \
  -H "Content-Type: application/json" \
  -d "{\"account\":\"$EMAIL\",\"password\":\"$PASS\"}" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['token'])")

if [[ -z "$TOKEN" ]]; then
  echo "❌  Login failed. Check that NocoBase is running at $BASE"
  exit 1
fi
echo "✅  Authenticated"

# Helper: authenticated POST
nb_post() {
  local path="$1"; shift
  local body="$1"
  curl -s -X POST "$BASE$path" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TOKEN" \
    -d "$body"
}

# Helper: create a collection (silently ignores "already exists")
create_collection() {
  local name="$1" title="$2"
  echo "📦  Creating collection: $name"
  nb_post "/api/collections:create" \
    "{\"name\":\"$name\",\"title\":\"$title\",\"timestamps\":true,\"paranoid\":false}" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print('  →', d.get('data',{}).get('name') or d.get('errors') or d)" 2>/dev/null || true
}

# Helper: add a field to a collection
add_field() {
  local col="$1" fname="$2" ftype="$3" extra="${4:-{}}"
  nb_post "/api/collections/$col/fields:create" \
    "{\"name\":\"$fname\",\"type\":\"$ftype\",\"uiSchema\":{\"title\":\"$fname\"},\"interface\":\"input\",$extra}" \
  > /dev/null 2>&1 || true
}

# =============================================================================
# 1. CREATE COLLECTIONS
# =============================================================================
create_collection "contacts" "Contacts"
create_collection "deals"    "Deals"
create_collection "activities" "Activities"

# =============================================================================
# 2. ADD FIELDS — contacts
# =============================================================================
echo "🔧  Adding fields to contacts..."
nb_post "/api/collections/contacts/fields:create" \
  '{"name":"name","type":"string","interface":"input","uiSchema":{"title":"Name","x-component":"Input"}}' > /dev/null
nb_post "/api/collections/contacts/fields:create" \
  '{"name":"email","type":"string","interface":"email","uiSchema":{"title":"Email","x-component":"Input"}}' > /dev/null
nb_post "/api/collections/contacts/fields:create" \
  '{"name":"phone","type":"string","interface":"input","uiSchema":{"title":"Phone","x-component":"Input"}}' > /dev/null
nb_post "/api/collections/contacts/fields:create" \
  '{"name":"company","type":"string","interface":"input","uiSchema":{"title":"Company","x-component":"Input"}}' > /dev/null
nb_post "/api/collections/contacts/fields:create" \
  '{"name":"status","type":"string","interface":"select","uiSchema":{"title":"Status","x-component":"Select","enum":[{"value":"lead","label":"Lead"},{"value":"qualified","label":"Qualified"},{"value":"customer","label":"Customer"},{"value":"churned","label":"Churned"},{"value":"inactive","label":"Inactive"}]}}' > /dev/null
nb_post "/api/collections/contacts/fields:create" \
  '{"name":"source","type":"string","interface":"input","uiSchema":{"title":"Source","x-component":"Input"}}' > /dev/null
nb_post "/api/collections/contacts/fields:create" \
  '{"name":"score","type":"integer","interface":"integer","uiSchema":{"title":"Score","x-component":"InputNumber"}}' > /dev/null
nb_post "/api/collections/contacts/fields:create" \
  '{"name":"notes","type":"text","interface":"textarea","uiSchema":{"title":"Notes","x-component":"Input.TextArea"}}' > /dev/null
nb_post "/api/collections/contacts/fields:create" \
  '{"name":"tags","type":"json","interface":"json","uiSchema":{"title":"Tags","x-component":"Input"}}' > /dev/null
nb_post "/api/collections/contacts/fields:create" \
  '{"name":"owner","type":"string","interface":"input","uiSchema":{"title":"Owner","x-component":"Input"}}' > /dev/null

# =============================================================================
# 3. ADD FIELDS — deals
# =============================================================================
echo "🔧  Adding fields to deals..."
nb_post "/api/collections/deals/fields:create" \
  '{"name":"title","type":"string","interface":"input","uiSchema":{"title":"Title","x-component":"Input"}}' > /dev/null
nb_post "/api/collections/deals/fields:create" \
  '{"name":"value","type":"double","interface":"number","uiSchema":{"title":"Value","x-component":"InputNumber"}}' > /dev/null
nb_post "/api/collections/deals/fields:create" \
  '{"name":"stage","type":"string","interface":"select","uiSchema":{"title":"Stage","x-component":"Select","enum":[{"value":"new","label":"New"},{"value":"qualified","label":"Qualified"},{"value":"proposal","label":"Proposal"},{"value":"negotiation","label":"Negotiation"},{"value":"won","label":"Won"},{"value":"lost","label":"Lost"}]}}' > /dev/null
nb_post "/api/collections/deals/fields:create" \
  '{"name":"contactId","type":"integer","interface":"integer","uiSchema":{"title":"Contact ID","x-component":"InputNumber"}}' > /dev/null
nb_post "/api/collections/deals/fields:create" \
  '{"name":"probability","type":"integer","interface":"integer","uiSchema":{"title":"Probability %","x-component":"InputNumber"}}' > /dev/null
nb_post "/api/collections/deals/fields:create" \
  '{"name":"owner","type":"string","interface":"input","uiSchema":{"title":"Owner","x-component":"Input"}}' > /dev/null
nb_post "/api/collections/deals/fields:create" \
  '{"name":"notes","type":"text","interface":"textarea","uiSchema":{"title":"Notes","x-component":"Input.TextArea"}}' > /dev/null
nb_post "/api/collections/deals/fields:create" \
  '{"name":"expectedCloseDate","type":"date","interface":"date","uiSchema":{"title":"Expected Close","x-component":"DatePicker"}}' > /dev/null

# =============================================================================
# 4. ADD FIELDS — activities
# =============================================================================
echo "🔧  Adding fields to activities..."
nb_post "/api/collections/activities/fields:create" \
  '{"name":"type","type":"string","interface":"select","uiSchema":{"title":"Type","x-component":"Select","enum":[{"value":"email","label":"Email"},{"value":"call","label":"Call"},{"value":"meeting","label":"Meeting"},{"value":"note","label":"Note"},{"value":"task","label":"Task"},{"value":"deal_update","label":"Deal Update"}]}}' > /dev/null
nb_post "/api/collections/activities/fields:create" \
  '{"name":"description","type":"text","interface":"textarea","uiSchema":{"title":"Description","x-component":"Input.TextArea"}}' > /dev/null
nb_post "/api/collections/activities/fields:create" \
  '{"name":"actor","type":"string","interface":"input","uiSchema":{"title":"Actor","x-component":"Input"}}' > /dev/null
nb_post "/api/collections/activities/fields:create" \
  '{"name":"contactId","type":"integer","interface":"integer","uiSchema":{"title":"Contact ID","x-component":"InputNumber"}}' > /dev/null
nb_post "/api/collections/activities/fields:create" \
  '{"name":"dealId","type":"integer","interface":"integer","uiSchema":{"title":"Deal ID","x-component":"InputNumber"}}' > /dev/null

echo "✅  Collections and fields created"

# =============================================================================
# 5. SEED — Contacts
# =============================================================================
echo "🌱  Seeding contacts..."

seed_contact() {
  nb_post "/api/contacts:create" "$1" \
    | python3 -c "import sys,json; d=json.load(sys.stdin); print('  + Contact:', d.get('data',{}).get('name','?'))" 2>/dev/null || true
}

seed_contact '{"name":"Sarah Chen","email":"sarah@techcorp.io","phone":"+1-555-0101","company":"TechCorp","status":"customer","source":"Website","score":92,"tags":["enterprise","tech"],"owner":"Admin"}'
seed_contact '{"name":"James Wilson","email":"james@startupxyz.com","phone":"+1-555-0102","company":"StartupXYZ","status":"qualified","source":"Referral","score":78,"tags":["startup"],"owner":"Admin"}'
seed_contact '{"name":"Maria Garcia","email":"maria@innovate.co","phone":"+1-555-0103","company":"Innovate Co","status":"lead","source":"LinkedIn","score":65,"tags":["saas"],"owner":"Admin"}'
seed_contact '{"name":"Alex Kumar","email":"alex@megaent.com","phone":"+1-555-0104","company":"MegaEnterprise","status":"customer","source":"Event","score":88,"tags":["enterprise"],"owner":"Admin"}'
seed_contact '{"name":"Emily Davis","email":"emily@cloudnine.io","phone":"+1-555-0105","company":"CloudNine","status":"qualified","source":"Social","score":71,"tags":["cloud"],"owner":"Admin"}'
seed_contact '{"name":"David Park","email":"david@nexustech.ai","phone":"+1-555-0106","company":"NexusTech","status":"lead","source":"Website","score":55,"tags":["ai","startup"],"owner":"Admin"}'
seed_contact '{"name":"Rachel Torres","email":"rachel@brightmind.edu","phone":"+1-555-0107","company":"BrightMind","status":"qualified","source":"Referral","score":82,"tags":["education"],"owner":"Admin"}'
seed_contact '{"name":"Michael Brown","email":"michael@scalehq.com","phone":"+1-555-0108","company":"ScaleHQ","status":"customer","source":"Event","score":95,"tags":["enterprise","cloud"],"owner":"Admin"}'
seed_contact '{"name":"Priya Sharma","email":"priya@fintechglobal.com","phone":"+1-555-0109","company":"FintechGlobal","status":"lead","source":"Social","score":60,"tags":["fintech"],"owner":"Admin"}'
seed_contact '{"name":"Chris Johnson","email":"chris@retailmax.com","phone":"+1-555-0110","company":"RetailMax","status":"inactive","source":"Website","score":30,"tags":["retail"],"owner":"Admin"}'

# =============================================================================
# 6. SEED — Deals
# =============================================================================
echo "🌱  Seeding deals..."

seed_deal() {
  nb_post "/api/deals:create" "$1" \
    | python3 -c "import sys,json; d=json.load(sys.stdin); print('  + Deal:', d.get('data',{}).get('title','?'))" 2>/dev/null || true
}

seed_deal '{"title":"TechCorp Enterprise License","value":45000,"stage":"won","contactId":1,"probability":100,"owner":"Admin","notes":"3-year enterprise contract signed","expectedCloseDate":"2026-01-15"}'
seed_deal '{"title":"StartupXYZ Growth Plan","value":12000,"stage":"proposal","contactId":2,"probability":60,"owner":"Admin","notes":"Proposal sent, awaiting review","expectedCloseDate":"2026-03-20"}'
seed_deal '{"title":"Innovate Co Pilot Program","value":7500,"stage":"new","contactId":3,"probability":20,"owner":"Admin","notes":"Initial discovery call completed","expectedCloseDate":"2026-04-30"}'
seed_deal '{"title":"MegaEnterprise Platform Expansion","value":78000,"stage":"negotiation","contactId":4,"probability":75,"owner":"Admin","notes":"Final pricing discussion underway","expectedCloseDate":"2026-03-05"}'
seed_deal '{"title":"CloudNine Starter Bundle","value":15000,"stage":"qualified","contactId":5,"probability":45,"owner":"Admin","notes":"Technical requirements confirmed","expectedCloseDate":"2026-03-30"}'
seed_deal '{"title":"NexusTech AI Integration","value":32000,"stage":"qualified","contactId":6,"probability":50,"owner":"Admin","notes":"POC scheduled for next week","expectedCloseDate":"2026-04-15"}'
seed_deal '{"title":"BrightMind EDU License","value":25000,"stage":"proposal","contactId":7,"probability":65,"owner":"Admin","notes":"Procurement review in progress","expectedCloseDate":"2026-03-25"}'
seed_deal '{"title":"ScaleHQ Premium Tier","value":95000,"stage":"won","contactId":8,"probability":100,"owner":"Admin","notes":"Upsell from starter — huge win","expectedCloseDate":"2026-02-10"}'
seed_deal '{"title":"FintechGlobal Compliance Suite","value":18000,"stage":"new","contactId":9,"probability":15,"owner":"Admin","notes":"Sent intro deck","expectedCloseDate":"2026-05-01"}'
seed_deal '{"title":"RetailMax Seasonal Push","value":9500,"stage":"lost","contactId":10,"probability":0,"owner":"Admin","notes":"Budget cut — revisit Q3","expectedCloseDate":"2026-02-28"}'

# =============================================================================
# 7. SEED — Activities
# =============================================================================
echo "🌱  Seeding activities..."

seed_activity() {
  nb_post "/api/activities:create" "$1" > /dev/null 2>&1 || true
}

seed_activity '{"type":"call","description":"Discovery call with Sarah — confirmed enterprise interest","actor":"Admin","contactId":1}'
seed_activity '{"type":"email","description":"Sent proposal PDF to James Wilson","actor":"Admin","contactId":2}'
seed_activity '{"type":"meeting","description":"Demo session with Maria Garcia at Innovate Co HQ","actor":"Admin","contactId":3}'
seed_activity '{"type":"deal_update","description":"MegaEnterprise deal moved to Negotiation stage","actor":"Admin","contactId":4,"dealId":4}'
seed_activity '{"type":"note","description":"Emily asked for a custom integration estimate","actor":"Admin","contactId":5}'
seed_activity '{"type":"task","description":"Follow up with David Park re: AI pilot timeline","actor":"Admin","contactId":6}'
seed_activity '{"type":"call","description":"Qualification call with Rachel Torres — strong fit","actor":"Admin","contactId":7}'
seed_activity '{"type":"deal_update","description":"ScaleHQ deal WON — \$95K closed","actor":"Admin","contactId":8,"dealId":8}'
seed_activity '{"type":"email","description":"Intro email sent to Priya at FintechGlobal","actor":"Admin","contactId":9}'
seed_activity '{"type":"note","description":"Chris Johnson — budget cut this quarter, re-engage Q3","actor":"Admin","contactId":10}'
seed_activity '{"type":"meeting","description":"TechCorp contract review and onboarding kickoff","actor":"Admin","contactId":1,"dealId":1}'
seed_activity '{"type":"call","description":"Checked in on NexusTech POC progress","actor":"Admin","contactId":6}'

echo ""
echo "🎉  Done! NocoBase CRM is seeded with:"
echo "   • 10 contacts (leads, qualified, customers, inactive)"
echo "   • 10 deals (all pipeline stages: new→won)"
echo "   • 12 activities (calls, emails, meetings, notes)"
echo ""
echo "🌐  NocoBase admin:  http://localhost:13000"
echo "📊  CRM dashboard:  http://localhost (via your frontend)"
