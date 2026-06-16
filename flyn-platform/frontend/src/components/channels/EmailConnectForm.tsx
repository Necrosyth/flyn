import { useState } from 'react';
import { Mail, Loader2, CheckCircle2, Zap } from 'lucide-react';
import { ChannelService } from '../../services/channel.service';

interface Props {
  isLoading: boolean;
  onConnected?: (provider: string, email: string) => void;
}

export function EmailConnectForm({ isLoading, onConnected }: Props) {
  const [gmailState, setGmailState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [outlookState, setOutlookState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [brevoState, setBrevoState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [gmailEmail, setGmailEmail] = useState('');
  const [outlookEmail, setOutlookEmail] = useState('');
  const [gmailError, setGmailError] = useState<string | null>(null);
  const [outlookError, setOutlookError] = useState<string | null>(null);
  const [brevoError, setBrevoError] = useState<string | null>(null);

  async function connectGmail() {
    setGmailState('loading'); setGmailError(null);
    try {
      const url = await ChannelService.getGmailAuthUrl();
      const result = await ChannelService.openOAuthPopup(url);
      setGmailEmail(result.email);
      setGmailState('done');
      onConnected?.('gmail', result.email);
    } catch (err: any) {
      setGmailState('error');
      const msg = err.message || '';
      if (msg.includes('not configured') || msg.includes('GOOGLE_CLIENT_ID')) {
        setGmailError('Gmail OAuth is not set up on this server. Ask your admin to add GOOGLE_CLIENT_ID to the backend environment, or use Brevo below.');
      } else {
        setGmailError(msg);
      }
    }
  }

  async function connectOutlook() {
    setOutlookState('loading'); setOutlookError(null);
    try {
      const url = await ChannelService.getOutlookAuthUrl();
      const result = await ChannelService.openOAuthPopup(url);
      setOutlookEmail(result.email);
      setOutlookState('done');
      onConnected?.('outlook', result.email);
    } catch (err: any) {
      setOutlookState('error');
      const msg = err.message || '';
      if (msg.includes('not configured') || msg.includes('MICROSOFT_CLIENT_ID')) {
        setOutlookError('Outlook OAuth is not set up on this server. Ask your admin to add MICROSOFT_CLIENT_ID to the backend environment, or use Brevo below.');
      } else {
        setOutlookError(msg);
      }
    }
  }

  async function connectBrevo() {
    setBrevoState('loading'); setBrevoError(null);
    try {
      const result = await ChannelService.connectEnvSmtp();
      if (!result.success) throw new Error(result.error || 'Connection failed');
      setBrevoState('done');
      onConnected?.('brevo', 'marketing@myflynai.com');
    } catch (err: any) {
      setBrevoState('error');
      setBrevoError(err.message);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-1">
        <div className="w-7 h-7 rounded-lg bg-red-500 flex items-center justify-center">
          <Mail className="w-4 h-4 text-white" />
        </div>
        <h4 className="font-semibold text-sm">Email</h4>
      </div>

      <p className="text-xs text-muted-foreground">
        Connect your email to send and receive messages directly in your inbox. Sign in with one click — no passwords stored.
      </p>

      {/* Gmail */}
      <div className="border border-border rounded-xl p-4 space-y-2">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <svg className="w-6 h-6 shrink-0" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
            <div>
              <p className="text-sm font-medium">Gmail</p>
              {gmailState === 'done' && <p className="text-xs text-green-600">{gmailEmail}</p>}
            </div>
          </div>
          {gmailState === 'done' ? (
            <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0" />
          ) : (
            <button type="button" onClick={connectGmail} disabled={gmailState === 'loading' || isLoading}
              className="px-4 py-1.5 text-sm border border-input rounded-lg hover:bg-accent disabled:opacity-50 flex items-center gap-2 shrink-0">
              {gmailState === 'loading' ? <><Loader2 className="w-3 h-3 animate-spin" /> Connecting…</> : 'Connect'}
            </button>
          )}
        </div>
        {gmailError && <p className="text-xs text-amber-600 dark:text-amber-400">{gmailError}</p>}
      </div>

      {/* Outlook */}
      <div className="border border-border rounded-xl p-4 space-y-2">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <svg className="w-6 h-6 shrink-0" viewBox="0 0 24 24" fill="none"><rect width="24" height="24" rx="3" fill="#0078D4"/><path d="M13 6h7v12h-7V6z" fill="#50D9FF" opacity=".8"/><path d="M4 8.5C4 7.12 5.12 6 6.5 6S9 7.12 9 8.5v7C9 16.88 7.88 18 6.5 18S4 16.88 4 15.5v-7z" fill="white"/><circle cx="6.5" cy="12" r="2" fill="#0078D4"/></svg>
            <div>
              <p className="text-sm font-medium">Outlook / Microsoft 365</p>
              {outlookState === 'done' && <p className="text-xs text-green-600">{outlookEmail}</p>}
            </div>
          </div>
          {outlookState === 'done' ? (
            <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0" />
          ) : (
            <button type="button" onClick={connectOutlook} disabled={outlookState === 'loading' || isLoading}
              className="px-4 py-1.5 text-sm border border-input rounded-lg hover:bg-accent disabled:opacity-50 flex items-center gap-2 shrink-0">
              {outlookState === 'loading' ? <><Loader2 className="w-3 h-3 animate-spin" /> Connecting…</> : 'Connect'}
            </button>
          )}
        </div>
        {outlookError && <p className="text-xs text-amber-600 dark:text-amber-400">{outlookError}</p>}
      </div>

      {/* Brevo SMTP — always available as a working alternative */}
      <div className="border border-teal-500/30 bg-teal-500/5 rounded-xl p-4 space-y-2">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-6 h-6 rounded-md bg-teal-600 flex items-center justify-center shrink-0">
              <Zap className="w-3.5 h-3.5 text-white" />
            </div>
            <div>
              <p className="text-sm font-medium">Brevo SMTP</p>
              <p className="text-xs text-muted-foreground">Pre-configured transactional email</p>
              {brevoState === 'done' && <p className="text-xs text-green-600">Connected!</p>}
            </div>
          </div>
          {brevoState === 'done' ? (
            <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0" />
          ) : (
            <button type="button" onClick={connectBrevo} disabled={brevoState === 'loading' || isLoading}
              className="px-4 py-1.5 text-sm bg-teal-600 hover:bg-teal-700 text-white rounded-lg disabled:opacity-50 flex items-center gap-2 shrink-0">
              {brevoState === 'loading' ? <><Loader2 className="w-3 h-3 animate-spin" /> Connecting…</> : 'Connect'}
            </button>
          )}
        </div>
        {brevoError && <p className="text-xs text-red-600">{brevoError}</p>}
      </div>

      <p className="text-xs text-muted-foreground border-t border-border pt-3">
        Need SMTP/IMAP with your own server? Use <strong>Custom SMTP</strong> in Advanced Connections below.
      </p>
    </div>
  );
}
