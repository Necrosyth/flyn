import { useEffect, useRef, useState } from 'react';
import { FaWhatsapp, FaFacebook } from 'react-icons/fa';
import { QrCode, Zap, CheckCircle2, Loader2, RefreshCw } from 'lucide-react';
import { ChannelConfig } from './channel.types';
import { ChannelService } from '../../services/channel.service';
import { toast } from 'sonner';

interface WhatsAppFormProps {
  onSubmit: (config: ChannelConfig) => void;
  onTest: (config: ChannelConfig) => Promise<boolean>;
  isLoading: boolean;
}

type Mode = 'pick' | 'qr' | 'api' | 'direct';
type QRStatus = 'idle' | 'loading' | 'qr_ready' | 'connected' | 'error';

export function WhatsAppConnectForm({ onSubmit, onTest, isLoading }: WhatsAppFormProps) {
  const [mode, setMode] = useState<Mode>('pick');
  const [isDirectLoading, setIsDirectLoading] = useState(false);

  // ── Meta SDK ──────────────────────────────────────────────────────────────
  useEffect(() => {
    // Initialize Facebook SDK for Embedded Signup
    if (!(window as any).FB) {
      (window as any).fbAsyncInit = function() {
        (window as any).FB.init({
          appId: '1216524172826620', // FLYNAI App ID
          cookie: true,
          xfbml: true,
          version: 'v18.0'
        });
      };

      (function(d, s, id) {
        var js, fjs = d.getElementsByTagName(s)[0];
        if (d.getElementById(id)) return;
        js = d.createElement(s) as HTMLScriptElement; js.id = id;
        js.src = "https://connect.facebook.net/en_US/sdk.js";
        if (fjs && fjs.parentNode) fjs.parentNode.insertBefore(js, fjs);
      }(document, 'script', 'facebook-jssdk'));
    }
  }, []);

  const handleMetaLogin = () => {
    const FB = (window as any).FB;
    if (!FB) {
      toast.error('Facebook SDK not loaded. Check browser console.');
      console.error('FB SDK not found on window');
      return;
    }

    setIsDirectLoading(true);
    console.log('Attempting Meta Login with config:', '1639408067365377');

    FB.login((response: any) => {
      console.log('Meta Login Response:', response);
      if (response.authResponse) {
        const accessToken = response.authResponse.accessToken;
        
        ChannelService.registerWhatsappWaba(accessToken)
          .then((res) => {
            if (res.success) {
              toast.success('WhatsApp connected successfully!');
              window.location.reload();
            }
          })
          .catch((err) => {
            console.error('Backend registration error:', err);
            toast.error(err.message || 'Failed to complete WhatsApp setup');
          })
          .finally(() => setIsDirectLoading(false));
      } else {
        setIsDirectLoading(false);
        console.warn('User cancelled login or auth failed');
        toast.error('Login cancelled or failed. Please check popup blockers.');
      }
    }, {
      scope: 'whatsapp_business_management,whatsapp_business_messaging,business_management',
      extras: {
        feature: 'whatsapp_embedded_signup',
        config_id: '1639408067365377' // Provided Config ID
      }
    });
  };

  // ── QR state ──────────────────────────────────────────────────────────────
  const [qrStatus, setQRStatus] = useState<QRStatus>('idle');
  const [qrCode, setQRCode] = useState<string | null>(null);
  const [phoneNumber, setPhoneNumber] = useState<string | null>(null);
  const [qrError, setQRError] = useState<string | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── API state ─────────────────────────────────────────────────────────────
  const [formData, setFormData] = useState({ name: 'WhatsApp Business', accessToken: '', phoneNumberId: '', wabaId: '', appSecret: '' });
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  useEffect(() => () => stopQR(), []);

  async function startQR() {
    stopQR();
    setQRStatus('loading');
    setQRCode(null);
    setQRError(null);
    setPhoneNumber(null);

    try {
      const { sessionId } = await ChannelService.startQRSession();
      sessionIdRef.current = sessionId;

      // Poll every 2 s instead of SSE (more reliable across proxies/load-balancers)
      pollRef.current = setInterval(async () => {
        try {
          const status = await ChannelService.getQRStatus(sessionId);
          if (status.status === 'qr_ready' && status.qrCode) {
            setQRCode(status.qrCode);
            setQRStatus('qr_ready');
          } else if (status.status === 'connected' && status.phoneNumber) {
            clearInterval(pollRef.current!);
            pollRef.current = null;
            setPhoneNumber(status.phoneNumber);
            setQRStatus('connected');
          } else if (status.status === 'error') {
            clearInterval(pollRef.current!);
            pollRef.current = null;
            setQRError(status.errorMessage || 'Connection failed. Please try again.');
            setQRStatus('error');
          }
        } catch {
          clearInterval(pollRef.current!);
          pollRef.current = null;
          setQRError('Lost connection to server. Please try again.');
          setQRStatus('error');
        }
      }, 2000);
    } catch (err: any) {
      setQRError(err.message || 'Failed to start QR session');
      setQRStatus('error');
    }
  }

  function stopQR() {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    if (sessionIdRef.current) {
      ChannelService.cancelQRSession(sessionIdRef.current).catch(() => {});
      sessionIdRef.current = null;
    }
  }

  function handleConfirmQR() {
    if (!phoneNumber) return;
    // Capture sessionId then clear the ref so the unmount cleanup won't cancel the live session
    const sessionId = sessionIdRef.current || '';
    sessionIdRef.current = null;
    onSubmit({ name: `WhatsApp (${phoneNumber})`, credentials: { whatsappQRPhone: phoneNumber, whatsappQRSessionId: sessionId } });
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({ name: formData.name, credentials: { accessToken: formData.accessToken, phoneNumberId: formData.phoneNumberId, wabaId: formData.wabaId, appSecret: formData.appSecret || undefined } });
  };

  const handleTest = async () => {
    setIsTesting(true); setTestResult(null);
    const success = await onTest({ name: formData.name, credentials: { accessToken: formData.accessToken, phoneNumberId: formData.phoneNumberId, wabaId: formData.wabaId } });
    setTestResult({ success, message: success ? 'Connection successful!' : 'Connection failed. Check your credentials.' });
    setIsTesting(false);
  };

  // ── Pick ──────────────────────────────────────────────────────────────────
  if (mode === 'pick') return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground mb-4">How would you like to connect WhatsApp?</p>
      <button type="button" onClick={() => { setMode('qr'); startQR(); }}
        className="w-full flex items-start gap-4 p-4 border-2 border-border rounded-xl hover:border-green-500/60 hover:bg-green-500/5 transition-all text-left">
        <div className="w-10 h-10 rounded-lg bg-green-500 flex items-center justify-center shrink-0 mt-0.5">
          <QrCode className="w-5 h-5 text-white" />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h4 className="font-semibold text-sm text-foreground">WhatsApp Web (QR scan)</h4>
            <span className="px-2 py-0.5 text-[10px] font-semibold bg-green-500/20 text-green-600 dark:text-green-400 rounded-full">No setup needed</span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">Scan with your phone — no Meta developer account required.</p>
          <p className="text-xs text-muted-foreground/60 mt-1">Best for: personal numbers, small teams</p>
        </div>
      </button>
      <button type="button" onClick={() => setMode('api')}
        className="w-full flex items-start gap-4 p-4 border-2 border-border rounded-xl hover:border-green-500/60 hover:bg-green-500/5 transition-all text-left">
        <div className="w-10 h-10 rounded-lg bg-green-600 flex items-center justify-center shrink-0 mt-0.5">
          <Zap className="w-5 h-5 text-white" />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h4 className="font-semibold text-sm text-foreground">Manual API Setup</h4>
            <span className="px-2 py-0.5 text-[10px] font-semibold bg-gray-500/20 text-gray-600 dark:text-gray-400 rounded-full">Expert</span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">Manually enter your Meta Access Token and IDs.</p>
        </div>
      </button>

      <div className="relative py-2">
        <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
        <div className="relative flex justify-center text-xs uppercase"><span className="bg-background px-2 text-muted-foreground">Or (Recommended)</span></div>
      </div>

      <button type="button" onClick={handleMetaLogin} disabled={isDirectLoading}
        className="w-full flex items-start gap-4 p-4 border-2 border-blue-500/30 bg-blue-500/5 rounded-xl hover:border-blue-500/60 hover:bg-blue-500/10 transition-all text-left group">
        <div className="w-10 h-10 rounded-lg bg-blue-600 flex items-center justify-center shrink-0 mt-0.5 group-hover:scale-110 transition-transform">
          {isDirectLoading ? <Loader2 className="w-5 h-5 text-white animate-spin" /> : <FaFacebook className="w-5 h-5 text-white" />}
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h4 className="font-semibold text-sm text-foreground">Direct Meta Login</h4>
            <span className="px-2 py-0.5 text-[10px] font-semibold bg-blue-500/20 text-blue-600 dark:text-blue-400 rounded-full">Official</span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">One-click setup via Meta Embedded Signup.</p>
          <p className="text-xs text-muted-foreground/60 mt-1">Best for: Quick, secure official connection</p>
        </div>
      </button>
    </div>
  );

  // ── QR ────────────────────────────────────────────────────────────────────
  if (mode === 'qr') return (
    <div className="space-y-4">
      <button type="button" onClick={() => { stopQR(); setMode('pick'); setQRStatus('idle'); }}
        className="text-sm text-primary hover:text-primary/80 flex items-center gap-1">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
        Back
      </button>

      <div className="flex flex-col items-center gap-4 py-4">
        {qrStatus === 'loading' && (
          <div className="w-48 h-48 rounded-xl border-2 border-dashed border-border flex items-center justify-center">
            <div className="text-center">
              <Loader2 className="w-8 h-8 text-muted-foreground mx-auto mb-2 animate-spin" />
              <p className="text-xs text-muted-foreground">Generating QR code…</p>
            </div>
          </div>
        )}
        {qrStatus === 'qr_ready' && qrCode && (
          <>
            <div className="p-2 bg-white rounded-xl border border-border shadow-sm">
              <img src={qrCode} alt="WhatsApp QR Code" className="w-48 h-48 block" />
            </div>
            <div className="text-center max-w-xs">
              <p className="font-medium text-sm text-foreground">Scan with WhatsApp</p>
              <ol className="text-xs text-muted-foreground mt-2 text-left space-y-1">
                <li>1. Open WhatsApp on your phone</li>
                <li>2. Go to Settings → Linked Devices</li>
                <li>3. Tap "Link a Device" and scan this QR</li>
              </ol>
            </div>
            <button type="button" onClick={startQR} className="text-xs text-primary hover:underline flex items-center gap-1">
              <RefreshCw className="w-3 h-3" /> Refresh QR
            </button>
          </>
        )}
        {qrStatus === 'connected' && (
          <div className="text-center space-y-3">
            <CheckCircle2 className="w-16 h-16 text-green-500 mx-auto" />
            <div>
              <p className="font-semibold text-green-600 dark:text-green-400">Phone connected!</p>
              <p className="text-sm text-muted-foreground mt-1">+{phoneNumber}</p>
            </div>
            <button type="button" onClick={handleConfirmQR}
              className="w-full px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-medium">
              Save Connection
            </button>
          </div>
        )}
        {qrStatus === 'error' && (
          <div className="text-center space-y-3">
            <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mx-auto">
              <svg className="w-8 h-8 text-destructive" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </div>
            <p className="text-sm text-destructive">{qrError}</p>
            <button type="button" onClick={startQR} className="px-4 py-2 border border-border rounded-lg text-sm hover:bg-accent text-foreground">
              Try again
            </button>
          </div>
        )}
      </div>
    </div>
  );

  // ── Business API ──────────────────────────────────────────────────────────
  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <button type="button" onClick={() => { setMode('pick'); setTestResult(null); }}
        className="text-sm text-primary hover:text-primary/80 flex items-center gap-1">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
        Back
      </button>
      <div className="flex items-center gap-2 mb-1">
        <div className="w-7 h-7 rounded-lg bg-green-600 flex items-center justify-center">
          <FaWhatsapp className="w-4 h-4 text-white" />
        </div>
        <h4 className="font-semibold text-sm text-foreground">WhatsApp Business API</h4>
      </div>
      <div>
        <label className="block text-xs font-medium mb-1 text-foreground">Channel Name</label>
        <input type="text" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          className="w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground text-sm focus:ring-2 focus:ring-ring focus:outline-none" placeholder="WhatsApp Business" required />
      </div>
      <div>
        <label className="block text-xs font-medium mb-1 text-foreground">Access Token <span className="text-red-500">*</span></label>
        <input type="password" value={formData.accessToken} onChange={(e) => setFormData({ ...formData, accessToken: e.target.value })}
          className="w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground text-sm focus:ring-2 focus:ring-ring focus:outline-none" placeholder="EAAXXXXXXXXX…" required />
        <p className="text-xs text-muted-foreground mt-1">Meta Business Settings › System Users › Access Tokens</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium mb-1 text-foreground">Phone Number ID <span className="text-red-500">*</span></label>
          <input type="text" value={formData.phoneNumberId} onChange={(e) => setFormData({ ...formData, phoneNumberId: e.target.value })}
            className="w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground text-sm focus:ring-2 focus:ring-ring focus:outline-none" placeholder="123456789" required />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1 text-foreground">WABA ID <span className="text-red-500">*</span></label>
          <input type="text" value={formData.wabaId} onChange={(e) => setFormData({ ...formData, wabaId: e.target.value })}
            className="w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground text-sm focus:ring-2 focus:ring-ring focus:outline-none" placeholder="123456789" required />
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium mb-1 text-foreground">App Secret (optional)</label>
        <input type="password" value={formData.appSecret} onChange={(e) => setFormData({ ...formData, appSecret: e.target.value })}
          className="w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground text-sm focus:ring-2 focus:ring-ring focus:outline-none" placeholder="For webhook signature verification" />
      </div>
      {testResult && (
        <div className={`p-3 rounded-lg text-sm ${testResult.success ? 'bg-green-500/10 text-green-600 dark:text-green-400' : 'bg-destructive/10 text-destructive'}`}>
          {testResult.message}
        </div>
      )}
      <div className="flex gap-3 pt-2">
        <button type="button" onClick={handleTest} disabled={isTesting || !formData.accessToken || !formData.phoneNumberId || !formData.wabaId}
          className="flex-1 px-4 py-2 border border-input rounded-lg hover:bg-accent text-foreground disabled:opacity-50 text-sm">
          {isTesting ? 'Testing…' : 'Test Connection'}
        </button>
        <button type="submit" disabled={isLoading || !formData.accessToken || !formData.phoneNumberId || !formData.wabaId}
          className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 text-sm">
          {isLoading ? 'Connecting…' : 'Connect WhatsApp'}
        </button>
      </div>
    </form>
  );
}
