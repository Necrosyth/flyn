/**
 * Coaches Service — NocoBase Backend
 *
 * Persistent storage via the shared NocoBaseService.
 *
 * Collections:
 *   flyn_coaches_clients       — Coaching client records
 *   flyn_coaches_sessions      — Coaching session records
 *   flyn_coaches_progress_logs — Progress/milestone logs
 */

import { Injectable, Logger } from '@nestjs/common';
import { Client, Session, ProgressLog } from './coaches.types';
import { NocoBaseService } from '../nocobase/nocobase.service';

const COL_CLIENTS  = 'flyn_coaches_clients';
const COL_SESSIONS = 'flyn_coaches_sessions';
const COL_PROGRESS = 'flyn_coaches_progress_logs';

const _clients:  Client[]       = [];
const _sessions: Session[]      = [];
const _progress: ProgressLog[]  = [];
function mkId() { return `mem_${Date.now()}_${Math.random().toString(36).slice(2,7)}`; }

function mapClient(r: any): Client {
    return { _id: String(r.id ?? r._id ?? mkId()), name: r.name ?? '', email: r.email ?? '', phone: r.phone, program: r.program ?? 'individual', status: r.status ?? 'active', goals: r.goals, notes: r.notes, createdAt: r.createdAt ? new Date(r.createdAt) : new Date(), updatedAt: r.updatedAt ? new Date(r.updatedAt) : new Date() };
}
function mapSession(r: any): Session {
    return { _id: String(r.id ?? r._id ?? mkId()), clientId: String(r.clientId ?? r.client_id ?? ''), date: r.date ?? '', time: r.time, duration: Number(r.duration ?? 60), sessionType: r.sessionType ?? r.session_type ?? 'one_on_one', agenda: r.agenda, status: r.status ?? 'scheduled', createdAt: r.createdAt ? new Date(r.createdAt) : new Date() };
}
function mapProgress(r: any): ProgressLog {
    return { _id: String(r.id ?? r._id ?? mkId()), clientId: String(r.clientId ?? r.client_id ?? ''), milestone: r.milestone ?? '', rating: Number(r.rating ?? 5), notes: r.notes, createdAt: r.createdAt ? new Date(r.createdAt) : new Date() };
}

@Injectable()
export class CoachesService {
    private readonly logger = new Logger(CoachesService.name);

    constructor(private readonly nc: NocoBaseService) {}

    // ── Clients ──────────────────────────────────────────────────────────────

    async addClient(data: Partial<Client>): Promise<Client> {
        if (!this.nc.isConnected) {
            const c: Client = { _id: mkId(), name: data.name ?? 'Unknown', email: data.email ?? '', phone: data.phone, program: data.program ?? 'individual', status: 'active', goals: data.goals, notes: data.notes, createdAt: new Date(), updatedAt: new Date() };
            _clients.push(c); this.logger.warn(`[fallback] Client in memory: ${c.name}`); return c;
        }
        const raw = await this.nc.create(COL_CLIENTS, { name: data.name ?? 'Unknown', email: data.email ?? '', phone: data.phone ?? null, program: data.program ?? 'individual', status: 'active', goals: data.goals ?? null, notes: data.notes ?? null });
        if (!raw) {
            const c: Client = { _id: mkId(), name: data.name ?? 'Unknown', email: data.email ?? '', phone: data.phone, program: data.program ?? 'individual', status: 'active', goals: data.goals, notes: data.notes, createdAt: new Date(), updatedAt: new Date() };
            _clients.push(c);
            this.logger.warn(`[fallback] Client in memory (NocoBase create failed): ${c.name}`);
            return c;
        }
        const client = mapClient(raw);
        this.logger.log(`Client added in NocoBase: ${client.name} (${client._id})`);
        return client;
    }

    async updateClient(id: string, data: Partial<Client>): Promise<Client | null> {
        if (!this.nc.isConnected) {
            const idx = _clients.findIndex((c) => c._id === id);
            if (idx === -1) return null;
            _clients[idx] = { ..._clients[idx], ...data, updatedAt: new Date() };
            return _clients[idx];
        }
        const raw = await this.nc.update(COL_CLIENTS, id, { ...data, updatedAt: new Date().toISOString() });
        return raw ? mapClient(raw) : null;
    }

    async getClients(filters: { search?: string; program?: string; limit?: number } = {}): Promise<{ data: Client[]; total: number }> {
        if (!this.nc.isConnected) {
            let result = [..._clients];
            if (filters.search) { const s = filters.search.toLowerCase(); result = result.filter((c) => c.name.toLowerCase().includes(s) || c.email.toLowerCase().includes(s)); }
            if (filters.program && filters.program !== 'all') result = result.filter((c) => c.program === filters.program);
            return { data: result.slice(0, filters.limit ?? 20), total: result.length };
        }
        const ncFilter: Record<string, unknown> = {};
        if (filters.program && filters.program !== 'all') ncFilter['program'] = { $eq: filters.program };
        const result = await this.nc.list<any>(COL_CLIENTS, { pageSize: filters.limit ?? 100, filter: ncFilter });
        if (!result) {
            let r = [..._clients];
            if (filters.search) { const s = filters.search.toLowerCase(); r = r.filter((c) => c.name.toLowerCase().includes(s) || c.email.toLowerCase().includes(s)); }
            if (filters.program && filters.program !== 'all') r = r.filter((c) => c.program === filters.program);
            return { data: r.slice(0, filters.limit ?? 20), total: r.length };
        }
        let data = result.data.map(mapClient);
        if (filters.search) { const s = filters.search.toLowerCase(); data = data.filter((c) => c.name.toLowerCase().includes(s) || c.email.toLowerCase().includes(s)); }
        return { data, total: result.total };
    }

    async getClientById(id: string): Promise<Client | null> {
        if (!this.nc.isConnected) return _clients.find((c) => c._id === id) ?? null;
        const raw = await this.nc.get<any>(COL_CLIENTS, id);
        return raw ? mapClient(raw) : null;
    }

    // ── Sessions ─────────────────────────────────────────────────────────────

    async createSession(data: Partial<Session>): Promise<Session> {
        if (!this.nc.isConnected) {
            const s: Session = { _id: mkId(), clientId: data.clientId ?? '', date: data.date ?? '', time: data.time, duration: data.duration ?? 60, sessionType: data.sessionType ?? 'one_on_one', agenda: data.agenda, status: 'scheduled', createdAt: new Date() };
            _sessions.push(s); return s;
        }
        const raw = await this.nc.create(COL_SESSIONS, { clientId: data.clientId ?? '', date: data.date ?? '', time: data.time ?? null, duration: data.duration ?? 60, sessionType: data.sessionType ?? 'one_on_one', agenda: data.agenda ?? null, status: 'scheduled' });
        if (!raw) {
            const s: Session = { _id: mkId(), clientId: data.clientId ?? '', date: data.date ?? '', time: data.time, duration: data.duration ?? 60, sessionType: data.sessionType ?? 'one_on_one', agenda: data.agenda, status: 'scheduled', createdAt: new Date() };
            _sessions.push(s);
            this.logger.warn(`[fallback] Session in memory (NocoBase create failed)`);
            return s;
        }
        return mapSession(raw);
    }

    async getSessions(clientId?: string): Promise<Session[]> {
        if (!this.nc.isConnected) return clientId ? _sessions.filter((s) => s.clientId === clientId) : _sessions;
        const result = await this.nc.list<any>(COL_SESSIONS, { filter: clientId ? { clientId: { $eq: clientId } } : {}, pageSize: 100, sort: '-id' });
        if (!result) return clientId ? _sessions.filter((s) => s.clientId === clientId) : [..._sessions];
        return result.data.map(mapSession);
    }

    // ── Progress Logs ────────────────────────────────────────────────────────

    async logProgress(data: Partial<ProgressLog>): Promise<ProgressLog> {
        if (!this.nc.isConnected) {
            const log: ProgressLog = { _id: mkId(), clientId: data.clientId ?? '', milestone: data.milestone ?? '', rating: data.rating ?? 5, notes: data.notes, createdAt: new Date() };
            _progress.push(log); return log;
        }
        const raw = await this.nc.create(COL_PROGRESS, { clientId: data.clientId ?? '', milestone: data.milestone ?? '', rating: data.rating ?? 5, notes: data.notes ?? null });
        if (!raw) {
            const log: ProgressLog = { _id: mkId(), clientId: data.clientId ?? '', milestone: data.milestone ?? '', rating: data.rating ?? 5, notes: data.notes, createdAt: new Date() };
            _progress.push(log);
            this.logger.warn(`[fallback] ProgressLog in memory (NocoBase create failed)`);
            return log;
        }
        return mapProgress(raw);
    }

    async getProgressLogs(clientId?: string): Promise<ProgressLog[]> {
        if (!this.nc.isConnected) return clientId ? _progress.filter((p) => p.clientId === clientId) : _progress;
        const result = await this.nc.list<any>(COL_PROGRESS, { filter: clientId ? { clientId: { $eq: clientId } } : {}, pageSize: 100, sort: '-id' });
        if (!result) return clientId ? _progress.filter((p) => p.clientId === clientId) : [..._progress];
        return result.data.map(mapProgress);
    }

    async deleteClient(id: string): Promise<boolean> {
        if (!this.nc.isConnected) {
            const idx = _clients.findIndex((c) => c._id === id);
            if (idx === -1) return false;
            _clients.splice(idx, 1);
            return true;
        }
        return this.nc.destroy(COL_CLIENTS, id);
    }
}
