import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { FirebaseService } from '../../firebase/firebase.service';
import { Region } from '../region/region.types';
import { Plan, CreatePlanDto } from './plans.types';

/**
 * PlansService
 *
 * Manages billing plans stored in Firestore under the 'billing_plans' collection.
 *
 * Plans are created by admins and include per-region pricing + gateway plan IDs.
 * They are read-heavy (cached per request) and write-rare (admin only).
 */
@Injectable()
export class PlansService {
  private readonly logger = new Logger(PlansService.name);
  private readonly COLLECTION = 'billing_plans';

  constructor(private readonly firebase: FirebaseService) {}

  private col() {
    const db = this.firebase.firestore();
    if (!db) throw new Error('Firestore not initialised');
    return db.collection(this.COLLECTION);
  }

  // ───────────────────────────────────────
  // Reads
  // ───────────────────────────────────────

  async listPlans(): Promise<Plan[]> {
    const snap = await this.col().where('isActive', '==', true).get();
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Plan));
  }

  async listPlansForRegion(region: Region): Promise<Plan[]> {
    const all = await this.listPlans();
    // Filter to plans that have pricing for the requested region.
    return all.filter((p) => p.pricing.some((px) => px.region === region));
  }

  async getPlan(planId: string): Promise<Plan> {
    const doc = await this.col().doc(planId).get();
    if (!doc.exists) throw new NotFoundException(`Plan ${planId} not found`);
    return { id: doc.id, ...doc.data() } as Plan;
  }

  // ───────────────────────────────────────
  // Writes (admin only — controller enforces auth)
  // ───────────────────────────────────────

  async createPlan(dto: CreatePlanDto & { id?: string }): Promise<Plan> {
    const now = Date.now();
    const id = dto.id || randomUUID();
    const plan: Plan = {
      id,
      name: dto.name,
      description: dto.description,
      interval: dto.interval,
      features: dto.features,
      isActive: true,
      pricing: dto.pricing,
      gatewayPlanIds: dto.gatewayPlanIds,
      createdAt: now,
      updatedAt: now,
    };

    await this.col().doc(id).set(plan);
    this.logger.log(`Plan created: ${id} (${plan.name})`);
    return plan;
  }

  async updatePlan(planId: string, updates: Partial<Omit<Plan, 'id' | 'createdAt'>>): Promise<Plan> {
    const existing = await this.getPlan(planId);
    const updated: Plan = {
      ...existing,
      ...updates,
      id: planId,
      updatedAt: Date.now(),
    };
    await this.col().doc(planId).set(updated);
    return updated;
  }

  async archivePlan(planId: string): Promise<void> {
    await this.getPlan(planId); // throws if not found
    await this.col().doc(planId).update({ isActive: false, updatedAt: Date.now() });
  }
}
