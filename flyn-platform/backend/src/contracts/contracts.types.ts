/**
 * Contracts & eSignature Engine — Type Definitions
 *
 * Cross-module contracts system shared across CRM, HR, Freelance, and API layers.
 * Based on FLYN_AI_Contracts_Module_Implementation.pdf
 */

// ============================================================================
// CONTRACT
// ============================================================================

export type ContractStatus = 'draft' | 'sent' | 'viewed' | 'signed' | 'declined' | 'expired' | 'voided';
export type ContractType = 'nda' | 'employment' | 'freelance' | 'sales' | 'service' | 'custom';
export type SignerRole = 'client' | 'freelancer' | 'employer' | 'employee' | 'vendor' | 'witness';

export interface Contract {
    _id: string;
    organizationId?: string;
    templateId?: string;
    title: string;
    type: ContractType;
    status: ContractStatus;
    content: string;             // HTML content of the contract
    fileUrl?: string;            // Generated PDF URL
    metadata?: Record<string, unknown>;
    sourceModule?: string;       // 'CRM' | 'HR' | 'Freelance' | 'Website' | 'API'
    sourceEntityId?: string;     // Deal ID, Job ID, Employee ID, etc.
    expiresAt?: string;
    createdAt: Date;
    updatedAt: Date;
}

export interface ContractCreateDto {
    title: string;
    type: ContractType;
    content?: string;
    templateId?: string;
    templateVariables?: Record<string, string>;
    organizationId?: string;
    sourceModule?: string;
    sourceEntityId?: string;
    expiresAt?: string;
    signers?: SignerCreateDto[];
}

export interface ContractUpdateDto {
    title?: string;
    content?: string;
    status?: ContractStatus;
    fileUrl?: string;
    expiresAt?: string;
    metadata?: Record<string, unknown>;
}

// ============================================================================
// SIGNER
// ============================================================================

export type SignerStatus = 'pending' | 'sent' | 'viewed' | 'signed' | 'declined';

export interface Signer {
    _id: string;
    contractId: string;
    name: string;
    email: string;
    phone?: string;
    role: SignerRole;
    order: number;              // Signing order (1, 2, 3...)
    status: SignerStatus;
    signingToken?: string;      // One-time use token
    tokenExpiresAt?: string;
    signedAt?: string;
    createdAt: Date;
}

export interface SignerCreateDto {
    name: string;
    email: string;
    phone?: string;
    role: SignerRole;
    order?: number;
}

// ============================================================================
// SIGNATURE
// ============================================================================

export type SignatureMethod = 'draw' | 'type' | 'upload';

export interface Signature {
    _id: string;
    contractId: string;
    signerId: string;
    signatureData: string;      // Base64 or URL of signature image/data
    method: SignatureMethod;
    signedAt: Date;
    ipAddress?: string;
    userAgent?: string;
}

export interface SignatureCreateDto {
    contractId: string;
    signerId: string;
    signingToken: string;
    signatureData: string;
    method: SignatureMethod;
    ipAddress?: string;
    userAgent?: string;
}

// ============================================================================
// TEMPLATE
// ============================================================================

export interface ContractTemplate {
    _id: string;
    organizationId?: string;
    name: string;
    type: ContractType;
    htmlTemplate: string;       // HTML with {{variable}} placeholders
    variables: string[];        // List of variable names the template uses
    isDefault: boolean;
    createdAt: Date;
    updatedAt: Date;
}

export interface TemplateCreateDto {
    name: string;
    type: ContractType;
    htmlTemplate: string;
    variables?: string[];
    organizationId?: string;
    isDefault?: boolean;
}

// ============================================================================
// CONTRACT EVENT (Audit Trail)
// ============================================================================

export type ContractEventType =
    | 'contract.created'
    | 'contract.sent'
    | 'contract.viewed'
    | 'contract.signed'
    | 'contract.declined'
    | 'contract.voided'
    | 'contract.expired'
    | 'signer.added'
    | 'signer.notified'
    | 'signature.captured';

export interface ContractEvent {
    _id: string;
    contractId: string;
    type: ContractEventType;
    actorId?: string;
    actorName?: string;
    payload?: Record<string, unknown>;
    ipAddress?: string;
    createdAt: Date;
}

// ============================================================================
// DASHBOARD / STATS
// ============================================================================

export interface ContractDashboardStats {
    totalContracts: number;
    draftCount: number;
    sentCount: number;
    signedCount: number;
    declinedCount: number;
    expiredCount: number;
    averageSigningTime?: string;  // e.g. "2.3 days"
    recentEvents: ContractEvent[];
    statusBreakdown: { status: string; count: number }[];
    typeBreakdown: { type: string; count: number }[];
}
