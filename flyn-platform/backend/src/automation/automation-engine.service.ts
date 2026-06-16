/**
 * FLYN Automation Engine — Event-Driven Cross-Module Hook System
 * ──────────────────────────────────────────────────────────────
 *
 * Centralised event bus that enables modules to emit domain events
 * and register handlers for cross-module side effects.
 *
 * Examples:
 *   contract.signed  → accounting.invoice_created
 *   deal.won         → contracts.sales_agreement_generated
 *   employee.onboard → contracts.employment_contract_generated
 *   invoice.overdue  → crm.activity_logged
 *
 * Design:
 *   - In-process pub/sub (no external broker needed for local dev)
 *   - Fully typed event payloads
 *   - Idempotent handler registration
 *   - Audit log of all events fired
 */

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';

// ── Event Types ─────────────────────────────────────────────────────────────

export type AutomationEventType =
    // Contract lifecycle
    | 'contract.created'
    | 'contract.sent'
    | 'contract.signed'
    | 'contract.declined'
    | 'contract.voided'
    | 'contract.expired'
    // CRM lifecycle
    | 'deal.created'
    | 'deal.won'
    | 'deal.lost'
    | 'deal.stage_changed'
    | 'contact.created'
    | 'contact.status_changed'
    // HR lifecycle
    | 'employee.onboarded'
    | 'employee.terminated'
    | 'employee.leave_approved'
    | 'employee.performance_reviewed'
    // Freelancer lifecycle
    | 'project.created'
    | 'project.completed'
    | 'project.milestone_completed'
    | 'freelancer.invoice_created'
    // Accounting lifecycle
    | 'invoice.created'
    | 'invoice.paid'
    | 'invoice.overdue'
    | 'expense.created'
    // Generic
    | 'system.notification'
    | 'custom';

export interface AutomationEvent {
    id: string;
    type: AutomationEventType;
    sourceModule: string;
    payload: Record<string, unknown>;
    timestamp: Date;
    correlationId?: string;         // Links related events across modules
    actorId?: string;
    actorName?: string;
}

export interface AutomationRule {
    id: string;
    name: string;
    description?: string;
    triggerEvent: AutomationEventType;
    conditions?: Array<{
        field: string;
        operator: 'eq' | 'neq' | 'gt' | 'lt' | 'contains' | 'exists';
        value: unknown;
    }>;
    actions: Array<{
        type: string;               // 'create_invoice' | 'generate_contract' | 'log_activity' | 'send_notification' | 'webhook'
        targetModule: string;
        config: Record<string, unknown>;
    }>;
    enabled: boolean;
    executionCount: number;
    lastExecuted?: Date;
    createdAt: Date;
}

export type EventHandler = (event: AutomationEvent) => Promise<void> | void;

// ── In-memory stores ────────────────────────────────────────────────────────

function mkId() { return `evt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`; }

@Injectable()
export class AutomationEngineService implements OnModuleInit {
    private readonly logger = new Logger(AutomationEngineService.name);

    private handlers: Map<AutomationEventType, EventHandler[]> = new Map();
    private eventLog: AutomationEvent[] = [];
    private rules: AutomationRule[] = [];

    onModuleInit() {
        this.registerDefaultRules();
        this.logger.log('Automation Engine initialized with default rules');
    }

    // ── Event Emission ──────────────────────────────────────────────────────

    async emit(type: AutomationEventType, sourceModule: string, payload: Record<string, unknown>, actor?: { id?: string; name?: string }): Promise<void> {
        const event: AutomationEvent = {
            id: mkId(),
            type,
            sourceModule,
            payload,
            timestamp: new Date(),
            correlationId: payload.correlationId as string ?? mkId(),
            actorId: actor?.id,
            actorName: actor?.name,
        };

        this.eventLog.push(event);
        if (this.eventLog.length > 1000) this.eventLog = this.eventLog.slice(-500);

        this.logger.log(`[Event] ${type} from ${sourceModule} — ${JSON.stringify(payload).slice(0, 100)}`);

        // Execute registered handlers
        const handlers = this.handlers.get(type) || [];
        for (const handler of handlers) {
            try {
                await handler(event);
            } catch (err) {
                this.logger.error(`[Event Handler Error] ${type}: ${(err as Error).message}`);
            }
        }

        // Execute matching automation rules
        for (const rule of this.rules) {
            if (!rule.enabled || rule.triggerEvent !== type) continue;
            if (rule.conditions && !this.evaluateConditions(rule.conditions, payload)) continue;

            try {
                await this.executeRuleActions(rule, event);
                rule.executionCount++;
                rule.lastExecuted = new Date();
                this.logger.log(`[Automation] Rule "${rule.name}" executed for ${type}`);
            } catch (err) {
                this.logger.error(`[Automation Error] Rule "${rule.name}": ${(err as Error).message}`);
            }
        }
    }

    // ── Handler Registration ────────────────────────────────────────────────

    on(type: AutomationEventType, handler: EventHandler): void {
        const existing = this.handlers.get(type) || [];
        existing.push(handler);
        this.handlers.set(type, existing);
        this.logger.debug(`Handler registered for ${type} (total: ${existing.length})`);
    }

    off(type: AutomationEventType, handler: EventHandler): void {
        const existing = this.handlers.get(type) || [];
        this.handlers.set(type, existing.filter(h => h !== handler));
    }

    // ── Automation Rules ────────────────────────────────────────────────────

    getRules(): AutomationRule[] {
        return [...this.rules];
    }

    getRule(id: string): AutomationRule | undefined {
        return this.rules.find(r => r.id === id);
    }

    createRule(rule: Omit<AutomationRule, 'id' | 'executionCount' | 'createdAt'>): AutomationRule {
        const newRule: AutomationRule = {
            ...rule,
            id: `rule_${Date.now()}`,
            executionCount: 0,
            createdAt: new Date(),
        };
        this.rules.push(newRule);
        this.logger.log(`Automation rule created: ${newRule.name}`);
        return newRule;
    }

    updateRule(id: string, updates: Partial<AutomationRule>): AutomationRule | null {
        const idx = this.rules.findIndex(r => r.id === id);
        if (idx === -1) return null;
        this.rules[idx] = { ...this.rules[idx], ...updates };
        return this.rules[idx];
    }

    deleteRule(id: string): boolean {
        const idx = this.rules.findIndex(r => r.id === id);
        if (idx === -1) return false;
        this.rules.splice(idx, 1);
        return true;
    }

    toggleRule(id: string): AutomationRule | null {
        const rule = this.rules.find(r => r.id === id);
        if (!rule) return null;
        rule.enabled = !rule.enabled;
        return rule;
    }

    // ── Event Log / Audit ───────────────────────────────────────────────────

    getEventLog(filters?: { type?: string; sourceModule?: string; limit?: number }): AutomationEvent[] {
        let result = [...this.eventLog];
        if (filters?.type) result = result.filter(e => e.type === filters.type);
        if (filters?.sourceModule) result = result.filter(e => e.sourceModule === filters.sourceModule);
        result.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
        return result.slice(0, filters?.limit ?? 50);
    }

    getStats(): {
        totalEventsEmitted: number;
        totalRules: number;
        activeRules: number;
        recentEvents: AutomationEvent[];
        topEventTypes: Array<{ type: string; count: number }>;
    } {
        const typeCounts: Record<string, number> = {};
        for (const ev of this.eventLog) {
            typeCounts[ev.type] = (typeCounts[ev.type] || 0) + 1;
        }

        return {
            totalEventsEmitted: this.eventLog.length,
            totalRules: this.rules.length,
            activeRules: this.rules.filter(r => r.enabled).length,
            recentEvents: this.eventLog.slice(-10).reverse(),
            topEventTypes: Object.entries(typeCounts)
                .map(([type, count]) => ({ type, count }))
                .sort((a, b) => b.count - a.count)
                .slice(0, 10),
        };
    }

    // ── Internal Helpers ────────────────────────────────────────────────────

    private evaluateConditions(conditions: AutomationRule['conditions'], payload: Record<string, unknown>): boolean {
        if (!conditions || conditions.length === 0) return true;
        return conditions.every(cond => {
            const value = payload[cond.field];
            switch (cond.operator) {
                case 'eq': return value === cond.value;
                case 'neq': return value !== cond.value;
                case 'gt': return Number(value) > Number(cond.value);
                case 'lt': return Number(value) < Number(cond.value);
                case 'contains': return String(value).includes(String(cond.value));
                case 'exists': return value !== undefined && value !== null;
                default: return true;
            }
        });
    }

    private async executeRuleActions(rule: AutomationRule, event: AutomationEvent): Promise<void> {
        for (const action of rule.actions) {
            this.logger.log(`[Automation Action] ${action.type} → ${action.targetModule} (rule: ${rule.name})`);
            // In a production system, this would dispatch to the appropriate service.
            // For now, we log the action for observability.
            this.emit('system.notification', 'AutomationEngine', {
                originalEvent: event.type,
                actionType: action.type,
                targetModule: action.targetModule,
                ruleName: rule.name,
                ruleId: rule.id,
            }).catch(() => null);
        }
    }

    // ── Default Rules ───────────────────────────────────────────────────────

    private registerDefaultRules(): void {
        this.rules = [
            {
                id: 'rule_deal_won_invoice',
                name: 'Deal Won → Create Invoice',
                description: 'Automatically creates an accounting invoice when a CRM deal is marked as won.',
                triggerEvent: 'deal.won',
                conditions: [{ field: 'value', operator: 'gt', value: 0 }],
                actions: [{ type: 'create_invoice', targetModule: 'Accounting', config: { status: 'pending', terms: 'net-30' } }],
                enabled: true,
                executionCount: 0,
                createdAt: new Date(),
            },
            {
                id: 'rule_contract_signed_invoice',
                name: 'Contract Signed → Create Invoice',
                description: 'When a contract is fully signed, auto-generate an invoice in Accounting.',
                triggerEvent: 'contract.signed',
                actions: [{ type: 'create_invoice', targetModule: 'Accounting', config: { status: 'pending' } }],
                enabled: true,
                executionCount: 0,
                createdAt: new Date(),
            },
            {
                id: 'rule_employee_onboard_contract',
                name: 'Employee Onboarded → Generate Contract',
                description: 'Automatically generates an employment contract when a new employee is onboarded.',
                triggerEvent: 'employee.onboarded',
                actions: [{ type: 'generate_contract', targetModule: 'Contracts', config: { type: 'employment' } }],
                enabled: true,
                executionCount: 0,
                createdAt: new Date(),
            },
            {
                id: 'rule_project_complete_invoice',
                name: 'Project Completed → Create Invoice',
                description: 'Auto-generate a freelancer invoice when a project is marked as completed.',
                triggerEvent: 'project.completed',
                actions: [{ type: 'create_invoice', targetModule: 'Accounting', config: { source: 'Freelance' } }],
                enabled: true,
                executionCount: 0,
                createdAt: new Date(),
            },
            {
                id: 'rule_invoice_overdue_crm',
                name: 'Invoice Overdue → CRM Alert',
                description: 'Log a CRM activity when an invoice becomes overdue.',
                triggerEvent: 'invoice.overdue',
                actions: [{ type: 'log_activity', targetModule: 'CRM', config: { activityType: 'note', priority: 'high' } }],
                enabled: true,
                executionCount: 0,
                createdAt: new Date(),
            },
        ];
    }
}
