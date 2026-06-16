import { Injectable, Logger } from '@nestjs/common';
import { ChannelType, ChannelCredentials } from '../types/channel.types';
import { FirebaseService } from '../../firebase/firebase.service';

// AWS SDK is optional - only loaded if USE_AWS_SECRETS_MANAGER is true
let AWS: any;
try {
  AWS = require('aws-sdk');
} catch (e) {
  // AWS SDK not installed
}

@Injectable()
export class ChannelCredentialsService {
  private readonly logger = new Logger(ChannelCredentialsService.name);
  private readonly secretsManager: any;
  private readonly useSecretsManager: boolean;

  constructor(private readonly firebase: FirebaseService) {
    this.useSecretsManager = process.env.USE_AWS_SECRETS_MANAGER === 'true';

    if (this.useSecretsManager && AWS) {
      this.secretsManager = new AWS.SecretsManager({
        region: process.env.AWS_REGION || 'us-east-1',
      });
    }
  }

  /**
   * Store channel credentials securely
   * Uses AWS Secrets Manager in production, falls back to encrypted Firestore in development
   */
  async storeCredentials(
    tenantId: string,
    channelType: ChannelType,
    credentials: ChannelCredentials,
  ): Promise<void> {
    try {
      const secretName = this.buildSecretName(tenantId, channelType);

      if (this.useSecretsManager && this.secretsManager) {
        // Store in AWS Secrets Manager
        const secretString = JSON.stringify(credentials);
        
        try {
          // Try to update existing secret first
          await this.secretsManager.putSecretValue({
            SecretId: secretName,
            SecretString: secretString,
          }).promise();
        } catch (error: any) {
          if (error.code === 'ResourceNotFoundException') {
            // Create new secret
            await this.secretsManager.createSecret({
              Name: secretName,
              SecretString: secretString,
              Description: `Channel credentials for tenant ${tenantId} - ${channelType}`,
              Tags: [
                { Key: 'tenantId', Value: tenantId },
                { Key: 'channelType', Value: channelType },
                { Key: 'service', Value: 'flyn-channels' },
              ],
            }).promise();
          } else {
            throw error;
          }
        }
      } else {
        // Store in Firestore with encryption
        // This is a fallback for development/testing
        await this.storeInFirestore(tenantId, channelType, credentials);
      }

      this.logger.log(`Stored credentials for tenant ${tenantId} - ${channelType}`);
    } catch (error: any) {
      this.logger.error(`Failed to store credentials: ${error.message}`);
      throw error;
    }
  }

  /**
   * Retrieve channel credentials
   */
  async getCredentials(
    tenantId: string,
    channelType: ChannelType,
  ): Promise<ChannelCredentials> {
    try {
      const secretName = this.buildSecretName(tenantId, channelType);

      if (this.useSecretsManager && this.secretsManager) {
        const result = await this.secretsManager.getSecretValue({
          SecretId: secretName,
        }).promise();

        if (result.SecretString) {
          return JSON.parse(result.SecretString);
        }
        throw new Error('Secret not found or empty');
      } else {
        // Retrieve from Firestore
        return await this.getFromFirestore(tenantId, channelType);
      }
    } catch (error: any) {
      this.logger.error(`Failed to get credentials: ${error.message}`);
      throw error;
    }
  }

  /**
   * Delete channel credentials
   */
  async deleteCredentials(
    tenantId: string,
    channelType: ChannelType,
  ): Promise<void> {
    try {
      const secretName = this.buildSecretName(tenantId, channelType);

      if (this.useSecretsManager && this.secretsManager) {
        await this.secretsManager.deleteSecret({
          SecretId: secretName,
          ForceDeleteWithoutRecovery: true,
        }).promise();
      } else {
        // Delete from Firestore
        await this.deleteFromFirestore(tenantId, channelType);
      }

      this.logger.log(`Deleted credentials for tenant ${tenantId} - ${channelType}`);
    } catch (error: any) {
      this.logger.error(`Failed to delete credentials: ${error.message}`);
      throw error;
    }
  }

  /**
   * Rotate/update specific credential fields
   */
  async updateCredentials(
    tenantId: string,
    channelType: ChannelType,
    updates: Partial<ChannelCredentials>,
  ): Promise<void> {
    const existing = await this.getCredentials(tenantId, channelType);
    const merged = { ...existing, ...updates };
    await this.storeCredentials(tenantId, channelType, merged);
  }

  // ── Per-channel-ID credential storage (multi-account support) ────────────

  /** Store credentials keyed by channelId (e.g. "wa_web_123") instead of channel type. */
  async storeCredentialsByChannelId(
    tenantId: string,
    channelId: string,
    credentials: ChannelCredentials,
  ): Promise<void> {
    const db = this.firebase.firestore();
    if (!db) throw new Error('Firestore unavailable');
    await db
      .collection('tenants').doc(tenantId)
      .collection('channelCredentials').doc(channelId)
      .set({ ...credentials, updatedAt: Date.now() }, { merge: true });
    this.logger.log(`Stored credentials for tenant ${tenantId} - channel ${channelId}`);
  }

  /**
   * Read credentials by channelId with optional fallback to type-keyed doc
   * (backward compat for accounts connected before multi-account support).
   */
  async getCredentialsByChannelId(
    tenantId: string,
    channelId: string,
    fallbackType?: ChannelType,
  ): Promise<ChannelCredentials> {
    const db = this.firebase.firestore();
    if (!db) throw new Error('Firestore unavailable');
    const doc = await db
      .collection('tenants').doc(tenantId)
      .collection('channelCredentials').doc(channelId)
      .get();
    if (doc.exists) {
      const { updatedAt, ...creds } = doc.data() as any;
      return creds as ChannelCredentials;
    }
    if (fallbackType) {
      return this.getFromFirestore(tenantId, fallbackType);
    }
    throw new Error(`No credentials found for channel ${channelId}`);
  }

  /** Delete credentials by channelId. */
  async deleteCredentialsByChannelId(tenantId: string, channelId: string): Promise<void> {
    const db = this.firebase.firestore();
    if (!db) return;
    await db
      .collection('tenants').doc(tenantId)
      .collection('channelCredentials').doc(channelId)
      .delete();
    this.logger.log(`Deleted credentials for channel ${channelId}`);
  }

  // ─────────────────────────────────────────────────────────────────────────

  private buildSecretName(tenantId: string, channelType: ChannelType): string {
    // Format: flyn-channels/{tenantId}/{channelType}
    return `flyn-channels/${tenantId}/${channelType}`;
  }

  private async storeInFirestore(
    tenantId: string,
    channelType: ChannelType,
    credentials: ChannelCredentials,
  ): Promise<void> {
    const db = this.firebase.firestore();
    if (!db) throw new Error('Firestore unavailable');
    await db
      .collection('tenants')
      .doc(tenantId)
      .collection('channelCredentials')
      .doc(channelType)
      .set({ ...credentials, updatedAt: Date.now() }, { merge: true });
  }

  private async getFromFirestore(
    tenantId: string,
    channelType: ChannelType,
  ): Promise<ChannelCredentials> {
    const db = this.firebase.firestore();
    if (!db) throw new Error('Firestore unavailable');
    const doc = await db
      .collection('tenants')
      .doc(tenantId)
      .collection('channelCredentials')
      .doc(channelType)
      .get();
    if (!doc.exists) throw new Error(`No credentials found for tenant ${tenantId} channel ${channelType}`);
    const { updatedAt, ...creds } = doc.data() as any;
    return creds as ChannelCredentials;
  }

  private async deleteFromFirestore(
    tenantId: string,
    channelType: ChannelType,
  ): Promise<void> {
    const db = this.firebase.firestore();
    if (!db) throw new Error('Firestore unavailable');
    await db
      .collection('tenants')
      .doc(tenantId)
      .collection('channelCredentials')
      .doc(channelType)
      .delete();
  }
}
