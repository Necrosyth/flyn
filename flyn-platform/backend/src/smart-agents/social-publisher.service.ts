/**
 * Social Publisher — turns scheduled `agent_social_posts` into real posts on the
 * connected platform, and runs a per-minute scheduler that publishes due posts.
 *
 * Connection reality (see Exchanged_docs/Social_Publishing_Plan.md):
 *  - Twitter/X + LinkedIn: stored OAuth tokens already carry publish scopes → live.
 *  - Facebook Page + Instagram: code paths ready, but need a Page/IG-publish connect
 *    (page token + ig user id) and Meta App Review before they can fire.
 */
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { FirebaseService } from '../firebase/firebase.service';
import { ChannelsService } from '../channels/channels.service';
import { ChannelCredentialsService } from '../channels/services/channel-credentials.service';
import { ChannelType } from '../channels/types/channel.types';
import { SocialPost, SocialPlatform } from './smart-agents.types';

const POSTS_COL = 'agent_social_posts';
const MAX_ATTEMPTS = 3;

const PLATFORM_CHANNEL: Record<string, ChannelType> = {
  twitter: ChannelType.TWITTER,
  linkedin: ChannelType.LINKEDIN,
  facebook: ChannelType.FACEBOOK,
  instagram: ChannelType.INSTAGRAM,
};

@Injectable()
export class SocialPublisherService {
  private readonly logger = new Logger(SocialPublisherService.name);

  constructor(
    private readonly firebase: FirebaseService,
    private readonly channels: ChannelsService,
    private readonly credentials: ChannelCredentialsService,
  ) {}

  private fs() { return this.firebase.firestore(); }

  /** Which social platforms the tenant has a connected (active) channel for. */
  async getConnectedPlatforms(tenantId: string): Promise<SocialPlatform[]> {
    const chans = await this.channels.getTenantChannels(tenantId).catch(() => []);
    const out = new Set<SocialPlatform>();
    for (const c of chans) {
      if (c?.status && c.status !== 'active') continue;
      const p = Object.entries(PLATFORM_CHANNEL).find(([, t]) => t === c.type)?.[0];
      if (p) out.add(p as SocialPlatform);
    }
    return [...out];
  }

  /** Resolve the active channel + decrypted credentials for a platform. */
  private async resolveChannel(tenantId: string, platform: string): Promise<{ channelId: string; creds: any } | null> {
    const type = PLATFORM_CHANNEL[platform];
    if (!type) return null;
    const chans = await this.channels.getTenantChannels(tenantId).catch(() => []);
    const chan = chans.find((c: any) => c.type === type && (!c.status || c.status === 'active'));
    if (!chan) return null;
    try {
      const creds = await this.credentials.getCredentialsByChannelId(tenantId, chan.id, type);
      return { channelId: chan.id, creds };
    } catch (e: any) {
      this.logger.warn(`resolveChannel(${platform}) creds failed: ${e?.message || e}`);
      return null;
    }
  }

  /**
   * Publish one post to its platform. Returns { publishedId, publishedUrl }.
   * Throws on failure (caller records the error + retries).
   */
  async publish(tenantId: string, post: SocialPost): Promise<{ publishedId: string; publishedUrl?: string }> {
    const resolved = await this.resolveChannel(tenantId, post.platform);
    if (!resolved) throw new Error(`No connected ${post.platform} channel`);
    const text = [post.caption, (post.hashtags || []).join(' ')].filter(Boolean).join('\n\n').trim();
    const media = post.mediaUrls || [];

    switch (post.platform) {
      case 'twitter': return this.publishTwitter(tenantId, resolved, text);
      case 'linkedin': return this.publishLinkedIn(resolved, text);
      case 'facebook': return this.publishFacebook(resolved, text, media);
      case 'instagram': return this.publishInstagram(resolved, text, media);
      default: throw new Error(`Publishing not supported for ${post.platform}`);
    }
  }

  // ─── Twitter / X ───────────────────────────────────────────────────────────
  private async publishTwitter(tenantId: string, resolved: { channelId: string; creds: any }, text: string) {
    let token = resolved.creds.accessToken;
    if (!token) throw new Error('Twitter access token missing');
    let res = await fetch('https://api.twitter.com/2/tweets', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: text.slice(0, 280) }),
    });
    if (res.status === 401 && resolved.creds.refreshToken) {
      token = await this.refreshTwitter(tenantId, resolved);
      res = await fetch('https://api.twitter.com/2/tweets', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: text.slice(0, 280) }),
      });
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`Twitter ${res.status}: ${JSON.stringify(data)}`);
    const id = data?.data?.id;
    return { publishedId: id, publishedUrl: id ? `https://twitter.com/i/web/status/${id}` : undefined };
  }

  private async refreshTwitter(tenantId: string, resolved: { channelId: string; creds: any }): Promise<string> {
    const clientId = process.env.TWITTER_CLIENT_ID || '';
    const clientSecret = process.env.TWITTER_CLIENT_SECRET || '';
    const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: resolved.creds.refreshToken,
      client_id: clientId,
    });
    const res = await fetch('https://api.twitter.com/2/oauth2/token', {
      method: 'POST',
      headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`Twitter refresh ${res.status}: ${JSON.stringify(data)}`);
    // Persist the rotated tokens back to the channel credentials (best-effort).
    try {
      await this.credentials.storeCredentialsByChannelId(tenantId, resolved.channelId, {
        ...resolved.creds, accessToken: data.access_token, refreshToken: data.refresh_token || resolved.creds.refreshToken,
      });
    } catch { /* non-fatal */ }
    return data.access_token;
  }

  // ─── LinkedIn ────────────────────────────────────────────────────────────────
  private async publishLinkedIn(resolved: { channelId: string; creds: any }, text: string) {
    const token = resolved.creds.accessToken;
    if (!token) throw new Error('LinkedIn access token missing');
    // Author URN: use stored value, else derive from /v2/userinfo (OpenID `sub`).
    let urn = resolved.creds.authorUrn || (resolved.creds.linkedinId ? `urn:li:person:${resolved.creds.linkedinId}` : undefined);
    if (!urn) {
      const me = await fetch('https://api.linkedin.com/v2/userinfo', { headers: { Authorization: `Bearer ${token}` } });
      const meData = await me.json().catch(() => ({}));
      if (meData?.sub) urn = `urn:li:person:${meData.sub}`;
    }
    if (!urn) throw new Error('LinkedIn author URN unavailable (re-auth with openid/profile)');
    const res = await fetch('https://api.linkedin.com/v2/ugcPosts', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'X-Restli-Protocol-Version': '2.0.0' },
      body: JSON.stringify({
        author: urn,
        lifecycleState: 'PUBLISHED',
        specificContent: {
          'com.linkedin.ugc.ShareContent': {
            shareCommentary: { text },
            shareMediaCategory: 'NONE',
          },
        },
        visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' },
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`LinkedIn ${res.status}: ${JSON.stringify(data)}`);
    const id = data?.id;
    return { publishedId: id, publishedUrl: id ? `https://www.linkedin.com/feed/update/${id}` : undefined };
  }

  // ─── Facebook Page ─────────────────────────────────────────────────────────
  private async publishFacebook(resolved: { channelId: string; creds: any }, text: string, media: string[]) {
    const pageId = resolved.creds.pageId || resolved.creds.facebookPageId;
    const pageToken = resolved.creds.pageAccessToken || resolved.creds.accessToken;
    if (!pageId || !pageToken) throw new Error('Facebook Page id / page token missing (connect a Page with pages_manage_posts)');
    const graph = 'https://graph.facebook.com/v18.0';
    let res: Response;
    if (media[0]) {
      res = await fetch(`${graph}/${pageId}/photos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: media[0], caption: text, access_token: pageToken }),
      });
    } else {
      res = await fetch(`${graph}/${pageId}/feed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, access_token: pageToken }),
      });
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`Facebook ${res.status}: ${JSON.stringify(data)}`);
    const id = data?.post_id || data?.id;
    return { publishedId: id, publishedUrl: id ? `https://www.facebook.com/${id}` : undefined };
  }

  // ─── Instagram (Business) ────────────────────────────────────────────────────
  private async publishInstagram(resolved: { channelId: string; creds: any }, text: string, media: string[]) {
    const igUserId = resolved.creds.instagramId || resolved.creds.igUserId;
    const token = resolved.creds.pageAccessToken || resolved.creds.accessToken;
    if (!igUserId || !token) throw new Error('Instagram business id / token missing');
    if (!media[0]) throw new Error('Instagram requires an image (mediaUrls[0])');
    const graph = 'https://graph.facebook.com/v18.0';
    // 1) Create media container
    const createRes = await fetch(`${graph}/${igUserId}/media`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image_url: media[0], caption: text, access_token: token }),
    });
    const createData = await createRes.json().catch(() => ({}));
    if (!createRes.ok) throw new Error(`Instagram container ${createRes.status}: ${JSON.stringify(createData)}`);
    // 2) Publish the container
    const pubRes = await fetch(`${graph}/${igUserId}/media_publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ creation_id: createData.id, access_token: token }),
    });
    const pubData = await pubRes.json().catch(() => ({}));
    if (!pubRes.ok) throw new Error(`Instagram publish ${pubRes.status}: ${JSON.stringify(pubData)}`);
    return { publishedId: pubData.id, publishedUrl: pubData.id ? `https://www.instagram.com/p/${pubData.id}` : undefined };
  }

  // ─── Persistence + scheduler ──────────────────────────────────────────────────

  /** Publish a single stored post now and persist the outcome. */
  async publishStoredPost(tenantId: string, postId: string): Promise<SocialPost> {
    const db = this.fs();
    const ref = db.collection(POSTS_COL).doc(postId);
    const snap = await ref.get();
    if (!snap.exists) throw new Error('Post not found');
    const post = snap.data() as SocialPost;
    await ref.update({ status: 'publishing', claimedAt: Date.now() });
    try {
      const { publishedId, publishedUrl } = await this.publish(tenantId, post);
      const update: Partial<SocialPost> = {
        status: 'published', publishedId, publishedUrl,
        publishedAt: new Date().toISOString(), attempts: (post.attempts || 0) + 1,
      };
      await ref.update(update as any);
      this.logger.log(`Published ${post.platform} post ${postId} for ${tenantId}`);
      return { ...post, ...update };
    } catch (e: any) {
      const attempts = (post.attempts || 0) + 1;
      await ref.update({ status: 'failed', error: String(e?.message || e), attempts });
      this.logger.warn(`Publish failed ${post.platform} post ${postId}: ${e?.message || e}`);
      throw e;
    }
  }

  /** Reset a failed post so the scheduler picks it up again. */
  async retryPost(postId: string): Promise<void> {
    await this.fs().collection(POSTS_COL).doc(postId).update({
      status: 'scheduled', scheduledAt: new Date().toISOString(), error: null,
    });
  }

  /** Every minute: publish posts whose scheduledAt has arrived. */
  @Cron(CronExpression.EVERY_MINUTE)
  async runScheduler(): Promise<void> {
    const db = this.fs();
    if (!db) return;
    const nowIso = new Date().toISOString();
    let due: FirebaseFirestore.QuerySnapshot;
    try {
      // Single-field filter only (no composite index needed); time-filter in memory.
      due = await db.collection(POSTS_COL)
        .where('status', '==', 'scheduled')
        .limit(100).get();
    } catch (e: any) {
      this.logger.warn(`scheduler query failed: ${e?.message || e}`);
      return;
    }
    const dueDocs = due.docs.filter((d) => {
      const sa = (d.data() as SocialPost)?.scheduledAt;
      return !!sa && sa <= nowIso;
    });
    for (const doc of dueDocs) {
      const post = doc.data() as SocialPost;
      if ((post.attempts || 0) >= MAX_ATTEMPTS) {
        await doc.ref.update({ status: 'failed', error: 'Max attempts reached' }).catch(() => {});
        continue;
      }
      // Atomic claim so a second instance can't double-send.
      const claimed = await db.runTransaction(async (tx) => {
        const fresh = await tx.get(doc.ref);
        if ((fresh.data() as SocialPost)?.status !== 'scheduled') return false;
        tx.update(doc.ref, { status: 'publishing', claimedAt: Date.now() });
        return true;
      }).catch(() => false);
      if (!claimed) continue;
      try {
        const { publishedId, publishedUrl } = await this.publish(post.tenantId!, post);
        await doc.ref.update({
          status: 'published', publishedId, publishedUrl,
          publishedAt: new Date().toISOString(), attempts: (post.attempts || 0) + 1,
        });
        this.logger.log(`[scheduler] published ${post.platform} ${doc.id}`);
      } catch (e: any) {
        await doc.ref.update({ status: 'failed', error: String(e?.message || e), attempts: (post.attempts || 0) + 1 }).catch(() => {});
      }
    }
  }
}
