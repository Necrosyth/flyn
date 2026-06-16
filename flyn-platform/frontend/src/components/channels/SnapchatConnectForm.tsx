import { useState, useEffect, useRef, useCallback } from 'react';
import { FaSnapchat } from 'react-icons/fa';
import { Button } from '@/components/ui/button';
import { ChannelConfig } from './channel.types';
import { Loader2, ExternalLink, CheckCircle2, AlertCircle, Camera } from 'lucide-react';

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
  displayName?: string;
  organizationId?: string;
  message?: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function SnapchatConnectForm({ onSubmit, onTest, isLoading }: Props) {
  const [manualToken, setManualToken] = useState('');
  const [channelName, setChannelName] = useState('Snapchat for Business');
  const [oauthPending, setOauthPending] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [feedback, setFeedback] = useState<{ success: boolean; message: string } | null>(null);

  const popupRef = useRef<Window | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Receive the postMessage from the OAuth popup
  const handleMessage = useCallback(
    (event: MessageEvent<OAuthPayload>) => {
      const data = event.data;
      if (!data || data.provider !== 'snapchat') return;

      if (pollRef.current) clearInterval(pollRef.current);
      setOauthPending(false);

      if (data.type === 'oauth_success' && data.accessToken) {
        const name = data.displayName
          ? `Snapchat — ${data.displayName}`
          : 'Snapchat for Business';
        setChannelName(name);
        setFeedback({ success: true, message: `Connected: ${data.displayName ?? 'Snapchat account'}` });
        onSubmit({
          name,
          credentials: {
            accessToken: data.accessToken,
            refreshToken: data.refreshToken ?? '',
            snapchatOrgId: data.organizationId ?? '',
          },
        });
      } else {
        setFeedback({
          success: false,
          message: data.message ?? 'Snapchat authorization failed. Please try again.',
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

  const handleOAuth = () => {
    setOauthPending(true);
    setFeedback(null);

    const clientId = import.meta.env.VITE_SNAPCHAT_CLIENT_ID ?? '';
    if (!clientId) {
      setFeedback({ success: false, message: 'Snapchat client ID is not configured.' });
      setOauthPending(false);
      return;
    }

    const apiBase = import.meta.env.VITE_API_BASE_URL ?? '';
    const redirectUri = `${apiBase}/channels/oauth/callback/snapchat`;

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'snapchat-marketing-api',
    });

    const authUrl = `https://accounts.snapchat.com/login/oauth2/authorize?${params}`;
    const popup = window.open(
      authUrl,
      'snapchat-oauth',
      'width=540,height=680,left=200,top=80,resizable=yes,scrollbars=yes',
    );
    popupRef.current = popup;

    pollRef.current = setInterval(() => {
      if (popup?.closed) {
        clearInterval(pollRef.current!);
        setOauthPending(false);
      }
    }, 600);
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
        ? 'Access token verified — Snapchat account connected.'
        : 'Invalid access token. Verify your Snapchat Ads API credentials.',
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
        <div className="w-9 h-9 rounded-xl bg-[#FFFC00] flex items-center justify-center shrink-0 shadow-sm">
          <FaSnapchat className="w-5 h-5 text-black" />
        </div>
        <div>
          <p className="font-semibold text-sm">Snapchat for Business</p>
          <p className="text-xs text-muted-foreground">Ads API, Story publishing &amp; audience tools</p>
        </div>
      </div>

      {/* Feature list */}
      <div className="bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-200 dark:border-yellow-900/40 rounded-xl p-3 space-y-2">
        {[
          'Publish Snap Ads and Story Ads from Flyn',
          'Receive Snapchat messages in your shared inbox',
          'Audience targeting with Snapchat pixel data',
        ].map((f) => (
          <div key={f} className="flex items-start gap-2 text-xs text-muted-foreground">
            <Camera className="w-3.5 h-3.5 text-yellow-500 mt-0.5 shrink-0" />
            {f}
          </div>
        ))}
      </div>

      {/* OAuth CTA */}
      <Button
        type="button"
        onClick={handleOAuth}
        disabled={oauthPending || isLoading}
        className="w-full h-11 bg-[#FFFC00] hover:bg-yellow-300 text-black font-semibold flex items-center justify-center gap-2.5 rounded-xl transition-colors border border-black/10 shadow-sm"
      >
        {oauthPending ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Waiting for authorization…
          </>
        ) : (
          <>
            <FaSnapchat className="w-4 h-4" />
            Connect with Snapchat
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
            Ads API Access Token
            <a
              href="https://business.snapchat.com/manage"
              target="_blank"
              rel="noreferrer"
              className="text-primary hover:underline inline-flex items-center gap-0.5"
            >
              <ExternalLink className="w-3 h-3" />
              Snap Business Manager
            </a>
          </label>
          <input
            type="password"
            value={manualToken}
            onChange={(e) => setManualToken(e.target.value)}
            placeholder="act.xxxxxxxxxxxxxxxxxxxxxxxx…"
            className="w-full px-3 py-2 border border-input rounded-lg bg-background text-sm focus:ring-2 focus:ring-ring focus:outline-none font-mono"
          />
          <p className="text-xs text-muted-foreground mt-1">
            Snap Business Manager → Settings → Apps &amp; API → Generate Token
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
            className="flex-1 px-4 py-2 bg-[#FFFC00] text-black rounded-lg hover:bg-yellow-300 disabled:opacity-50 text-sm font-semibold flex items-center justify-center gap-2 transition-colors border border-black/10"
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <FaSnapchat className="w-3.5 h-3.5" />
                Connect
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
