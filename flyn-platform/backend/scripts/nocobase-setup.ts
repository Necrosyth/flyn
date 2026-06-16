#!/usr/bin/env ts-node
/**
 * NocoBase CRM Setup Script
 * 
 * Creates CRM collections (contacts, deals, activities, pipelines) in NocoBase
 * and seeds demo data. Run this after NocoBase is started.
 * 
 * Usage: npx ts-node backend/scripts/nocobase-setup.ts
 */

const NOCOBASE_URL = process.env.NOCOBASE_URL || 'http://localhost:13000';
const ADMIN_EMAIL = process.env.NOCOBASE_ADMIN_EMAIL || 'admin@nocobase.com';
const ADMIN_PASSWORD = process.env.NOCOBASE_ADMIN_PASSWORD || 'admin123';

async function request(path: string, method = 'GET', body?: any, token?: string) {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(`${NOCOBASE_URL}${path}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
    });

    const text = await res.text();
    try {
        return JSON.parse(text);
    } catch {
        console.error(`Non-JSON response from ${path}:`, text.slice(0, 200));
        throw new Error(`Failed: ${path} -> ${res.status}`);
    }
}

async function signIn(): Promise<string> {
    console.log('🔑 Signing into NocoBase...');
    const result = await request('/api/auth:signIn', 'POST', {
        account: ADMIN_EMAIL,
        password: ADMIN_PASSWORD,
    });
    if (!result?.data?.token) {
        throw new Error('Failed to sign in: ' + JSON.stringify(result));
    }
    console.log('✅ Signed in successfully');
    return result.data.token;
}

async function createCollection(token: string, collection: any) {
    console.log(`📦 Creating collection: ${collection.name}...`);
    try {
        const result = await request('/api/collections:create', 'POST', collection, token);
        if (result?.data) {
            console.log(`  ✅ Created: ${collection.name}`);
        } else if (result?.errors) {
            // Collection might already exist
            const msg = result.errors?.[0]?.message || JSON.stringify(result.errors);
            if (msg.includes('already exists') || msg.includes('duplicate')) {
                console.log(`  ⚠️ Already exists: ${collection.name}`);
            } else {
                console.error(`  ❌ Error: ${msg}`);
            }
        }
        return result;
    } catch (err) {
        console.error(`  ❌ Failed to create ${collection.name}:`, err);
    }
}

async function createCollections(token: string) {
    // ── Contacts Collection ──
    await createCollection(token, {
        name: 'contacts',
        title: 'Contacts',
        fields: [
            { name: 'name', type: 'string', interface: 'input', uiSchema: { title: 'Name', 'x-component': 'Input' } },
            { name: 'email', type: 'string', interface: 'email', uiSchema: { title: 'Email', 'x-component': 'Input' } },
            { name: 'phone', type: 'string', interface: 'phone', uiSchema: { title: 'Phone', 'x-component': 'Input' } },
            { name: 'company', type: 'string', interface: 'input', uiSchema: { title: 'Company', 'x-component': 'Input' } },
            {
                name: 'status', type: 'string', interface: 'select', uiSchema: {
                    title: 'Status', 'x-component': 'Select',
                    enum: [
                        { value: 'lead', label: 'Lead' },
                        { value: 'qualified', label: 'Qualified' },
                        { value: 'customer', label: 'Customer' },
                        { value: 'churned', label: 'Churned' },
                        { value: 'inactive', label: 'Inactive' },
                    ],
                }
            },
            {
                name: 'source', type: 'string', interface: 'select', uiSchema: {
                    title: 'Source', 'x-component': 'Select',
                    enum: [
                        { value: 'Website', label: 'Website' },
                        { value: 'Referral', label: 'Referral' },
                        { value: 'Social', label: 'Social' },
                        { value: 'Event', label: 'Event' },
                        { value: 'LinkedIn', label: 'LinkedIn' },
                        { value: 'Cold Call', label: 'Cold Call' },
                    ],
                }
            },
            { name: 'score', type: 'integer', interface: 'integer', uiSchema: { title: 'Score', 'x-component': 'InputNumber' } },
            { name: 'tags', type: 'json', interface: 'json', uiSchema: { title: 'Tags', 'x-component': 'Input.JSON' } },
            { name: 'notes', type: 'text', interface: 'textarea', uiSchema: { title: 'Notes', 'x-component': 'Input.TextArea' } },
        ],
    });

    // ── Deals Collection ──
    await createCollection(token, {
        name: 'deals',
        title: 'Deals',
        fields: [
            { name: 'title', type: 'string', interface: 'input', uiSchema: { title: 'Title', 'x-component': 'Input' } },
            { name: 'value', type: 'float', interface: 'number', uiSchema: { title: 'Value', 'x-component': 'InputNumber' } },
            {
                name: 'stage', type: 'string', interface: 'select', uiSchema: {
                    title: 'Stage', 'x-component': 'Select',
                    enum: [
                        { value: 'new', label: 'New' },
                        { value: 'qualified', label: 'Qualified' },
                        { value: 'proposal', label: 'Proposal' },
                        { value: 'negotiation', label: 'Negotiation' },
                        { value: 'won', label: 'Won' },
                        { value: 'lost', label: 'Lost' },
                    ],
                }
            },
            { name: 'contactId', type: 'integer', interface: 'integer', uiSchema: { title: 'Contact ID', 'x-component': 'InputNumber' } },
            { name: 'probability', type: 'integer', interface: 'integer', uiSchema: { title: 'Probability (%)', 'x-component': 'InputNumber' } },
            { name: 'expectedCloseDate', type: 'date', interface: 'date', uiSchema: { title: 'Expected Close', 'x-component': 'DatePicker' } },
            { name: 'notes', type: 'text', interface: 'textarea', uiSchema: { title: 'Notes', 'x-component': 'Input.TextArea' } },
        ],
    });

    // ── Activities Collection ──
    await createCollection(token, {
        name: 'activities',
        title: 'Activities',
        fields: [
            {
                name: 'type', type: 'string', interface: 'select', uiSchema: {
                    title: 'Type', 'x-component': 'Select',
                    enum: [
                        { value: 'email', label: 'Email' },
                        { value: 'call', label: 'Call' },
                        { value: 'meeting', label: 'Meeting' },
                        { value: 'note', label: 'Note' },
                        { value: 'task', label: 'Task' },
                        { value: 'deal_update', label: 'Deal Update' },
                    ],
                }
            },
            { name: 'description', type: 'text', interface: 'textarea', uiSchema: { title: 'Description', 'x-component': 'Input.TextArea' } },
            { name: 'actor', type: 'string', interface: 'input', uiSchema: { title: 'Actor', 'x-component': 'Input' } },
            { name: 'contactId', type: 'integer', interface: 'integer', uiSchema: { title: 'Contact ID', 'x-component': 'InputNumber' } },
            { name: 'dealId', type: 'integer', interface: 'integer', uiSchema: { title: 'Deal ID', 'x-component': 'InputNumber' } },
        ],
    });

    // ── Pipelines Collection ──
    await createCollection(token, {
        name: 'pipelines',
        title: 'Pipelines',
        fields: [
            { name: 'name', type: 'string', interface: 'input', uiSchema: { title: 'Name', 'x-component': 'Input' } },
            { name: 'stages', type: 'json', interface: 'json', uiSchema: { title: 'Stages', 'x-component': 'Input.JSON' } },
            { name: 'isDefault', type: 'boolean', interface: 'checkbox', uiSchema: { title: 'Default', 'x-component': 'Checkbox' } },
        ],
    });
}

async function seedDemoData(token: string) {
    console.log('\n🌱 Seeding demo data...');

    // Check if data already exists
    const existing = await request('/api/contacts:list?pageSize=1', 'GET', undefined, token);
    if (existing?.data?.length > 0) {
        console.log('  ⚠️ Data already seeded, skipping.');
        return;
    }

    // Demo contacts
    const contacts = [
        { name: 'Sarah Chen', email: 'sarah@techcorp.io', phone: '+1-555-0101', company: 'TechCorp', status: 'customer', source: 'Website', score: 92, tags: ['enterprise', 'tech'] },
        { name: 'James Wilson', email: 'james@startupxyz.com', phone: '+1-555-0102', company: 'StartupXYZ', status: 'qualified', source: 'Referral', score: 78, tags: ['startup'] },
        { name: 'Maria Garcia', email: 'maria@innovate.co', phone: '+1-555-0103', company: 'Innovate Co', status: 'lead', source: 'LinkedIn', score: 65, tags: ['saas'] },
        { name: 'Alex Kumar', email: 'alex@megaent.com', phone: '+1-555-0104', company: 'MegaEnterprise', status: 'customer', source: 'Event', score: 88, tags: ['enterprise'] },
        { name: 'Emily Davis', email: 'emily@cloudnine.io', phone: '+1-555-0105', company: 'CloudNine', status: 'qualified', source: 'Social', score: 71, tags: ['cloud'] },
        { name: 'Robert Brown', email: 'robert@datadrive.co', phone: '+1-555-0106', company: 'DataDrive', status: 'lead', source: 'Website', score: 55, tags: ['data'] },
        { name: 'Lisa Zhang', email: 'lisa@aifirst.io', phone: '+1-555-0107', company: 'AI First', status: 'customer', source: 'Referral', score: 95, tags: ['ai', 'enterprise'] },
        { name: 'Michael Johnson', email: 'mike@fintech.co', phone: '+1-555-0108', company: 'FinTech Co', status: 'qualified', source: 'Event', score: 82, tags: ['fintech'] },
        { name: 'Priya Patel', email: 'priya@healthplus.com', phone: '+1-555-0109', company: 'HealthPlus', status: 'lead', source: 'Cold Call', score: 45, tags: ['healthcare'] },
        { name: 'David Lee', email: 'david@secureops.io', phone: '+1-555-0110', company: 'SecureOps', status: 'customer', source: 'Website', score: 90, tags: ['security'] },
    ];

    for (const contact of contacts) {
        await request('/api/contacts:create', 'POST', contact, token);
    }
    console.log(`  ✅ Created ${contacts.length} contacts`);

    // Demo deals
    const deals = [
        { title: 'TechCorp Enterprise License', value: 45000, stage: 'won', contactId: 1, probability: 100 },
        { title: 'StartupXYZ Platform', value: 12000, stage: 'proposal', contactId: 2, probability: 60 },
        { title: 'Innovate Co Pilot', value: 7500, stage: 'new', contactId: 3, probability: 20 },
        { title: 'MegaEnterprise Expansion', value: 78000, stage: 'negotiation', contactId: 4, probability: 75 },
        { title: 'CloudNine Starter', value: 15000, stage: 'qualified', contactId: 5, probability: 45 },
        { title: 'DataDrive Integration', value: 22000, stage: 'proposal', contactId: 6, probability: 50 },
        { title: 'AI First ML Suite', value: 55000, stage: 'won', contactId: 7, probability: 100 },
        { title: 'FinTech Compliance', value: 35000, stage: 'qualified', contactId: 8, probability: 40 },
        { title: 'HealthPlus Basic', value: 8000, stage: 'new', contactId: 9, probability: 15 },
        { title: 'SecureOps Premium', value: 42000, stage: 'won', contactId: 10, probability: 100 },
    ];

    for (const deal of deals) {
        await request('/api/deals:create', 'POST', deal, token);
    }
    console.log(`  ✅ Created ${deals.length} deals`);

    // Demo activities
    const activityTypes = ['email', 'call', 'meeting', 'note', 'task', 'deal_update'];
    const actors = ['Sarah Admin', 'John Sales', 'Mike Support'];
    const descriptions = [
        'Sent onboarding materials',
        'Discussed pricing options',
        'Initial discovery call completed',
        'Demo scheduled for next week',
        'Follow-up on proposal feedback',
        'Contract review in progress',
        'Feature request logged',
        'Quarterly business review',
        'Renewal discussion initiated',
        'Technical integration planning',
    ];

    for (let i = 0; i < 15; i++) {
        await request('/api/activities:create', 'POST', {
            type: activityTypes[i % activityTypes.length],
            description: descriptions[i % descriptions.length],
            actor: actors[i % actors.length],
            contactId: (i % 10) + 1,
            dealId: i < 10 ? (i % 10) + 1 : undefined,
        }, token);
    }
    console.log('  ✅ Created 15 activities');

    // Default pipeline
    await request('/api/pipelines:create', 'POST', {
        name: 'Default Sales Pipeline',
        stages: ['new', 'qualified', 'proposal', 'negotiation', 'won', 'lost'],
        isDefault: true,
    }, token);
    console.log('  ✅ Created default pipeline');
}

async function main() {
    console.log('🚀 NocoBase CRM Setup\n');
    console.log(`  URL: ${NOCOBASE_URL}`);
    console.log(`  Admin: ${ADMIN_EMAIL}\n`);

    try {
        const token = await signIn();
        await createCollections(token);
        await seedDemoData(token);
        console.log('\n✅ CRM setup complete!');
        console.log(`  → NocoBase Admin: ${NOCOBASE_URL}/admin`);
        console.log(`  → API Contacts:   ${NOCOBASE_URL}/api/contacts:list`);
        console.log(`  → API Deals:      ${NOCOBASE_URL}/api/deals:list`);
    } catch (err) {
        console.error('❌ Setup failed:', err);
        process.exit(1);
    }
}

main();
