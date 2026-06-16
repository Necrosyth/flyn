/**
 * Church Types
 */

export interface Member {
    id?: string;
    _id: string;
    name: string;
    email?: string;
    phone?: string;
    familyId?: string;
    membershipType: 'visitor' | 'member' | 'leader' | 'pastor';
    status: 'active' | 'inactive';
    discipleshipStage?: string;
    ministryTier?: string;
    lastAttendance?: string;
    givingCapacity?: string;
    attendanceRate?: string | number;
    notes?: string;
    signature?: string;
    createdAt: Date;
    updatedAt: Date;
}

export interface Donation {
    id?: string;
    _id: string;
    memberId: string;
    amount: number;
    donationType: 'tithe' | 'offering' | 'building_fund' | 'missions' | 'other';
    notes?: string;
    createdAt: Date;
}

export interface ChurchEvent {
    id?: string;
    _id: string;
    title: string;
    date: string;
    time?: string;
    location?: string;
    eventType: 'service' | 'small_group' | 'outreach' | 'conference' | 'youth';
    description?: string;
    createdAt: Date;
}
