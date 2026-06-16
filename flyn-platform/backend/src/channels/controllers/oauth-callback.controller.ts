import { Controller, Get, Query, Res, Logger, BadRequestException } from '@nestjs/common';
import { Response } from 'express';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { ChannelCredentialsService } from '../services/channel-credentials.service';
import { Public } from '../../billing/guards/public.decorator';

@Controller('channels/oauth/callback')
export class OAuthCallbackController {
    private readonly logger = new Logger(OAuthCallbackController.name);

    constructor(
        private readonly httpService: HttpService,
        private readonly credentialsService: ChannelCredentialsService,
    ) {}

    /**
     * GET /api/channels/oauth/callback/facebook
     */
    @Public()
    @Get('facebook')
    async facebookCallback(@Query('code') code: string, @Res() res: Response) {
        if (!code) throw new BadRequestException('Code is missing');

        try {
            // 1. Exchange code for short-lived token
            const tokenResponse = await firstValueFrom(
                this.httpService.get('https://graph.facebook.com/v18.0/oauth/access_token', {
                    params: {
                        client_id: process.env.FACEBOOK_APP_ID,
                        client_secret: process.env.FACEBOOK_APP_SECRET,
                        redirect_uri: `${process.env.BACKEND_URL}/api/channels/oauth/callback/facebook`,
                        code,
                    },
                }),
            );

            const shortToken = tokenResponse.data.access_token;

            // 2. Exchange short-lived token for long-lived token (60 days)
            const longTokenResponse = await firstValueFrom(
                this.httpService.get('https://graph.facebook.com/v18.0/oauth/access_token', {
                    params: {
                        grant_type: 'fb_exchange_token',
                        client_id: process.env.FACEBOOK_APP_ID,
                        client_secret: process.env.FACEBOOK_APP_SECRET,
                        fb_exchange_token: shortToken,
                    },
                }),
            );

            const longToken = longTokenResponse.data.access_token;

            // Redirect back with the long-lived token
            return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:8080'}/settings/channels?success=true&type=facebook&token=${longToken}`);
        } catch (err) {
            const msg = err?.response?.data?.error?.message || err.message;
            this.logger.error(`Facebook OAuth Error: ${msg}`);
            return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:8080'}/settings/channels?error=${encodeURIComponent(msg)}`);
        }
    }

    /**
     * GET /api/channels/oauth/callback/slack
     */
    @Public()
    @Get('slack')
    async slackCallback(@Query('code') code: string, @Query('state') state: string, @Res() res: Response) {
        if (!code) throw new BadRequestException('Code is missing');

        try {
            const response = await firstValueFrom(
                this.httpService.post('https://slack.com/api/oauth.v2.access', null, {
                    params: {
                        client_id: process.env.SLACK_CLIENT_ID,
                        client_secret: process.env.SLACK_CLIENT_SECRET,
                        code,
                    },
                }),
            );

            if (!response.data.ok) throw new Error(response.data.error || 'Slack OAuth failed');

            const { access_token, team, bot_user_id } = response.data;
            
            // Logic to identify tenant from state or session
            // For now, redirecting back with the token so frontend can complete the save
            return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:8080'}/settings/channels?success=true&type=slack&token=${access_token}&teamId=${team.id}&botId=${bot_user_id}`);
        } catch (err) {
            this.logger.error(`Slack OAuth Error: ${err.message}`);
            return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:8080'}/settings/channels?error=${encodeURIComponent(err.message)}`);
        }
    }

    /**
     * GET /api/channels/oauth/callback/linkedin
     */
    @Public()
    @Get('linkedin')
    async linkedinCallback(@Query('code') code: string, @Res() res: Response) {
        if (!code) throw new BadRequestException('Code is missing');

        try {
            const response = await firstValueFrom(
                this.httpService.post('https://www.linkedin.com/oauth/v2/accessToken', null, {
                    params: {
                        grant_type: 'authorization_code',
                        code,
                        client_id: process.env.LINKEDIN_CLIENT_ID,
                        client_secret: process.env.LINKEDIN_CLIENT_SECRET,
                        redirect_uri: `${process.env.BACKEND_URL}/api/channels/oauth/callback/linkedin`,
                    },
                }),
            );

            const { access_token } = response.data;
            return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:8080'}/settings/channels?success=true&type=linkedin&token=${access_token}`);
        } catch (err) {
            this.logger.error(`LinkedIn OAuth Error: ${err.message}`);
            return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:8080'}/settings/channels?error=${encodeURIComponent(err.message)}`);
        }
    }

    /**
     * GET /api/channels/oauth/callback/tiktok
     */
    @Public()
    @Get('tiktok')
    async tiktokCallback(@Query('auth_code') code: string, @Res() res: Response) {
        if (!code) throw new BadRequestException('Code is missing');

        try {
            const response = await firstValueFrom(
                this.httpService.post('https://business-api.tiktok.com/open_api/v1.3/oauth2/access_token/', {
                    app_id: process.env.TIKTOK_CLIENT_KEY,
                    secret: process.env.TIKTOK_CLIENT_SECRET,
                    auth_code: code,
                }),
            );

            if (response.data.code !== 0) throw new Error(response.data.message || 'TikTok OAuth failed');

            const { access_token } = response.data.data;
            return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:8080'}/settings/channels?success=true&type=tiktok&token=${access_token}`);
        } catch (err) {
            this.logger.error(`TikTok OAuth Error: ${err.message}`);
            return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:8080'}/settings/channels?error=${encodeURIComponent(err.message)}`);
        }
    }

    // ─── Twitter / X ───────────────────────────────────────────────────────────

    /**
     * GET /api/channels/oauth/callback/twitter
     *
     * Handles Twitter OAuth 2.0 + PKCE Authorization Code flow.
     * The frontend encodes {codeVerifier} in the state param as base64url JSON.
     * We decode it, exchange the code (using the verifier), then postMessage the
     * token back to the opener window and close the popup.
     */
    @Public()
    @Get('twitter')
    async twitterCallback(
        @Query('code') code: string,
        @Query('state') state: string,
        @Query('error') error: string,
        @Res() res: Response,
    ) {
        if (error) {
            return this.sendPopupMessage(res, { type: 'oauth_error', provider: 'twitter', message: error });
        }

        if (!code || !state) {
            return this.sendPopupMessage(res, { type: 'oauth_error', provider: 'twitter', message: 'Authorization cancelled or incomplete.' });
        }

        let codeVerifier: string;
        try {
            const raw = Buffer.from(state.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
            const parsed = JSON.parse(raw);
            codeVerifier = parsed.codeVerifier;
            if (!codeVerifier) throw new Error('missing codeVerifier');
        } catch {
            return this.sendPopupMessage(res, { type: 'oauth_error', provider: 'twitter', message: 'Invalid OAuth state. Please try again.' });
        }

        try {
            const clientId = process.env.TWITTER_CLIENT_ID ?? '';
            const clientSecret = process.env.TWITTER_CLIENT_SECRET ?? '';
            const redirectUri = `${process.env.BACKEND_URL}/api/channels/oauth/callback/twitter`;
            const basicCreds = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

            // Exchange authorization code → access + refresh tokens
            const tokenRes = await firstValueFrom(
                this.httpService.post(
                    'https://api.twitter.com/2/oauth2/token',
                    new URLSearchParams({
                        grant_type: 'authorization_code',
                        code,
                        redirect_uri: redirectUri,
                        code_verifier: codeVerifier,
                    }).toString(),
                    {
                        headers: {
                            Authorization: `Basic ${basicCreds}`,
                            'Content-Type': 'application/x-www-form-urlencoded',
                        },
                    },
                ),
            );

            const { access_token, refresh_token, expires_in } = tokenRes.data;

            // Fetch authenticated user's profile
            const userRes = await firstValueFrom(
                this.httpService.get(
                    'https://api.twitter.com/2/users/me?user.fields=name,username,profile_image_url',
                    { headers: { Authorization: `Bearer ${access_token}` } },
                ),
            );

            const { id, name, username } = userRes.data.data;

            this.logger.log(`Twitter OAuth success: @${username} (${id})`);

            return this.sendPopupMessage(res, {
                type: 'oauth_success',
                provider: 'twitter',
                accessToken: access_token,
                refreshToken: refresh_token ?? '',
                expiresAt: expires_in ? Date.now() + (expires_in as number) * 1000 : null,
                userId: id,
                username,
                displayName: name,
            });
        } catch (err: any) {
            const message =
                err?.response?.data?.error_description ??
                err?.response?.data?.detail ??
                err.message;
            this.logger.error(`Twitter OAuth error: ${message}`);
            return this.sendPopupMessage(res, { type: 'oauth_error', provider: 'twitter', message });
        }
    }

    // ─── Snapchat ──────────────────────────────────────────────────────────────

    /**
     * GET /api/channels/oauth/callback/snapchat
     *
     * Handles Snapchat OAuth 2.0 Authorization Code flow.
     * Uses popup + postMessage pattern (same as Twitter above).
     */
    @Public()
    @Get('snapchat')
    async snapchatCallback(
        @Query('code') code: string,
        @Query('error') error: string,
        @Res() res: Response,
    ) {
        if (error) {
            return this.sendPopupMessage(res, { type: 'oauth_error', provider: 'snapchat', message: error });
        }

        if (!code) {
            return this.sendPopupMessage(res, { type: 'oauth_error', provider: 'snapchat', message: 'Authorization cancelled or incomplete.' });
        }

        try {
            const clientId = process.env.SNAPCHAT_CLIENT_ID ?? '';
            const clientSecret = process.env.SNAPCHAT_CLIENT_SECRET ?? '';
            const redirectUri = `${process.env.BACKEND_URL}/api/channels/oauth/callback/snapchat`;
            const basicCreds = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

            // Exchange code → access token
            const tokenRes = await firstValueFrom(
                this.httpService.post(
                    'https://accounts.snapchat.com/login/oauth2/access_token',
                    new URLSearchParams({
                        grant_type: 'authorization_code',
                        code,
                        redirect_uri: redirectUri,
                    }).toString(),
                    {
                        headers: {
                            Authorization: `Basic ${basicCreds}`,
                            'Content-Type': 'application/x-www-form-urlencoded',
                        },
                    },
                ),
            );

            const { access_token, refresh_token, expires_in } = tokenRes.data;

            // Fetch Snapchat user profile (Marketing API)
            const profileRes = await firstValueFrom(
                this.httpService.get('https://adsapi.snapchat.com/v1/me', {
                    headers: { Authorization: `Bearer ${access_token}` },
                }),
            ).catch(() => null);

            const me = profileRes?.data?.me ?? {};
            const displayName: string = me.display_name ?? me.email ?? 'Snapchat Account';

            this.logger.log(`Snapchat OAuth success: ${displayName}`);

            return this.sendPopupMessage(res, {
                type: 'oauth_success',
                provider: 'snapchat',
                accessToken: access_token,
                refreshToken: refresh_token ?? '',
                expiresAt: expires_in ? Date.now() + (expires_in as number) * 1000 : null,
                displayName,
                organizationId: me.organization_id ?? '',
            });
        } catch (err: any) {
            const message =
                err?.response?.data?.error_description ??
                err?.response?.data?.message ??
                err.message;
            this.logger.error(`Snapchat OAuth error: ${message}`);
            return this.sendPopupMessage(res, { type: 'oauth_error', provider: 'snapchat', message });
        }
    }

    // ─── Shared helpers ────────────────────────────────────────────────────────

    /**
     * Responds to an OAuth popup window with a postMessage payload, then closes it.
     * The frontend form listens for this message via window.addEventListener('message', ...).
     */
    private sendPopupMessage(res: Response, payload: Record<string, unknown>): void {
        const allowedOrigin = process.env.FRONTEND_URL ?? '*';
        // Escape </script> sequences to prevent XSS in the inline script
        const safeJson = JSON.stringify(payload)
            .replace(/</g, '\\u003c')
            .replace(/>/g, '\\u003e')
            .replace(/&/g, '\\u0026');

        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.setHeader('X-Frame-Options', 'DENY');
        res.send(`<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>Flyn — Connecting…</title>
<style>body{font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#0f0f0f;color:#fff}</style>
</head>
<body>
<p>Authorization complete — closing window…</p>
<script>
(function(){
  try{
    var target="${allowedOrigin}"==="*"?"*":"${allowedOrigin}";
    if(window.opener){window.opener.postMessage(${safeJson},target);}
  }catch(e){}
  setTimeout(function(){window.close();},300);
})();
</script>
</body>
</html>`);
    }
}
