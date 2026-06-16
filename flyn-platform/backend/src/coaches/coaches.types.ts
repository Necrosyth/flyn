/**
 * Coaches Types
 */

export interface Client {
    _id: string;
    name: string;
    email: string;
    phone?: string;
    program: 'individual' | 'group' | 'executive' | 'career' | 'life';
    status: 'active' | 'paused' | 'completed' | 'inactive';
    goals?: string;
    notes?: string;
    createdAt: Date;
    updatedAt: Date;
}

export interface Session {
    _id: string;
    clientId: string;
    date: string;
    time?: string;
    duration: number; // minutes
    sessionType: 'one_on_one' | 'group' | 'assessment' | 'follow_up';
    agenda?: string;
    status: 'scheduled' | 'completed' | 'cancelled';
    createdAt: Date;
}

export interface ProgressLog {
    _id: string;
    clientId: string;
    milestone: string;
    rating: number; // 1-10
    notes?: string;
    createdAt: Date;
}
