/**
 * Freelancer Service — NocoBase Backend
 *
 * Persistent storage via the shared NocoBaseService.
 *
 * Collections:
 *   flyn_freelancer_projects     — Project records
 *   flyn_freelancer_time_entries — Time entry records
 *   flyn_freelancer_invoices     — Invoice records
 */

import { Injectable, Logger } from '@nestjs/common';
import { Project, TimeEntry, Invoice } from './freelancer.types';
import { NocoBaseService } from '../nocobase/nocobase.service';

const COL_PROJECTS = 'flyn_freelancer_projects';
const COL_TIME     = 'flyn_freelancer_time_entries';
const COL_INVOICES = 'flyn_freelancer_invoices';

const _projects:    Project[]   = [];
const _timeEntries: TimeEntry[] = [];
const _invoices:    Invoice[]   = [];
function mkId() { return `mem_${Date.now()}_${Math.random().toString(36).slice(2,7)}`; }

function mapProject(r: any): Project {
    return { _id: String(r.id ?? r._id ?? mkId()), title: r.title ?? '', clientName: r.clientName ?? r.client_name ?? '', clientEmail: r.clientEmail ?? r.client_email, budget: r.budget ? Number(r.budget) : undefined, deadline: r.deadline, status: r.status ?? 'active', description: r.description, createdAt: r.createdAt ? new Date(r.createdAt) : new Date(), updatedAt: r.updatedAt ? new Date(r.updatedAt) : new Date() };
}
function mapTimeEntry(r: any): TimeEntry {
    return { _id: String(r.id ?? r._id ?? mkId()), projectId: String(r.projectId ?? r.project_id ?? ''), hours: Number(r.hours ?? 0), description: r.description ?? '', date: r.date ?? '', billable: r.billable !== false, createdAt: r.createdAt ? new Date(r.createdAt) : new Date() };
}
function mapInvoice(r: any): Invoice {
    return { _id: String(r.id ?? r._id ?? mkId()), projectId: String(r.projectId ?? r.project_id ?? ''), amount: Number(r.amount ?? 0), dueDate: r.dueDate ?? r.due_date ?? '', description: r.description, status: r.status ?? 'draft', createdAt: r.createdAt ? new Date(r.createdAt) : new Date() };
}

@Injectable()
export class FreelancerService {
    private readonly logger = new Logger(FreelancerService.name);

    constructor(private readonly nc: NocoBaseService) {}

    // -- Projects ------------------------------------------------------------------

    async createProject(data: Partial<Project>): Promise<Project> {
        if (!this.nc.isConnected) {
            const p: Project = { _id: mkId(), title: data.title ?? 'Untitled Project', clientName: data.clientName ?? 'Unknown', clientEmail: data.clientEmail, budget: data.budget, deadline: data.deadline, status: data.status ?? 'active', description: data.description, createdAt: new Date(), updatedAt: new Date() };
            _projects.push(p); this.logger.warn(`[fallback] Project in memory: ${p.title}`); return p;
        }
        const raw = await this.nc.create(COL_PROJECTS, { title: data.title ?? 'Untitled Project', clientName: data.clientName ?? 'Unknown', clientEmail: data.clientEmail ?? null, budget: data.budget ?? null, deadline: data.deadline ?? null, status: data.status ?? 'active', description: data.description ?? null });
        if (!raw) {
            const p: Project = { _id: mkId(), title: data.title ?? 'Untitled Project', clientName: data.clientName ?? 'Unknown', clientEmail: data.clientEmail, budget: data.budget, deadline: data.deadline, status: data.status ?? 'active', description: data.description, createdAt: new Date(), updatedAt: new Date() };
            _projects.push(p);
            this.logger.warn(`[fallback] Project in memory (NocoBase create failed): ${p.title}`);
            return p;
        }
        const project = mapProject(raw);
        this.logger.log(`Project created in NocoBase: ${project.title} (${project._id})`);
        return project;
    }

    async updateProject(id: string, data: Partial<Project>): Promise<Project | null> {
        if (!this.nc.isConnected) {
            const idx = _projects.findIndex((p) => p._id === id);
            if (idx === -1) return null;
            _projects[idx] = { ..._projects[idx], ...data, updatedAt: new Date() };
            return _projects[idx];
        }
        const raw = await this.nc.update(COL_PROJECTS, id, { ...data, updatedAt: new Date().toISOString() });
        return raw ? mapProject(raw) : null;
    }

    async getProjects(filters: { search?: string; status?: string; limit?: number } = {}): Promise<{ data: Project[]; total: number }> {
        if (!this.nc.isConnected) {
            let result = [..._projects];
            if (filters.search) { const s = filters.search.toLowerCase(); result = result.filter((p) => p.title.toLowerCase().includes(s) || p.clientName.toLowerCase().includes(s)); }
            if (filters.status && filters.status !== 'all') result = result.filter((p) => p.status === filters.status);
            return { data: result.slice(0, filters.limit ?? 20), total: result.length };
        }
        const ncFilter: Record<string, unknown> = {};
        if (filters.status && filters.status !== 'all') ncFilter['status'] = { $eq: filters.status };
        const result = await this.nc.list<any>(COL_PROJECTS, { pageSize: filters.limit ?? 100, filter: ncFilter });
        if (!result) {
            let r = [..._projects];
            if (filters.search) { const s = filters.search.toLowerCase(); r = r.filter((p) => p.title.toLowerCase().includes(s) || p.clientName.toLowerCase().includes(s)); }
            if (filters.status && filters.status !== 'all') r = r.filter((p) => p.status === filters.status);
            return { data: r.slice(0, filters.limit ?? 20), total: r.length };
        }
        let data = result.data.map(mapProject);
        if (filters.search) { const s = filters.search.toLowerCase(); data = data.filter((p) => p.title.toLowerCase().includes(s) || p.clientName.toLowerCase().includes(s)); }
        return { data, total: result.total };
    }

    async getProjectById(id: string): Promise<Project | null> {
        if (!this.nc.isConnected) return _projects.find((p) => p._id === id) ?? null;
        const raw = await this.nc.get<any>(COL_PROJECTS, id);
        return raw ? mapProject(raw) : null;
    }

    // -- Time Entries --------------------------------------------------------------

    async logTime(data: Partial<TimeEntry>): Promise<TimeEntry> {
        if (!this.nc.isConnected) {
            const t: TimeEntry = { _id: mkId(), projectId: data.projectId ?? '', hours: data.hours ?? 0, description: data.description ?? '', date: data.date ?? new Date().toISOString().slice(0, 10), billable: data.billable !== false, createdAt: new Date() };
            _timeEntries.push(t); return t;
        }
        const raw = await this.nc.create(COL_TIME, { projectId: data.projectId ?? '', hours: data.hours ?? 0, description: data.description ?? '', date: data.date ?? new Date().toISOString().slice(0, 10), billable: data.billable !== false });
        if (!raw) {
            const t: TimeEntry = { _id: mkId(), projectId: data.projectId ?? '', hours: data.hours ?? 0, description: data.description ?? '', date: data.date ?? new Date().toISOString().slice(0, 10), billable: data.billable !== false, createdAt: new Date() };
            _timeEntries.push(t);
            this.logger.warn(`[fallback] TimeEntry in memory (NocoBase create failed)`);
            return t;
        }
        return mapTimeEntry(raw);
    }

    async getTimeEntries(projectId?: string): Promise<TimeEntry[]> {
        if (!this.nc.isConnected) return projectId ? _timeEntries.filter((t) => t.projectId === projectId) : _timeEntries;
        const result = await this.nc.list<any>(COL_TIME, { filter: projectId ? { projectId: { $eq: projectId } } : {}, pageSize: 100, sort: '-id' });
        if (!result) return projectId ? _timeEntries.filter((t) => t.projectId === projectId) : [..._timeEntries];
        return result.data.map(mapTimeEntry);
    }

    // -- Invoices ------------------------------------------------------------------

    async createInvoice(data: Partial<Invoice>): Promise<Invoice> {
        if (!this.nc.isConnected) {
            const inv: Invoice = { _id: mkId(), projectId: data.projectId ?? '', amount: data.amount ?? 0, dueDate: data.dueDate ?? '', description: data.description, status: data.status ?? 'draft', createdAt: new Date() };
            _invoices.push(inv); return inv;
        }
        const raw = await this.nc.create(COL_INVOICES, { projectId: data.projectId ?? '', amount: data.amount ?? 0, dueDate: data.dueDate ?? '', description: data.description ?? null, status: data.status ?? 'draft' });
        if (!raw) {
            const inv: Invoice = { _id: mkId(), projectId: data.projectId ?? '', amount: data.amount ?? 0, dueDate: data.dueDate ?? '', description: data.description, status: data.status ?? 'draft', createdAt: new Date() };
            _invoices.push(inv);
            this.logger.warn(`[fallback] Invoice in memory (NocoBase create failed)`);
            return inv;
        }
        return mapInvoice(raw);
    }

    async getInvoices(projectId?: string): Promise<Invoice[]> {
        if (!this.nc.isConnected) return projectId ? _invoices.filter((i) => i.projectId === projectId) : _invoices;
        const result = await this.nc.list<any>(COL_INVOICES, { filter: projectId ? { projectId: { $eq: projectId } } : {}, pageSize: 100, sort: '-id' });
        if (!result) return projectId ? _invoices.filter((i) => i.projectId === projectId) : [..._invoices];
        return result.data.map(mapInvoice);
    }

    async deleteProject(id: string): Promise<boolean> {
        if (!this.nc.isConnected) {
            const idx = _projects.findIndex((p) => p._id === id);
            if (idx === -1) return false;
            _projects.splice(idx, 1);
            return true;
        }
        return this.nc.destroy(COL_PROJECTS, id);
    }
}
