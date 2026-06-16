#!/usr/bin/env ts-node
/**
 * NocoBase Data Clearer
 *
 * Deletes all records from CRM and FLYN module collections for a clean test state.
 */

import * as dotenv from 'dotenv';
dotenv.config();

const NOCO_URL = process.env.NOCOBASE_URL || 'http://localhost:13000';
const EMAIL = process.env.NOCOBASE_ADMIN_EMAIL || 'admin@nocobase.com';
const PASSWORD = process.env.NOCOBASE_ADMIN_PASSWORD || 'admin123';

async function request(path: string, method = 'GET', body?: any, token?: string) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${NOCO_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { error: 'Non-JSON response', text };
  }
}

async function signIn(): Promise<string> {
  const result = await request('/api/auth:signIn', 'POST', {
    account: EMAIL,
    password: PASSWORD,
  });
  const token = result?.data?.token;
  if (!token) throw new Error(`Failed to sign in: ${JSON.stringify(result)}`);
  return token;
}

const collections = [
  'contacts', 'deals', 'activities', 'pipelines',
  'flyn_hr_employees', 'flyn_hr_leave_requests', 'flyn_hr_attendance_logs',
  'flyn_church_members', 'flyn_church_donations', 'flyn_church_events',
  'flyn_coaches_clients', 'flyn_coaches_sessions', 'flyn_coaches_progress_logs',
  'flyn_freelancer_projects', 'flyn_freelancer_time_entries', 'flyn_freelancer_invoices'
];

async function main() {
  console.log('🧹 Clearing NocoBase Data...');
  const token = await signIn();

  for (const collection of collections) {
    console.log(`  🗑️ Clearing ${collection}...`);
    // NocoBase destroy with no filter deletes all matching (or we can use a broad filter)
    // To be safe, we'll try to delete everything.
    await request(`/api/${collection}:destroy?filter={}`, 'POST', undefined, token);
  }

  console.log('\n✅ All collections cleared.');
}

main().catch(console.error);
