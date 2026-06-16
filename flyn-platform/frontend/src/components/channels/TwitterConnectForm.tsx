import { useState, useEffect, useRef, useCallback } from 'react';
import { FaXTwitter } from 'react-icons/fa6';
import { Button } from '@/components/ui/button';
import { ChannelConfig } from './channel.types';
import { Loader2, ExternalLink, CheckCircle2, AlertCircle } from 'lucide-react';
import { API_BASE_URL } from '@/lib/api';

// ─── PKCE helpers ─────────────────────────────────────────────────────────────

function generateVerifier(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

async function deriveChallenge(verifier: string): Promise<string> {
  const encoded = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', encoded);
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface Props {
  onSubmit: (config: ChannelConfig) => void;
  onTest: (config: ChannelConfig) => Promise<boolean>;
  isLoading: boolean;
}

interface OAuthPayload {
  type: 'oauth_success' | 'oauth_error';
  provider: string;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number | null;
  userId?: string;
  username?: string;
  displayName?: string;
  message?: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function TwitterConnectForm({ onSubmit, onTest, isLoading }: Props) {
  const [manualToken, setManualToken] = useState('');
  const [channelName, setChannelName] = useState('X (Twitter)');
  const [oauthPending, setOauthPending] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [feedback, setFeedback] = useState<{ success: boolean; message: string } | null>(null);

  const popupRef = useRef<Window | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Listen for postMessage from the OAuth popup
  const handleMessage = useCallback(
    (event: MessageEvent<OAuthPayload>) => {
      const data = event.data;
      if (!data || data.provider !== 'twitter') return;

      // Clear the popup-closed poller
      if (pollRef.current) clearInterval(pollRef.current);
      setOauthPending(false);

      if (data.type === 'oauth_success' && data.accessToken) {
        const name = data.username ? `X (@${data.username})` : (data.displayName ?? 'X (Twitter)');
        setChannelName(name);
        setFeedback({ success: true, message: `Connected as ${name}` });
        // Auto-submit — the user already authorised in the popup
        onSubmit({
          name,
          credentials: {
            accessToken: data.accessToken,
            refreshToken: data.refreshToken ?? '',
            twitterUserId: data.userId ?? '',
            twitterUsername: data.username ?? '',
          },
        });
      } else {
        setFeedback({
          success: false,
          message: data.message ?? 'Twitter authorization failed. Please try again.',
        });
      }
    },
    [onSubmit],
  );

  useEffect(() => {
    window.addEventListener('message', handleMessage);
    return () => {
      window.removeEventListener('message', handleMessage);
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [handleMessage]);

  // ── OAuth popup launch ──────────────────────────────────────────────────────

  const handleOAuth = async () => {
    setOauthPending(true);
    setFeedback(null);

    const clientId = import.meta.env.VITE_TWITTER_CLIENT_ID ?? '';
    if (!clientId) {
      setFeedback({ success: false, message: 'Twitter client ID is not configured.' });
      setOauthPending(false);
      return;
    }

    // Open blank popup synchronously (preserves user-gesture for Safari/Firefox popup policy)
    // Navigate it after async PKCE derivation completes
    const popup = window.open('', 'twitter-oauth', 'width=600,height=720,left=200,top=80,resizable=yes,scrollbars=yes');
    if (!popup) {
      setFeedback({ success: false, message: 'Popup blocked — allow popups for this site and try again.' });
      setOauthPending(false);
      return;
    }
    popupRef.current = popup;

    try {
      const verifier = generateVerifier();
      const challenge = await deriveChallenge(verifier);

      const redirectUri = `${API_BASE_URL}/channels/oauth/callback/twitter`;

      // Encode {codeVerifier} in state — backend decodes this for PKCE token exchange
      const state = btoa(JSON.stringify({ codeVerifier: verifier }))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '');

      const scopes = [
        'tweet.read',
        'tweet.write',
        'users.read',
        'offline.access',
      ].join(' ');

      const params = new URLSearchParams({
        response_type: 'code',
        client_id: clientId,
        redirect_uri: redirectUri,
        scope: scopes,
        state,
        code_challenge: challenge,
        code_challenge_method: 'S256',
      });

      popup.location.href = `https://twitter.com/i/oauth2/authorize?${params}`;

      pollRef.current = setInterval(() => {
        if (popup.closed) {
          clearInterval(pollRef.current!);
          setOauthPending(false);
        }
      }, 600);
    } catch (err: any) {
      popup.close();
      setOauthPending(false);
      setFeedback({ success: false, message: `Could not open auth window: ${err.message}` });
    }
  };

  // ── Manual token form ───────────────────────────────────────────────────────

  const buildConfig = (): ChannelConfig => ({
    name: channelName,
    credentials: { accessToken: manualToken },
  });

  const handleTest = async () => {
    setIsTesting(true);
    setFeedback(null);
    const ok = await onTest(buildConfig());
    setFeedback({
      success: ok,
      message: ok
        ? 'Access token verified — account connected.'
        : 'Invalid token. Check the token and try again.',
    });
    setIsTesting(false);
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(buildConfig());
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-black dark:bg-white flex items-center justify-center shrink-0">
          <FaXTwitter className="w-5 h-5 text-white dark:text-black" />
        </div>
        <div>
          <p className="font-semibold text-sm">X (Twitter) for Business</p>
          <p className="text-xs text-muted-foreground">Schedule posts, reply to mentions & DMs</p>
        </div>
      </div>

      {/* Feature list */}
      <div className="bg-zinc-50 dark:bg-zinc-900/50 border border-border rounded-xl p-3 space-y-2">
        {[
          'Post and schedule tweets from Flyn campaigns',
          'Receive mentions and DMs in your shared inbox',
          'Trigger AI workflows from inbound engagement',
        ].map((f) => (
          <div key={f} className="flex items-start gap-2 text-xs text-muted-foreground">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 mt-0.5 shrink-0" />
            {f}
          </div>
        ))}
      </div>

      {/* OAuth CTA */}
      <Button
        type="button"
        onClick={handleOAuth}
        disabled={oauthPending || isLoading}
        className="w-full h-11 bg-black hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-200 text-white dark:text-black font-medium flex items-center justify-center gap-2.5 rounded-xl transition-colors"
      >
        {oauthPending ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Waiting for authorization…
          </>
        ) : (
          <>
            <FaXTwitter className="w-4 h-4" />
            Sign in with X (Twitter)
          </>
        )}
      </Button>

      {/* Feedback banner */}
      {feedback && (
        <div
          className={`flex items-start gap-2.5 p-3 rounded-xl text-sm ${
            feedback.success
              ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
              : 'bg-red-50 text-red-800 dark:bg-red-900/30 dark:text-red-300 border border-red-200 dark:border-red-800'
          }`}
        >
          {feedback.success ? (
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
          ) : (
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          )}
          {feedback.message}
        </div>
      )}

      {/* Divider */}
      <div className="relative flex items-center gap-3">
        <div className="flex-1 h-px bg-border" />
        <span className="text-[10px] uppercase font-semibold text-muted-foreground tracking-widest">
          or paste token manually
        </span>
        <div className="flex-1 h-px bg-border" />
      </div>

      {/* Manual form */}
      <form onSubmit={handleManualSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-medium mb-1.5">Channel Name</label>
          <input
            value={channelName}
            onChange={(e) => setChannelName(e.target.value)}
            className="w-full px-3 py-2 border border-input rounded-lg bg-background text-sm focus:ring-2 focus:ring-ring focus:outline-none"
            required
          />
        </div>

        <div>
          <label className="block text-xs font-medium mb-1.5 flex items-center gap-1.5">
            OAuth 2.0 Access Token / Bearer Token
            <a
              href="https://developer.twitter.com/en/portal/projects-and-apps"
              target="_blank"
              rel="noreferrer"
              className="text-primary hover:underline inline-flex items-center gap-0.5"
            >
              <ExternalLink className="w-3 h-3" />
              Dev Portal
            </a>
          </label>
          <input
            type="password"
            value={manualToken}
            onChange={(e) => setManualToken(e.target.value)}
            placeholder="AAAAAAAAAAAAAAAAAAAAAAxx…"
            className="w-full px-3 py-2 border border-input rounded-lg bg-background text-sm focus:ring-2 focus:ring-ring focus:outline-none font-mono"
          />
          <p className="text-xs text-muted-foreground mt-1">
            Developer Portal → Project → App → Keys &amp; tokens → OAuth 2.0 Access Token
          </p>
        </div>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={handleTest}
            disabled={isTesting || !manualToken}
            className="flex-1 px-4 py-2 border border-input rounded-lg hover:bg-accent disabled:opacity-50 text-sm transition-colors"
          >
            {isTesting ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Test'}
          </button>
          <button
            type="submit"
            disabled={isLoading || !manualToken}
            className="flex-1 px-4 py-2 bg-black dark:bg-white text-white dark:text-black rounded-lg hover:bg-zinc-800 dark:hover:bg-zinc-200 disabled:opacity-50 text-sm font-medium flex items-center justify-center gap-2 transition-colors"
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <FaXTwitter className="w-3.5 h-3.5" />
                Connect
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
