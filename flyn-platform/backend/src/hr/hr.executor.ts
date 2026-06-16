/**
 * HR Executor
 *
 * Workflow node executor for HR operations.
 * Enables HR actions to be used as nodes in the visual workflow builder.
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { BaseExecutor } from '../orchestrator/node-executor/base-executor';
import { CompiledNode } from '../orchestrator/types';
import { NodeExecutionContext, NodeResult } from '../orchestrator/types';
import { HRService } from './hr.service';
import { CrmService } from '../crm/crm.service';

export interface HRNodeConfig {
    operation: 'create_employee' | 'update_employee' | 'get_employees' | 'get_employee' | 'create_leave_request' | 'log_attendance' | 'sync_to_crm';
    employeeId?: string;
    entityId?: string;
    entityData?: string;
    op_fields?: Record<string, unknown>;
    filter?: string;
    limit?: number;
}

@Injectable()
export class HRExecutor extends BaseExecutor {
    private readonly logger = new Logger(HRExecutor.name);

    readonly nodeType = 'hr';
    readonly displayName = 'HR Action';
    readonly description = 'Perform HR operations like creating employees, managing leave, and syncing to CRM';

    constructor(
        private readonly hrService: HRService,
        @Optional() private readonly crmService?: CrmService,
    ) {
        super();
    }

    async execute(
        node: CompiledNode,
        context: NodeExecutionContext,
    ): Promise<NodeResult> {
        const config = node.config as unknown as HRNodeConfig;

        context.services.log('info', `HR executing operation: ${config.operation}`, { nodeId: node.id });
        console.log(`[HRExecutor] Node ID: ${node.id}, Operation: ${config.operation}`);
        console.log(`[HRExecutor] Config:`, JSON.stringify(config, null, 2));
        console.log(`[HRExecutor] Context Previous Outputs:`, JSON.stringify(context.previousOutputs, null, 2));

        try {
            let entityData: Record<string, unknown> = {};
            if (config.entityData) {
                try {
                    const interpolated = this.interpolateTemplates(config.entityData, context.previousOutputs);
                    entityData = JSON.parse(interpolated);
                } catch {
                    return this.failed('INVALID_ENTITY_DATA', 'Failed to parse entity data JSON', false);
                }
            }
            // Fallback: if no entityData, use form-filled op_fields (PropertyPanel stores values there)
            if (!config.entityData && config.op_fields && typeof config.op_fields === 'object') {
                entityData = config.op_fields as Record<string, unknown>;
            }

            switch (config.operation) {
                case 'create_employee': {
                    const employee = await this.hrService.createEmployee({
                        name: entityData.name as string,
                        email: entityData.email as string,
                        phone: entityData.phone as string,
                        department: entityData.department as string,
                        position: entityData.position as string,
                        startDate: entityData.start_date as string,
                        notes: entityData.notes as string,
                    });
                    return this.completed({
                        operation: 'create_employee',
                        employee,
                        message: `Employee created: ${employee.name}`,
                    });
                }

                case 'update_employee': {
                    const id = this.resolveValue(config.employeeId, context.previousOutputs);
                    if (!id) return this.failed('MISSING_EMPLOYEE_ID', 'Employee ID is required', false);
                    const employee = await this.hrService.updateEmployee(id, entityData as any);
                    if (!employee) return this.failed('EMPLOYEE_NOT_FOUND', `Employee ${id} not found`, false);
                    return this.completed({ operation: 'update_employee', employee, message: `Employee updated: ${employee.name}` });
                }

                case 'get_employees': {
                    let filter: Record<string, unknown> = {};
                    if (config.filter) {
                        try { filter = JSON.parse(this.interpolateTemplates(config.filter, context.previousOutputs)); } catch { /* empty filter */ }
                    }
                    const employees = await this.hrService.getEmployees({
                        tenantId: filter.tenantId as string,
                        limit: (config.limit || filter.limit) as number || 20,
                    });
                    return this.completed({ operation: 'get_employees', employees, total: employees.length, message: `Retrieved ${employees.length} employees` });
                }

                case 'get_employee': {
                    // Resolve employee ID from all possible locations:
                    // 1. Top-level config (hoisted by frontend transform)
                    // 2. entityData (parsed from JSON string)
                    // 3. Raw op_fields (passed through as fallback)
                    const opFields = (config.op_fields && typeof config.op_fields === 'object')
                        ? config.op_fields as Record<string, unknown>
                        : {};
                    const empId =
                        this.resolveValue(config.employeeId, context.previousOutputs) ||
                        this.resolveValue(config.entityId, context.previousOutputs) ||
                        entityData.entityId as string ||
                        entityData.employeeId as string ||
                        entityData.id as string ||
                        (opFields.entityId as string) ||
                        (opFields.employeeId as string);

                    this.logger.debug(`[get_employee] resolved empId=${empId}, config.entityId=${config.entityId}, config.employeeId=${config.employeeId}, entityData=${JSON.stringify(entityData)}, op_fields=${JSON.stringify(opFields)}`);

                    if (!empId) return this.failed('MISSING_EMPLOYEE_ID', 'Employee ID or entityId is required', false);
                    const employee = await this.hrService.getEmployeeById(empId);
                    if (!employee) return this.failed('EMPLOYEE_NOT_FOUND', `Employee ${empId} not found`, false);
                    return this.completed({ operation: 'get_employee', employee, message: `Retrieved employee: ${employee.name}` });
                }

                case 'create_leave_request': {
                    const lr = await this.hrService.createLeaveRequest({
                        employeeId: this.resolveValue(config.employeeId, context.previousOutputs) || entityData.employeeId as string,
                        leaveType: entityData.leave_type as any,
                        startDate: entityData.start_date as string,
                        endDate: entityData.end_date as string,
                        reason: entityData.reason as string,
                    });
                    return this.completed({ operation: 'create_leave_request', leaveRequest: lr, message: `Leave request created: ${lr.leaveType}` });
                }

                case 'log_attendance': {
                    const log = await this.hrService.logAttendance({
                        employeeId: this.resolveValue(config.employeeId, context.previousOutputs) || entityData.employeeId as string,
                        type: entityData.type as any,
                        notes: entityData.notes as string,
                    });
                    return this.completed({ operation: 'log_attendance', attendance: log, message: `Attendance logged: ${log.type}` });
                }

                case 'sync_to_crm': {
                    const empId = this.resolveValue(config.employeeId, context.previousOutputs) || entityData.employeeId as string;
                    if (!empId) return this.failed('MISSING_EMPLOYEE_ID', 'Employee ID is required for CRM sync', false);
                    const employee = await this.hrService.getEmployeeById(empId);
                    if (!employee) return this.failed('EMPLOYEE_NOT_FOUND', `Employee ${empId} not found`, false);
                    if (!this.crmService) return this.failed('CRM_NOT_AVAILABLE', 'CRM service not available', false);

                    const contact = await this.crmService.createContact({
                        name: String(employee.name ?? ''),
                        email: String(employee.email ?? ''),
                        phone: String(employee.phone ?? ''),
                        company: String(employee.department ?? ''),
                        status: (entityData.crm_status as any) || 'customer',
                        source: 'HR Plugin',
                        notes: entityData.notes as string || `Synced from HR - ${employee.position || 'Employee'}`,
                    });
                    return this.completed({ operation: 'sync_to_crm', contact, employee, message: `Employee synced to CRM: ${employee.name}` });
                }

                default:
                    return this.failed('UNKNOWN_OPERATION', `Unknown HR operation: ${config.operation}`, false);
            }
        } catch (error) {
            const err = error as Error;
            this.logger.error(`HR executor error: ${err.message}`, err.stack);
            return this.failed('HR_ERROR', err.message, true);
        }
    }

    private resolveValue(value: string | undefined, data: Record<string, unknown>): string | undefined {
        if (!value) return undefined;
        return value.replace(/\{\{([^}]+)\}\}/g, (_, path) => {
            const resolved = this.getNestedValue(data, path.trim());
            return resolved !== undefined ? String(resolved) : '';
        });
    }

    private interpolateTemplates(template: string, data: Record<string, unknown>): string {
        return template.replace(/\{\{([^}]+)\}\}/g, (_, path) => {
            const value = this.getNestedValue(data, path.trim());
            if (value === undefined) return `{{${path}}}`;
            if (typeof value === 'object') return JSON.stringify(value);
            return String(value);
        });
    }

    private getNestedValue(obj: Record<string, unknown>, path: string): unknown {
        const tokens = path.replace(/\[(\d+)\]/g, '.$1').replace(/\["([^"]+)"\]/g, '.$1').replace(/\['([^']+)'\]/g, '.$1').split('.').filter(Boolean);
        return tokens.reduce((current, key) => {
            if (current === undefined || current === null) return undefined;
            if (Array.isArray(current)) {
                const idx = Number(key);
                if (Number.isInteger(idx)) return current[idx];
                const first = current[0];
                if (first && typeof first === 'object') return (first as Record<string, unknown>)[key];
                return undefined;
            }
            if (typeof current === 'object') return (current as Record<string, unknown>)[key];
            return undefined;
        }, obj as unknown);
    }
}
