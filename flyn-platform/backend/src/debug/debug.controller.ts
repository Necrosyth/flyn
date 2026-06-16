import { Controller, Get, Query, Logger } from '@nestjs/common';
import { FirebaseService } from '../firebase/firebase.service';
import * as admin from 'firebase-admin';

@Controller('debug')
export class DebugController {
  private readonly logger = new Logger(DebugController.name);

  constructor(private readonly firebase: FirebaseService) {}

  @Get('firestore')
  async debugFirestore(@Query('tenantId') tenantId: string) {
    const db = this.firebase.firestore();
    const isInitialized = !!this.firebase;
    const hasDb = !!db;

    const result: any = {
      isInitialized,
      hasDb,
      env: {
        has_B64: !!process.env.FIREBASE_SERVICE_ACCOUNT_B64,
        has_PATH: !!process.env.FIREBASE_SERVICE_ACCOUNT_PATH,
        projectId: process.env.FIREBASE_PROJECT_ID,
      },
    };

    if (db && tenantId) {
      try {
        const tenantDoc = await db.collection('tenants').doc(tenantId).get();
        result.tenantExists = tenantDoc.exists;
        if (tenantDoc.exists) {
          result.tenantData = tenantDoc.data();
          
          const channelsSnap = await db.collection('tenants').doc(tenantId).collection('channels').get();
          result.channelsCount = channelsSnap.size;
          result.channels = channelsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        }
      } catch (err) {
        result.error = err.message;
      }
    }

    return result;
  }
}
