import { API_BASE_URL } from '@/lib/api';
import { authedFetch } from '@/services/authApi';

const base = `${API_BASE_URL}/contact`;

// ── Shared types ───────────────────────────────────────────────────────────────

export interface ContactLocation {
  id: string;
  country: string;
  country_code: string;
  region?: string;
  address: string;
  city: string;
  postal_code: string;
  phone: string;
  email: string;
  timezone: string;
  department: string;
  hours: { monday_friday: string; saturday: string; sunday: string };
  agent_count: number;
  agent_available: boolean;
  languages: string[];
  coordinates?: { lat: number; lng: number };
}

export interface LiveAgent {
  id: string;
  name: string;
  department: string;
  location: string;
  status: 'online' | 'offline' | 'busy' | 'away';
  current_chats: number;
  max_chats: number;
  languages: string[];
  average_response_time: number;
  customer_rating: number;
  is_available: boolean;
}

export interface CountryOption {
  country: string;
  country_code: string;
}

export interface ChatMessage {
  id: string;
  chat_id: string;
  sender_type: 'visitor' | 'agent';
  message: string;
  created_at: string;
}

export interface SubmitContactPayload {
  name: string;
  email: string;
  phone?: string;
  country: string;
  subject: string;
  message: string;
  department: string;
  priority: string;
}

// ── Location & agent fetchers ──────────────────────────────────────────────────

export async function getLocations(country?: string, department?: string): Promise<ContactLocation[]> {
  const params = new URLSearchParams();
  if (country) params.set('country', country);
  if (department && department !== 'all') params.set('department', department);
  const url = `${base}/locations${params.toString() ? `?${params}` : ''}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Failed to load locations');
  const json = await res.json();
  return json.locations ?? [];
}

export async function getCountries(): Promise<CountryOption[]> {
  const res = await fetch(`${base}/locations/countries`);
  if (!res.ok) throw new Error('Failed to load countries');
  const json = await res.json();
  return json.countries ?? [];
}

export async function getAgents(department?: string): Promise<LiveAgent[]> {
  const url = department ? `${base}/agents?department=${encodeURIComponent(department)}` : `${base}/agents`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Failed to load agents');
  const json = await res.json();
  return json.agents ?? [];
}

// ── Contact form ───────────────────────────────────────────────────────────────

export async function submitContactForm(payload: SubmitContactPayload): Promise<{ success: boolean; ticketId: string }> {
  const res = await fetch(`${base}/submit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const json = await res.json();
  if (!res.ok) {
    const msg = Array.isArray(json.message) ? json.message.join(', ') : (json.message ?? 'Submission failed');
    throw new Error(msg);
  }
  return json;
}

// ── Admin: Location CRUD ──────────────────────────────────────────────────────

export async function adminCreateLocation(data: Omit<ContactLocation, 'id'>): Promise<ContactLocation> {
  const res = await authedFetch(`${base}/admin/locations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.message ?? 'Failed to create location');
  return json.location;
}

export async function adminUpdateLocation(id: string, data: Partial<ContactLocation>): Promise<void> {
  const res = await authedFetch(`${base}/admin/locations/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to update location');
}

export async function adminDeleteLocation(id: string): Promise<void> {
  const res = await authedFetch(`${base}/admin/locations/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete location');
}

// ── Admin: Agent CRUD ─────────────────────────────────────────────────────────

export async function adminCreateAgent(data: Omit<LiveAgent, 'id'>): Promise<LiveAgent> {
  const res = await authedFetch(`${base}/admin/agents`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.message ?? 'Failed to create agent');
  return json.agent;
}

export async function adminUpdateAgent(id: string, data: Partial<LiveAgent>): Promise<void> {
  const res = await authedFetch(`${base}/admin/agents/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to update agent');
}

export async function adminDeleteAgent(id: string): Promise<void> {
  const res = await authedFetch(`${base}/admin/agents/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete agent');
}

// ── Admin ops ──────────────────────────────────────────────────────────────────

export async function updateContactForm(
  id: string,
  payload: { status?: string; response?: string; assigned_to?: string },
): Promise<void> {
  const res = await fetch(`${base}/forms/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('Failed to update contact form');
}

export async function deleteContactForm(id: string): Promise<void> {
  const res = await fetch(`${base}/forms/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete contact form');
}

// ── Live chat ──────────────────────────────────────────────────────────────────

export async function startChat(payload: {
  visitor_name: string;
  visitor_email: string;
  department: string;
}): Promise<{ chatId: string; agent: LiveAgent; messages: ChatMessage[] }> {
  const res = await fetch(`${base}/chat/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const json = await res.json();
  if (!res.ok) {
    const msg = Array.isArray(json.message) ? json.message.join(', ') : (json.message ?? 'Failed to start chat');
    throw new Error(msg);
  }
  return json;
}

export async function sendMessage(payload: {
  chat_id: string;
  message: string;
  sender_type: 'visitor' | 'agent';
}): Promise<{ messageId: string; aiReply?: ChatMessage }> {
  const res = await fetch(`${base}/chat/message`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.message ?? 'Failed to send message');
  return json;
}

export async function getMessages(chatId: string): Promise<ChatMessage[]> {
  const res = await fetch(`${base}/chat/${chatId}/messages`);
  if (!res.ok) throw new Error('Failed to load messages');
  const json = await res.json();
  return json.messages ?? [];
}

// ── Subscribe ──────────────────────────────────────────────────────────────────

export async function subscribeNotifications(email: string): Promise<{ success: boolean }> {
  const res = await fetch(`${base}/subscribe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.message ?? 'Subscription failed');
  return json;
}

// ── Seed ───────────────────────────────────────────────────────────────────────

export async function seedContactData(): Promise<{ locations: number; agents: number }> {
  const res = await fetch(`${base}/seed-data`, { method: 'POST' });
  if (!res.ok) throw new Error('Seed failed');
  return res.json();
}
