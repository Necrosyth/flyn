#!/usr/bin/env ts-node
/**
 * NocoBase Non-CRM Seeder
 *
 * Seeds demo data into the FLYN module collections created by the backend's NocoBaseService:
 *  - HR:         flyn_hr_employees, flyn_hr_leave_requests, flyn_hr_attendance_logs
 *  - Church:     flyn_church_members, flyn_church_donations, flyn_church_events
 *  - Coaches:    flyn_coaches_clients, flyn_coaches_sessions, flyn_coaches_progress_logs
 *  - Freelancer: flyn_freelancer_projects, flyn_freelancer_time_entries, flyn_freelancer_invoices
 *
 * Usage:
 *   NOCOBASE_URL=... NOCOBASE_ADMIN_EMAIL=... NOCOBASE_ADMIN_PASSWORD=... npx ts-node backend/scripts/nocobase-seed-non-crm.ts
 */

import * as dotenv from 'dotenv';
dotenv.config();

const SEED_NOCO_URL = process.env.NOCOBASE_URL || 'http://localhost:13000';
const SEED_EMAIL = process.env.NOCOBASE_ADMIN_EMAIL || 'admin@nocobase.com';
const SEED_PASSWORD = process.env.NOCOBASE_ADMIN_PASSWORD || 'admin123';

async function seedRequest(path: string, method = 'GET', body?: any, token?: string) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${SEED_NOCO_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Non-JSON response from ${path} (${res.status}): ${text.slice(0, 200)}`);
  }
}

async function seedSignIn(): Promise<string> {
  const result = await seedRequest('/api/auth:signIn', 'POST', {
    account: SEED_EMAIL,
    password: SEED_PASSWORD,
  });
  const token = result?.data?.token;
  if (!token) throw new Error(`Failed to sign in: ${JSON.stringify(result)}`);
  return token;
}

async function listHasAnyRows(token: string, collection: string): Promise<boolean> {
  try {
    const result = await seedRequest(`/api/${collection}:list?pageSize=1`, 'GET', undefined, token);
    return Array.isArray(result?.data) && result.data.length > 0;
  } catch {
    return false;
  }
}

async function ensureCollections(token: string) {
  const schema: Record<string, Array<{ name: string; type: string; title: string }>> = {
    flyn_hr_employees: [
      { name: 'name', type: 'string', title: 'Name' },
      { name: 'email', type: 'string', title: 'Email' },
      { name: 'phone', type: 'string', title: 'Phone' },
      { name: 'department', type: 'string', title: 'Department' },
      { name: 'position', type: 'string', title: 'Position' },
      { name: 'start_date', type: 'string', title: 'Start Date' },
      { name: 'status', type: 'string', title: 'Status' },
      { name: 'notes', type: 'text', title: 'Notes' },
    ],
    flyn_hr_leave_requests: [
      { name: 'employeeId', type: 'string', title: 'Employee ID' },
      { name: 'leave_type', type: 'string', title: 'Leave Type' },
      { name: 'start_date', type: 'string', title: 'Start Date' },
      { name: 'end_date', type: 'string', title: 'End Date' },
      { name: 'status', type: 'string', title: 'Status' },
      { name: 'reason', type: 'text', title: 'Reason' },
    ],
    flyn_hr_attendance_logs: [
      { name: 'employeeId', type: 'string', title: 'Employee ID' },
      { name: 'date', type: 'string', title: 'Date' },
      { name: 'check_in', type: 'string', title: 'Check In' },
      { name: 'check_out', type: 'string', title: 'Check Out' },
      { name: 'hours_worked', type: 'float', title: 'Hours Worked' },
      { name: 'status', type: 'string', title: 'Status' },
      { name: 'notes', type: 'text', title: 'Notes' },
    ],
    flyn_church_members: [
      { name: 'name', type: 'string', title: 'Name' },
      { name: 'email', type: 'string', title: 'Email' },
      { name: 'phone', type: 'string', title: 'Phone' },
      { name: 'membership_type', type: 'string', title: 'Membership Type' },
      { name: 'join_date', type: 'string', title: 'Join Date' },
      { name: 'status', type: 'string', title: 'Status' },
      { name: 'notes', type: 'text', title: 'Notes' },
    ],
    flyn_church_donations: [
      { name: 'memberId', type: 'string', title: 'Member ID' },
      { name: 'amount', type: 'float', title: 'Amount' },
      { name: 'date', type: 'string', title: 'Date' },
      { name: 'category', type: 'string', title: 'Category' },
      { name: 'notes', type: 'text', title: 'Notes' },
      { name: 'status', type: 'string', title: 'Status' },
    ],
    flyn_church_events: [
      { name: 'title', type: 'string', title: 'Title' },
      { name: 'date', type: 'string', title: 'Date' },
      { name: 'time', type: 'string', title: 'Time' },
      { name: 'location', type: 'string', title: 'Location' },
      { name: 'event_type', type: 'string', title: 'Event Type' },
      { name: 'description', type: 'text', title: 'Description' },
      { name: 'status', type: 'string', title: 'Status' },
    ],
    flyn_coaches_clients: [
      { name: 'name', type: 'string', title: 'Name' },
      { name: 'email', type: 'string', title: 'Email' },
      { name: 'phone', type: 'string', title: 'Phone' },
      { name: 'program', type: 'string', title: 'Program' },
      { name: 'goals', type: 'text', title: 'Goals' },
      { name: 'status', type: 'string', title: 'Status' },
      { name: 'notes', type: 'text', title: 'Notes' },
    ],
    flyn_coaches_sessions: [
      { name: 'clientId', type: 'string', title: 'Client ID' },
      { name: 'date', type: 'string', title: 'Date' },
      { name: 'time', type: 'string', title: 'Time' },
      { name: 'duration', type: 'integer', title: 'Duration (min)' },
      { name: 'session_type', type: 'string', title: 'Session Type' },
      { name: 'agenda', type: 'text', title: 'Agenda' },
      { name: 'status', type: 'string', title: 'Status' },
      { name: 'notes', type: 'text', title: 'Notes' },
    ],
    flyn_coaches_progress_logs: [
      { name: 'clientId', type: 'string', title: 'Client ID' },
      { name: 'date', type: 'string', title: 'Date' },
      { name: 'milestone', type: 'string', title: 'Milestone' },
      { name: 'progress', type: 'text', title: 'Progress' },
      { name: 'notes', type: 'text', title: 'Notes' },
      { name: 'status', type: 'string', title: 'Status' },
    ],
    flyn_freelancer_projects: [
      { name: 'title', type: 'string', title: 'Title' },
      { name: 'client_name', type: 'string', title: 'Client Name' },
      { name: 'client_email', type: 'string', title: 'Client Email' },
      { name: 'budget', type: 'string', title: 'Budget' },
      { name: 'deadline', type: 'string', title: 'Deadline' },
      { name: 'status', type: 'string', title: 'Status' },
      { name: 'description', type: 'text', title: 'Description' },
    ],
    flyn_freelancer_time_entries: [
      { name: 'projectId', type: 'string', title: 'Project ID' },
      { name: 'date', type: 'string', title: 'Date' },
      { name: 'hours', type: 'float', title: 'Hours' },
      { name: 'description', type: 'text', title: 'Description' },
      { name: 'billable', type: 'boolean', title: 'Billable' },
      { name: 'status', type: 'string', title: 'Status' },
    ],
    flyn_freelancer_invoices: [
      { name: 'projectId', type: 'string', title: 'Project ID' },
      { name: 'amount', type: 'string', title: 'Amount' },
      { name: 'due_date', type: 'string', title: 'Due Date' },
      { name: 'description', type: 'text', title: 'Description' },
      { name: 'status', type: 'string', title: 'Status' },
      { name: 'paid_date', type: 'string', title: 'Paid Date' },
    ],
  };

  for (const [collectionName, fields] of Object.entries(schema)) {
    await seedRequest(
      '/api/collections:create',
      'POST',
      {
        name: collectionName,
        title: collectionName.replace(/_/g, ' ').replace(/flyn /i, '').trim(),
      },
      token,
    ).catch(() => null);

    for (const field of fields) {
      await seedRequest(
        `/api/collections/${collectionName}/fields:create`,
        'POST',
        {
          name: field.name,
          type: field.type,
          interface: field.type === 'text' ? 'textarea' : 'input',
          uiSchema: {
            title: field.title,
            'x-component': field.type === 'text' ? 'Input.TextArea' : 'Input',
          },
        },
        token,
      ).catch(() => null);
    }
  }
}

async function safeCreate(token: string, collection: string, payload: Record<string, unknown>) {
  try {
    await seedRequest(`/api/${collection}:create`, 'POST', payload, token);
  } catch (e) {
    // ignore individual record failures so one bad row doesn't stop the entire seed
    console.error(`  ⚠️ Failed to create in ${collection}:`, (e as Error).message);
  }
}

async function seedHr(token: string) {
  console.log('\n🧑‍💼 Seeding HR...');

  if (await listHasAnyRows(token, 'flyn_hr_employees')) {
    console.log('  ⚠️ HR already seeded, skipping.');
    return;
  }

  const employees = [
    {
      name: 'Anika Sharma',
      email: 'anika.sharma@example.com',
      phone: '+1-555-0201',
      department: 'Engineering',
      position: 'Senior Software Engineer',
      start_date: '2024-06-15',
      status: 'active',
      notes: 'Frontend lead',
    },
    {
      name: 'Rahul Mehta',
      email: 'rahul.mehta@example.com',
      phone: '+1-555-0202',
      department: 'Sales',
      position: 'Account Executive',
      start_date: '2023-10-01',
      status: 'active',
      notes: 'Top performer',
    },
    {
      name: 'Sofia Garcia',
      email: 'sofia.garcia@example.com',
      phone: '+1-555-0203',
      department: 'HR',
      position: 'HR Manager',
      start_date: '2022-03-20',
      status: 'active',
      notes: 'Onboarding owner',
    },
    {
      name: 'Ethan Brown',
      email: 'ethan.brown@example.com',
      phone: '+1-555-0204',
      department: 'Support',
      position: 'Customer Support Specialist',
      start_date: '2024-01-10',
      status: 'active',
      notes: 'Email channel',
    },
  ];

  for (const e of employees) await safeCreate(token, 'flyn_hr_employees', e);
  console.log(`  ✅ Created ${employees.length} employees`);

  const leaveRequests = [
    {
      employeeId: '1',
      leave_type: 'Paid Leave',
      start_date: '2026-03-10',
      end_date: '2026-03-12',
      status: 'approved',
      reason: 'Family event',
    },
    {
      employeeId: '2',
      leave_type: 'Sick Leave',
      start_date: '2026-03-05',
      end_date: '2026-03-06',
      status: 'pending',
      reason: 'Flu',
    },
  ];

  for (const lr of leaveRequests) await safeCreate(token, 'flyn_hr_leave_requests', lr);
  console.log(`  ✅ Created ${leaveRequests.length} leave requests`);

  const attendanceLogs = [
    {
      employeeId: '1',
      date: '2026-03-08',
      check_in: '09:12',
      check_out: '18:10',
      hours_worked: 8.97,
      status: 'present',
      notes: 'WFH',
    },
    {
      employeeId: '2',
      date: '2026-03-08',
      check_in: '09:35',
      check_out: '17:55',
      hours_worked: 8.33,
      status: 'present',
      notes: '',
    },
  ];

  for (const al of attendanceLogs) await safeCreate(token, 'flyn_hr_attendance_logs', al);
  console.log(`  ✅ Created ${attendanceLogs.length} attendance logs`);
}

async function seedChurch(token: string) {
  console.log('\n⛪️ Seeding Church...');

  if (await listHasAnyRows(token, 'flyn_church_members')) {
    console.log('  ⚠️ Church already seeded, skipping.');
    return;
  }

  const members = [
    {
      name: 'Grace Kim',
      email: 'grace.kim@example.com',
      phone: '+1-555-0301',
      membership_type: 'member',
      join_date: '2023-09-17',
      status: 'active',
      notes: 'Volunteers on Sundays',
    },
    {
      name: 'Daniel Lee',
      email: 'daniel.lee@example.com',
      phone: '+1-555-0302',
      membership_type: 'visitor',
      join_date: '2026-02-11',
      status: 'active',
      notes: 'Interested in small groups',
    },
    {
      name: 'Mia Patel',
      email: 'mia.patel@example.com',
      phone: '+1-555-0303',
      membership_type: 'member',
      join_date: '2022-05-08',
      status: 'active',
      notes: 'Donor',
    },
  ];

  for (const m of members) await safeCreate(token, 'flyn_church_members', m);
  console.log(`  ✅ Created ${members.length} members`);

  const donations = [
    { memberId: '1', amount: 50, date: '2026-03-01', category: 'Tithe', notes: '', status: 'received' },
    { memberId: '3', amount: 200, date: '2026-03-03', category: 'Missions', notes: 'Monthly pledge', status: 'received' },
  ];

  for (const d of donations) await safeCreate(token, 'flyn_church_donations', d);
  console.log(`  ✅ Created ${donations.length} donations`);

  const events = [
    {
      title: 'Community Dinner',
      date: '2026-03-15',
      time: '18:30',
      location: 'Main Hall',
      event_type: 'community',
      description: 'Open dinner for members and visitors',
      status: 'scheduled',
    },
    {
      title: 'Sunday Service',
      date: '2026-03-16',
      time: '10:00',
      location: 'Auditorium',
      event_type: 'service',
      description: 'Weekly service',
      status: 'scheduled',
    },
  ];

  for (const e of events) await safeCreate(token, 'flyn_church_events', e);
  console.log(`  ✅ Created ${events.length} events`);
}

async function seedCoaches(token: string) {
  console.log('\n🏋️ Seeding Coaches...');

  if (await listHasAnyRows(token, 'flyn_coaches_clients')) {
    console.log('  ⚠️ Coaches already seeded, skipping.');
    return;
  }

  const clients = [
    {
      name: 'Olivia Johnson',
      email: 'olivia.johnson@example.com',
      phone: '+1-555-0401',
      program: 'executive',
      goals: 'Improve leadership communication',
      status: 'active',
      notes: 'Prefers mornings',
    },
    {
      name: 'Noah Williams',
      email: 'noah.williams@example.com',
      phone: '+1-555-0402',
      program: 'career',
      goals: 'Switch to product management',
      status: 'active',
      notes: '',
    },
  ];

  for (const c of clients) await safeCreate(token, 'flyn_coaches_clients', c);
  console.log(`  ✅ Created ${clients.length} clients`);

  const sessions = [
    {
      clientId: '1',
      date: '2026-03-11',
      time: '09:00',
      duration: 60,
      session_type: 'one_on_one',
      agenda: 'Leadership principles and feedback',
      status: 'scheduled',
      notes: '',
    },
    {
      clientId: '2',
      date: '2026-03-12',
      time: '16:00',
      duration: 45,
      session_type: 'assessment',
      agenda: 'Career baseline assessment',
      status: 'scheduled',
      notes: 'Bring CV',
    },
  ];

  for (const s of sessions) await safeCreate(token, 'flyn_coaches_sessions', s);
  console.log(`  ✅ Created ${sessions.length} sessions`);

  const progress = [
    {
      clientId: '1',
      date: '2026-03-08',
      milestone: 'Defined leadership growth plan',
      progress: 'Created a weekly practice routine',
      notes: '',
      status: 'on_track',
    },
  ];

  for (const p of progress) await safeCreate(token, 'flyn_coaches_progress_logs', p);
  console.log(`  ✅ Created ${progress.length} progress logs`);
}

async function seedFreelancer(token: string) {
  console.log('\n🧾 Seeding Freelancer...');

  if (await listHasAnyRows(token, 'flyn_freelancer_projects')) {
    console.log('  ⚠️ Freelancer already seeded, skipping.');
    return;
  }

  const projects = [
    {
      title: 'Landing Page Redesign',
      client_name: 'Acme Corp',
      client_email: 'marketing@acme.example.com',
      budget: '3500',
      deadline: '2026-03-25',
      status: 'in_progress',
      description: 'Modern redesign for conversion optimization',
    },
    {
      title: 'Mobile App Bugfix Sprint',
      client_name: 'FinTech Co',
      client_email: 'pm@fintech.example.com',
      budget: '5000',
      deadline: '2026-03-18',
      status: 'active',
      description: 'Fix critical crashes and improve stability',
    },
  ];

  for (const p of projects) await safeCreate(token, 'flyn_freelancer_projects', p);
  console.log(`  ✅ Created ${projects.length} projects`);

  const timeEntries = [
    {
      projectId: '1',
      date: '2026-03-08',
      hours: 3.5,
      description: 'Hero section + CTA redesign',
      billable: true,
      status: 'logged',
    },
    {
      projectId: '2',
      date: '2026-03-08',
      hours: 2,
      description: 'Crash reproduction + stack trace analysis',
      billable: true,
      status: 'logged',
    },
  ];

  for (const te of timeEntries) await safeCreate(token, 'flyn_freelancer_time_entries', te);
  console.log(`  ✅ Created ${timeEntries.length} time entries`);

  const invoices = [
    {
      projectId: '1',
      amount: '1750',
      due_date: '2026-03-20',
      description: 'Milestone 1 - initial redesign',
      status: 'sent',
      paid_date: '',
    },
  ];

  for (const inv of invoices) await safeCreate(token, 'flyn_freelancer_invoices', inv);
  console.log(`  ✅ Created ${invoices.length} invoices`);
}

async function main() {
  console.log('🌱 NocoBase Non-CRM Seeder');
  console.log(`  URL: ${SEED_NOCO_URL}`);
  console.log(`  Admin: ${SEED_EMAIL}`);

  const token = await seedSignIn();
  console.log('✅ Signed in');

  console.log('\n🧱 Ensuring non-CRM collections exist...');
  await ensureCollections(token);
  console.log('✅ Collections ready');

  await seedHr(token);
  await seedChurch(token);
  await seedCoaches(token);
  await seedFreelancer(token);

  console.log('\n✅ Non-CRM seeding complete');
}

main().catch((err) => {
  console.error('❌ Seed failed:', err);
  process.exit(1);
});
