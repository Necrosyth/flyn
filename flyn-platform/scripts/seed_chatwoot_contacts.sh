#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# Seed all Chatwoot contacts into PostgreSQL (contacts table)
# and MongoDB (engagement_events collection) so the
# flow-multidb-ai-route-inbox.json flow works end-to-end.
#
# Maps the five Chatwoot test contacts to different contact_types
# so every decision branch gets tested:
#
#   Alice Johnson  → employee        → HR branch
#   Bob Smith      → church_member   → Church branch
#   Carol White    → coaching_client  → Coaches branch  (already exists)
#   David Lee      → freelancer       → Freelancer branch
#   Emma Rodriguez → employee        → HR branch
#
# Usage:  bash scripts/seed_chatwoot_contacts.sh
# ─────────────────────────────────────────────────────────────
set -euo pipefail

PG_CONTAINER="flyn-platform-flyn-postgres-1"
MONGO_CONTAINER="flyn-platform-flyn-mongo-1"

echo "═══════════════════════════════════════════════════"
echo "  Seeding PostgreSQL contacts table"
echo "═══════════════════════════════════════════════════"

docker exec "$PG_CONTAINER" psql -U flyn -d flyn_data -c "
-- Upsert all 5 Chatwoot contacts into the contacts table
-- Uses ON CONFLICT to update if the email already exists

INSERT INTO contacts (name, email, phone, contact_type, company, tags, created_at, updated_at)
VALUES
  ('Alice Johnson', 'alice@example.com',      '+14155550101', 'employee',        'Acme Corp',         ARRAY['imported','priority'],   NOW(), NOW()),
  ('Bob Smith',     'bob@example.com',         '+14155550102', 'church_member',   'Grace Community',   ARRAY['imported','member'],     NOW(), NOW()),
  ('Carol White',   'carol@example.com',       '+14155550103', 'coaching_client', 'White Consulting',  ARRAY['imported','active'],     NOW(), NOW()),
  ('David Lee',     'david.lee@example.com',   '+14155550104', 'freelancer',      'Lee Design Studio', ARRAY['imported','new'],        NOW(), NOW()),
  ('Emma Rodriguez','emma.r@example.com',      '+14155550105', 'employee',        'TechStart Inc',     ARRAY['imported','onboarding'], NOW(), NOW())
ON CONFLICT (email) DO UPDATE SET
  name         = EXCLUDED.name,
  phone        = EXCLUDED.phone,
  contact_type = EXCLUDED.contact_type,
  company      = EXCLUDED.company,
  tags         = EXCLUDED.tags,
  updated_at   = NOW();
"

echo "✅ PostgreSQL contacts upserted"
echo ""

# Verify
docker exec "$PG_CONTAINER" psql -U flyn -d flyn_data -c "
SELECT id, name, email, contact_type, company
FROM contacts
WHERE email IN ('alice@example.com','bob@example.com','carol@example.com','david.lee@example.com','emma.r@example.com')
ORDER BY id;
"

echo ""
echo "═══════════════════════════════════════════════════"
echo "  Seeding MongoDB engagement_events"
echo "═══════════════════════════════════════════════════"

docker exec "$MONGO_CONTAINER" mongosh \
  --username flyn --password flyn_mongo_password \
  --authenticationDatabase admin \
  flyn_workflow_demo --quiet --eval '

// Remove old events for these contacts (idempotent re-run)
const emails = [
  "alice@example.com",
  "bob@example.com",
  "carol@example.com",
  "david.lee@example.com",
  "emma.r@example.com"
];
db.engagement_events.deleteMany({ email: { $in: emails } });

// Insert engagement events for each contact
const events = [
  // Alice Johnson — employee (HR branch)
  { email: "alice@example.com", event_type: "onboarding_started", channel: "email",    engagement_count: 3,  last_event_type: "onboarding_started", createdAt: new Date("2026-02-20T09:00:00Z"), metadata: { source: "hr_portal" } },
  { email: "alice@example.com", event_type: "document_signed",    channel: "portal",   engagement_count: 3,  last_event_type: "document_signed",    createdAt: new Date("2026-02-22T14:00:00Z"), metadata: { document: "offer_letter" } },
  { email: "alice@example.com", event_type: "orientation_rsvp",   channel: "email",    engagement_count: 3,  last_event_type: "orientation_rsvp",   createdAt: new Date("2026-03-01T10:00:00Z"), metadata: {} },

  // Bob Smith — church_member (Church branch)
  { email: "bob@example.com",   event_type: "service_attended",   channel: "check_in", engagement_count: 12, last_event_type: "service_attended",   createdAt: new Date("2026-03-02T10:30:00Z"), metadata: { service: "Sunday Morning" } },
  { email: "bob@example.com",   event_type: "donation_made",      channel: "online",   engagement_count: 12, last_event_type: "donation_made",      createdAt: new Date("2026-03-03T11:00:00Z"), metadata: { amount: 50 } },
  { email: "bob@example.com",   event_type: "volunteer_signup",   channel: "form",     engagement_count: 12, last_event_type: "volunteer_signup",   createdAt: new Date("2026-03-05T09:00:00Z"), metadata: { ministry: "youth" } },

  // Carol White — coaching_client (Coaches branch)
  { email: "carol@example.com", event_type: "session_booked",     channel: "email",    engagement_count: 7,  last_event_type: "session_booked",     createdAt: new Date("2026-03-01T10:00:00Z"), metadata: {} },
  { email: "carol@example.com", event_type: "goal_updated",       channel: "portal",   engagement_count: 7,  last_event_type: "goal_updated",       createdAt: new Date("2026-03-04T15:00:00Z"), metadata: { goal: "leadership_growth" } },
  { email: "carol@example.com", event_type: "assessment_completed",channel: "email",   engagement_count: 7,  last_event_type: "assessment_completed",createdAt: new Date("2026-03-06T12:00:00Z"), metadata: { score: 82 } },

  // David Lee — freelancer (Freelancer branch)
  { email: "david.lee@example.com", event_type: "project_inquiry",   channel: "website", engagement_count: 2,  last_event_type: "project_inquiry",   createdAt: new Date("2026-03-04T16:00:00Z"), metadata: { project: "mobile_app" } },
  { email: "david.lee@example.com", event_type: "portfolio_viewed",  channel: "website", engagement_count: 2,  last_event_type: "portfolio_viewed",  createdAt: new Date("2026-03-05T11:00:00Z"), metadata: {} },

  // Emma Rodriguez — employee (HR branch)
  { email: "emma.r@example.com", event_type: "interview_completed", channel: "zoom",    engagement_count: 5,  last_event_type: "interview_completed",createdAt: new Date("2026-02-25T14:00:00Z"), metadata: { round: "final" } },
  { email: "emma.r@example.com", event_type: "offer_accepted",      channel: "email",   engagement_count: 5,  last_event_type: "offer_accepted",     createdAt: new Date("2026-02-28T09:00:00Z"), metadata: {} },
  { email: "emma.r@example.com", event_type: "onboarding_started",  channel: "portal",  engagement_count: 5,  last_event_type: "onboarding_started", createdAt: new Date("2026-03-03T10:00:00Z"), metadata: {} },
];

const result = db.engagement_events.insertMany(events);
print("✅ Inserted " + result.insertedCount + " engagement events");

// Show summary
const pipeline = [
  { $match: { email: { $in: emails } } },
  { $group: { _id: "$email", count: { $sum: 1 }, lastEvent: { $last: "$event_type" } } },
  { $sort: { _id: 1 } }
];
const summary = db.engagement_events.aggregate(pipeline).toArray();
summary.forEach(s => print("  " + s._id + " → " + s.count + " events, last: " + s.lastEvent));
'

echo ""
echo "═══════════════════════════════════════════════════"
echo "  ✅ Seeding complete!"
echo ""
echo "  Contact → Branch mapping:"
echo "    Alice Johnson   (alice@example.com)       → employee        → HR"
echo "    Bob Smith       (bob@example.com)          → church_member   → Church"
echo "    Carol White     (carol@example.com)        → coaching_client → Coaches"
echo "    David Lee       (david.lee@example.com)    → freelancer      → Freelancer"
echo "    Emma Rodriguez  (emma.r@example.com)       → employee        → HR"
echo "═══════════════════════════════════════════════════"
