import { Injectable, Logger } from '@nestjs/common';
import * as admin from 'firebase-admin';
import { readFileSync } from 'fs';
import { getDemoDecodedToken, isDemoAuthToken } from '../common/demo-auth';

@Injectable()
export class FirebaseService {
  private readonly logger = new Logger(FirebaseService.name);
  private app?: admin.app.App;

  constructor() {
    try {
      if (admin.apps.length) {
        this.app = admin.app();
        return;
      }

      const b64 = process.env.FIREBASE_SERVICE_ACCOUNT_B64;
      const path = process.env.FIREBASE_SERVICE_ACCOUNT_PATH || process.env.GOOGLE_APPLICATION_CREDENTIALS;
      let serviceAccount: admin.ServiceAccount | undefined;

      // AWS-style secrets (see AWS_SETUP.md): allow providing these without a JSON file
      const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
      const privateKeyRaw = process.env.FIREBASE_PRIVATE_KEY;
      const projectId = process.env.FIREBASE_PROJECT_ID;

      if (b64) {
        const json = Buffer.from(b64, 'base64').toString('utf-8');
        serviceAccount = JSON.parse(json) as admin.ServiceAccount;
      } else if (path) {
        const json = readFileSync(path, 'utf-8');
        serviceAccount = JSON.parse(json) as admin.ServiceAccount;
      } else if (clientEmail && privateKeyRaw) {
        // private key commonly stored with escaped newlines
        const privateKey = privateKeyRaw.replace(/\\n/g, '\n');
        serviceAccount = {
          projectId,
          clientEmail,
          privateKey,
        } as admin.ServiceAccount;
      }

      if (!serviceAccount) {
        this.logger.warn('Firebase Admin not configured. Set FIREBASE_SERVICE_ACCOUNT_B64 or FIREBASE_SERVICE_ACCOUNT_PATH.');
        return;
      }

      this.app = admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
      this.logger.log('Firebase initialized successfully from environment configuration.');
    } catch (err) {
      this.logger.error('Failed to initialize Firebase', err as Error);
    }
  }

  firestore(): admin.firestore.Firestore | undefined {
    if (!this.app) return undefined;
    const db = admin.firestore();
    try {
      db.settings({ ignoreUndefinedProperties: true });
    } catch (e) {
      // Ignore "already initialized" errors
    }
    return db;
  }

  auth(): admin.auth.Auth | undefined {
    if (!this.app) return undefined;
    return admin.auth();
  }

  async getUserByEmail(email: string): Promise<admin.auth.UserRecord> {
    const auth = this.auth();
    if (!auth) throw new Error('Firebase not initialized');
    return auth.getUserByEmail(email);
  }

  async getOrCreateUserByEmail(email: string): Promise<admin.auth.UserRecord> {
    const auth = this.auth();
    if (!auth) throw new Error('Firebase not initialized');

    try {
      return await auth.getUserByEmail(email);
    } catch (err) {
      const code = (err as any)?.code as string | undefined;
      if (code !== 'auth/user-not-found') throw err;
      return auth.createUser({ email });
    }
  }

  async getOrCreateUserByEmailWithPassword(
    email: string,
    password?: string,
  ): Promise<admin.auth.UserRecord> {
    const auth = this.auth();
    if (!auth) throw new Error('Firebase not initialized');

    try {
      const user = await auth.getUserByEmail(email);
      if (password) {
        await auth.updateUser(user.uid, { password });
        return auth.getUser(user.uid);
      }
      return user;
    } catch (err) {
      const code = (err as any)?.code as string | undefined;
      if (code !== 'auth/user-not-found') throw err;
      return auth.createUser({ email, password });
    }
  }

  async verifyIdToken(idToken: string): Promise<admin.auth.DecodedIdToken> {
    if (isDemoAuthToken(idToken)) {
      return getDemoDecodedToken() as unknown as admin.auth.DecodedIdToken;
    }
    const auth = this.auth();
    if (!auth) throw new Error('Firebase not initialized');
    return auth.verifyIdToken(idToken);
  }

  async setCustomUserClaims(uid: string, claims: Record<string, any>): Promise<void> {
    const auth = this.auth();
    if (!auth) throw new Error('Firebase not initialized');
    await auth.setCustomUserClaims(uid, claims);
  }

  storage(): admin.storage.Storage | undefined {
    if (!this.app) return undefined;
    return admin.storage();
  }
}
