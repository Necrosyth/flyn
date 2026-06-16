import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, CheckCircle2, Loader2, X, Phone, MessageSquare,
  Zap, Settings2, Webhook, Mail, Server, Plus, Settings,
} from 'lucide-react';
import { doc, onSnapshot } from 'firebase/firestore';
import { getDb } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { voiceProvisioning, VoiceActivationStatus } from '@/services/voiceProvisioning';
import { ManageNumbersModal } from '@/components/channels/ManageNumbersModal';
import { AllocateNumberModal } from '@/components/channels/AllocateNumberModal';
import { FaWhatsapp, FaTelegram, FaFacebook, FaInstagram, FaSlack, FaTiktok, FaSnapchat } from 'react-icons/fa';
import { FaXTwitter } from 'react-icons/fa6';
import AppLayout from '@/components/AppLayout';
import { ChannelService } from '@/services/channel.service';
import { telephonyService, TelephonyStatusResponse } from '@/services/telephony';
import { ChannelType, ChannelConfig, ChannelConnection } from '@/components/channels/channel.types';
import { WhatsAppConnectForm } from '@/components/channels/WhatsAppConnectForm';
import { TelegramConnectForm } from '@/components/channels/TelegramConnectForm';
import { FacebookConnectForm } from '@/components/channels/FacebookConnectForm';
import { InstagramConnectForm } from '@/components/channels/InstagramConnectForm';
import { EmailConnectForm } from '@/components/channels/EmailConnectForm';
import { SlackConnectForm } from '@/components/channels/SlackConnectForm';
import { TikTokConnectForm } from '@/components/channels/TikTokConnectForm';
import { VapiConnectForm } from '@/components/channels/VapiConnectForm';
import { GenericConnectForm } from '@/components/channels/GenericConnectForm';
import { LinkedInConnectForm } from '@/components/channels/LinkedInConnectForm';
import { AppleBusinessConnectForm } from '@/components/channels/AppleBusinessConnectForm';
import { TwitterConnectForm } from '@/components/channels/TwitterConnectForm';
import { SnapchatConnectForm } from '@/components/channels/SnapchatConnectForm';
import { toast } from '@/hooks/use-toast';

// ── Channel catalogue ─────────────────────────────────────────────────────────

interface ChannelDef {
  key: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  channelType?: ChannelType;
  section: 'easy' | 'advanced';
}

const CHANNELS: ChannelDef[] = [
  // ── Messaging Channels (One-click) ──────────────────────────────────────────
  {
    key: 'whatsapp',
    label: 'WhatsApp',
    description: 'QR scan or Business API',
    icon: <FaWhatsapp className="w-5 h-5 text-white" />,
    channelType: ChannelType.WHATSAPP,
    section: 'easy',
  },
  {
    key: 'telegram',
    label: 'Telegram',
    description: 'Bot token connection',
    icon: <FaTelegram className="w-5 h-5 text-white" />,
    channelType: ChannelType.TELEGRAM,
    section: 'easy',
  },
  {
    key: 'facebook',
    label: 'Facebook Messenger',
    description: 'Page access token',
    icon: <FaFacebook className="w-5 h-5 text-white" />,
    channelType: ChannelType.FACEBOOK,
    section: 'easy',
  },
  {
    key: 'instagram',
    label: 'Instagram DMs',
    description: 'Business account via Meta',
    icon: <FaInstagram className="w-5 h-5 text-white" />,
    channelType: ChannelType.INSTAGRAM,
    section: 'easy',
  },
  {
    key: 'tiktok',
    label: 'TikTok',
    description: 'TikTok for Business API',
    icon: <FaTiktok className="w-5 h-5 text-white" />,
    channelType: ChannelType.TIKTOK,
    section: 'easy',
  },
  {
    key: 'twitter',
    label: 'X (Twitter)',
    description: 'Post, schedule & DMs via OAuth',
    icon: <FaXTwitter className="w-5 h-5 text-white" />,
    channelType: ChannelType.TWITTER,
    section: 'easy',
  },
  {
    key: 'snapchat',
    label: 'Snapchat',
    description: 'Snap Ads & messaging via OAuth',
    icon: <FaSnapchat className="w-5 h-5 text-black" />,
    channelType: ChannelType.SNAPCHAT,
    section: 'easy',
  },
  {
    key: 'email',
    label: 'Email',
    description: 'Gmail or Outlook OAuth',
    icon: <Mail className="w-5 h-5 text-white" />,
    channelType: ChannelType.EMAIL,
    section: 'easy',
  },
  {
    key: 'flyn_voice',
    label: 'Flyn Voice',
    description: 'AI-powered inbound/outbound calls',
    icon: <Phone className="w-5 h-5 text-white" />,
    section: 'easy',
  },
  {
    key: 'flyn_sms',
    label: 'Flyn SMS',
    description: 'Managed SMS with dedicated number',
    icon: <MessageSquare className="w-5 h-5 text-white" />,
    section: 'easy',
  },
  // ── Advanced / BYO ────────────────────────────────────────────────────────
  {
    key: 'linkedin',
    label: 'LinkedIn Sales',
    description: 'Sales context messaging',
    icon: <div className="w-5 h-5 text-white font-black text-[10px] flex items-center justify-center">LINK</div>,
    channelType: ChannelType.LINKEDIN,
    section: 'advanced',
  },
  {
    key: 'apple_business',
    label: 'Apple Business',
    description: 'Messages for Business',
    icon: <div className="w-5 h-5 text-white font-black text-[10px] flex items-center justify-center">ABC</div>,
    channelType: ChannelType.APPLE_BUSINESS_CHAT,
    section: 'advanced',
  },
  {
    key: 'vapi',
    label: 'VAPI (BYO)',
    description: 'Your own VAPI AI voice account',
    icon: <Zap className="w-5 h-5 text-white" />,
    channelType: ChannelType.VAPI,
    section: 'advanced',
  },
  {
    key: 'slack',
    label: 'Slack',
    description: 'Bot token integration',
    icon: <FaSlack className="w-5 h-5 text-white" />,
    channelType: ChannelType.SLACK,
    section: 'advanced',
  },
  {
    key: 'smtp',
    label: 'Custom SMTP',
    description: 'Your own mail server',
    icon: <Server className="w-5 h-5 text-white" />,
    channelType: ChannelType.EMAIL,
    section: 'advanced',
  },
  {
    key: 'webhook',
    label: 'Custom API Webhook',
    description: 'Generic HTTP callback',
    icon: <Webhook className="w-5 h-5 text-white" />,
    section: 'advanced',
  },
];

const ICON_BG: Record<string, string> = {
  whatsapp: 'bg-green-500',
  telegram: 'bg-sky-500',
  facebook: 'bg-blue-600',
  instagram: 'bg-gradient-to-br from-purple-600 to-pink-500',
  tiktok: 'bg-[#000000]',
  email: 'bg-red-500',
  flyn_voice: 'bg-violet-600',
  flyn_sms: 'bg-teal-600',
  twitter: 'bg-black',
  snapchat: 'bg-[#FFFC00]',
  linkedin: 'bg-[#0077B5]',
  apple_business: 'bg-gray-800',
  twilio: 'bg-red-600',
  vapi: 'bg-indigo-600',
  slack: 'bg-[#4A154B]',
  smtp: 'bg-gray-600',
  webhook: 'bg-orange-500',
};

// Brand-colored gradient for each channel's primary action button (text color tuned for contrast).
const BRAND_BTN: Record<string, string> = {
  whatsapp: 'bg-gradient-to-r from-green-500 to-emerald-600 text-white hover:opacity-90',
  telegram: 'bg-gradient-to-r from-sky-400 to-sky-600 text-white hover:opacity-90',
  facebook: 'bg-gradient-to-r from-blue-500 to-blue-700 text-white hover:opacity-90',
  instagram: 'bg-gradient-to-r from-purple-600 via-pink-500 to-orange-400 text-white hover:opacity-90',
  tiktok: 'bg-gradient-to-r from-[#FE2C55] to-[#25F4EE] text-white hover:opacity-90',
  twitter: 'bg-gradient-to-r from-gray-700 to-black text-white hover:opacity-90',
  snapchat: 'bg-gradient-to-r from-yellow-300 to-yellow-400 text-black hover:opacity-90',
  email: 'bg-gradient-to-r from-red-500 to-rose-600 text-white hover:opacity-90',
  linkedin: 'bg-gradient-to-r from-[#0077B5] to-[#004f7c] text-white hover:opacity-90',
  apple_business: 'bg-gradient-to-r from-gray-700 to-gray-900 text-white hover:opacity-90',
  vapi: 'bg-gradient-to-r from-indigo-500 to-indigo-700 text-white hover:opacity-90',
  slack: 'bg-gradient-to-r from-[#611f69] to-[#4A154B] text-white hover:opacity-90',
  smtp: 'bg-gradient-to-r from-gray-500 to-gray-700 text-white hover:opacity-90',
  webhook: 'bg-gradient-to-r from-orange-500 to-amber-600 text-white hover:opacity-90',
};
const brandBtn = (key: string) =>
  BRAND_BTN[key] ?? 'bg-primary/10 hover:bg-primary/20 text-primary';

// ── Main component ────────────────────────────────────────────────────────────

export default function ChannelSettings() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const tenantId = user?.organizationId || localStorage.getItem('tenantId') || '';

  const [channels, setChannels] = useState<ChannelConnection[]>([]);
  const [telephony, setTelephony] = useState<TelephonyStatusResponse | null>(null);
  const [loadingChannels, setLoadingChannels] = useState(true);

  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);

  // Telephony activation states
  const [activatingSms, setActivatingSms] = useState(false);

  // ── Flyn Voice (pool + approval) state ──────────────────────────────────
  const [voiceStatus, setVoiceStatus] = useState<VoiceActivationStatus>('inactive');
  const [voiceNumber, setVoiceNumber] = useState<string | null>(null);
  const [voiceAgentId, setVoiceAgentId] = useState<string | null>(null);
  const [voiceLoading, setVoiceLoading] = useState(true);
  const [showVoiceModal, setShowVoiceModal] = useState(false);
  const [showAllocateModal, setShowAllocateModal] = useState(false);

  useEffect(() => {
    loadAll();
  }, []);

  // Initial voice status (covers the case where no request doc exists yet).
  useEffect(() => {
    if (!tenantId) return;
    voiceProvisioning
      .getStatus()
      .then((s) => {
        setVoiceStatus(s.status as VoiceActivationStatus);
        setVoiceNumber(s.phoneNumber);
        setVoiceAgentId(s.selectedAgentId);
      })
      .catch(() => { })
      .finally(() => setVoiceLoading(false));
  }, [tenantId]);

  // Returning from Stripe after buying an additional number. The webhook does the
  // actual unlock; here we just notify + refresh (onSnapshot also picks it up).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const res = params.get('voice_number');
    if (!res) return;
    if (res === 'success') {
      toast({ title: '🎉 Payment received', description: 'Your new number is being provisioned — it’ll appear in Manage shortly.' });
    } else if (res === 'cancelled') {
      toast({ title: 'Checkout cancelled', variant: 'destructive' });
    }
    window.history.replaceState({}, document.title, window.location.pathname);
  }, []);

  // Real-time activation status — card updates the moment an admin approves.
  useEffect(() => {
    const db = getDb();
    if (!db || !tenantId) return;
    const ref = doc(db, 'voice_activation_requests', tenantId);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (!snap.exists()) return;
        const data = snap.data() as { status?: VoiceActivationStatus; assignedNumber?: string | null };
        const next = (data.status ?? 'inactive') as VoiceActivationStatus;
        setVoiceStatus((prev) => {
          if (prev === 'pending' && next === 'active') {
            const num = data.assignedNumber ?? '';
            toast({ title: '🎉 Flyn Voice activated!', description: num ? `Your number is ${num}` : 'Your number is ready.' });
          }
          return next;
        });
        if (data.assignedNumber !== undefined) setVoiceNumber(data.assignedNumber);
        setVoiceLoading(false);
      },
      () => { },
    );
    return () => unsub();
  }, [tenantId]);

  async function loadAll() {
    setLoadingChannels(true);
    try {
      const [chs, tel] = await Promise.all([
        ChannelService.listChannels().catch(() => [] as ChannelConnection[]),
        telephonyService.getStatus().catch(() => null),
      ]);
      setChannels(chs);
      setTelephony(tel);
    } finally {
      setLoadingChannels(false);
    }
  }

  function isConnected(key: string): boolean {
    if (key === 'flyn_sms') return telephony?.sms?.status === 'active';
    if (key === 'flyn_voice') return voiceStatus === 'active';
    if (key === 'email' || key === 'smtp') {
      return channels.some((c) => c.type === ChannelType.EMAIL && c.status === 'active');
    }
    const def = CHANNELS.find((c) => c.key === key);
    if (!def?.channelType) return false;
    return channels.some((c) => c.type === def.channelType && c.status === 'active');
  }

  function connectedChannel(key: string): ChannelConnection | undefined {
    const def = CHANNELS.find((c) => c.key === key);
    if (!def?.channelType) return undefined;
    return channels.find((c) => c.type === def.channelType && c.status === 'active');
  }

  async function handleConnect(channelType: ChannelType, config: ChannelConfig) {
    setConnecting(true);
    try {
      const result = await ChannelService.connectChannel(channelType, config);
      if (!result.success) throw new Error(result.error || 'Failed to connect');
      toast({ title: 'Connected', description: `${config.name} is now active.` });
      setActiveKey(null);
      await loadAll();
    } catch (err: any) {
      toast({ title: 'Connection failed', description: err.message, variant: 'destructive' });
    } finally {
      setConnecting(false);
    }
  }

  async function handleDisconnect(channelId: string) {
    const ok = await ChannelService.disconnectChannel(channelId);
    if (ok) {
      toast({ title: 'Disconnected' });
      await loadAll();
    }
  }

  async function handleTest(channelType: ChannelType, config: ChannelConfig): Promise<boolean> {
    const result = await ChannelService.testConnection(channelType, config);
    return result.success;
  }

  async function handleActivateSms() {
    setActivatingSms(true);
    try {
      await telephonyService.activateSms();
      toast({ title: 'Flyn SMS activated', description: 'A dedicated number has been provisioned.' });
      const tel = await telephonyService.getStatus();
      setTelephony(tel);
    } catch (err: any) {
      toast({ title: 'Activation failed', description: err.message, variant: 'destructive' });
    } finally {
      setActivatingSms(false);
    }
  }

  async function handleDeactivateSms() {
    try {
      await telephonyService.deactivateSms();
      toast({ title: 'Flyn SMS deactivated' });
      const tel = await telephonyService.getStatus();
      setTelephony(tel);
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  }

  function handleNumberAllocated(num: string) {
    setVoiceStatus('active');
    setVoiceNumber(num);
  }

  async function handleDeactivateVoice() {
    if (!window.confirm('Deactivate Flyn Voice? Your number will be released and inbound calls will stop.')) return;
    try {
      await voiceProvisioning.deactivate();
      setVoiceStatus('inactive');
      setVoiceNumber(null);
      setShowVoiceModal(false);
      toast({ title: 'Flyn Voice deactivated' });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  }

  const [updatingProvider, setUpdatingProvider] = useState(false);
  async function handleUpdateVoiceProvider(provider: 'twilio' | 'vapi') {
    setUpdatingProvider(true);
    try {
      await telephonyService.updateVoiceProvider(provider);
      setTelephony((prev) => prev ? { ...prev, voice: { ...prev.voice!, aiProvider: provider, status: prev.voice?.status || 'active' } } : prev);
      toast({ title: `AI Provider updated to ${provider === 'twilio' ? 'Twilio' : 'VAPI'}` });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setUpdatingProvider(false);
    }
  }

  // ── Render connect form ───────────────────────────────────────────────────

  function renderForm(key: string) {
    const submit = (ct: ChannelType) => (cfg: ChannelConfig) => handleConnect(ct, cfg);
    const test = (ct: ChannelType) => (cfg: ChannelConfig) => handleTest(ct, cfg);

    switch (key) {
      case 'whatsapp':
        return <WhatsAppConnectForm onSubmit={submit(ChannelType.WHATSAPP)} onTest={test(ChannelType.WHATSAPP)} isLoading={connecting} />;
      case 'telegram':
        return <TelegramConnectForm onSubmit={submit(ChannelType.TELEGRAM)} onTest={test(ChannelType.TELEGRAM)} isLoading={connecting} />;
      case 'facebook':
        return <FacebookConnectForm onSubmit={submit(ChannelType.FACEBOOK)} onTest={test(ChannelType.FACEBOOK)} isLoading={connecting} />;
      case 'instagram':
        return <InstagramConnectForm onSubmit={submit(ChannelType.INSTAGRAM)} onTest={test(ChannelType.INSTAGRAM)} isLoading={connecting} />;
      case 'tiktok':
        return <TikTokConnectForm onSubmit={submit(ChannelType.TIKTOK)} onTest={test(ChannelType.TIKTOK)} isLoading={connecting} />;
      case 'twitter':
        return <TwitterConnectForm onSubmit={submit(ChannelType.TWITTER)} onTest={test(ChannelType.TWITTER)} isLoading={connecting} />;
      case 'snapchat':
        return <SnapchatConnectForm onSubmit={submit(ChannelType.SNAPCHAT)} onTest={test(ChannelType.SNAPCHAT)} isLoading={connecting} />;
      case 'linkedin':
        return <LinkedInConnectForm onSubmit={submit(ChannelType.LINKEDIN)} onTest={test(ChannelType.LINKEDIN)} isLoading={connecting} />;
      case 'apple_business':
        return <AppleBusinessConnectForm onSubmit={submit(ChannelType.APPLE_BUSINESS_CHAT)} onTest={test(ChannelType.APPLE_BUSINESS_CHAT)} isLoading={connecting} />;
      case 'email':
        return <EmailConnectForm isLoading={connecting} onConnected={() => { toast({ title: 'Email connected' }); loadAll(); setActiveKey(null); }} />;
      case 'slack':
        return <SlackConnectForm onSubmit={submit(ChannelType.SLACK)} onTest={test(ChannelType.SLACK)} isLoading={connecting} />;
      case 'vapi':
        return <VapiConnectForm onSubmit={submit(ChannelType.VAPI)} onTest={test(ChannelType.VAPI)} isLoading={connecting} />;
      case 'smtp':
        return <SmtpForm onSubmit={submit(ChannelType.EMAIL)} onTest={test(ChannelType.EMAIL)} isLoading={connecting} />;
      case 'webhook':
        return <GenericConnectForm onSubmit={submit(ChannelType.WEBCHAT as any)} onTest={test(ChannelType.WEBCHAT as any)} isLoading={connecting} />;
      default:
        return null;
    }
  }

  // ── Multi-account card (all channels) ────────────────────────────────────

  function MultiAccountCard({ def }: { def: ChannelDef }) {
    const connectedAccounts = def.channelType
      ? channels.filter((c) => c.type === def.channelType && c.status === 'active')
      : [];

    return (
      <div className="bg-card border border-border rounded-xl p-4 flex flex-col gap-3 h-full">
        <div className="flex items-start gap-3">
          <div className={`w-10 h-10 rounded-xl ${ICON_BG[def.key] || 'bg-gray-500'} flex items-center justify-center shrink-0`}>
            {def.icon}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 min-w-0">
              <p className="font-medium text-sm truncate">{def.label}</p>
              {connectedAccounts.length > 0 && (
                <span className="shrink-0 whitespace-nowrap px-1.5 py-0.5 text-[10px] font-semibold bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400 rounded-full">
                  {connectedAccounts.length} connected
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">{def.description}</p>
          </div>
        </div>

        {connectedAccounts.length > 0 && (
          <div className="space-y-1.5">
            {connectedAccounts.map((ch) => (
              <div key={ch.id} className="flex items-center justify-between bg-muted/40 rounded-lg px-3 py-1.5">
                <div className="flex items-center gap-2 min-w-0">
                  <CheckCircle2 className="w-3 h-3 text-green-500 shrink-0" />
                  <span className="text-xs truncate max-w-[130px]">{ch.name}</span>
                  {(ch as any).channelSubtype === 'qr' && (
                    <span className="text-[9px] bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400 px-1 py-0.5 rounded shrink-0">QR</span>
                  )}
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); handleDisconnect(ch.id); }}
                  className="text-[10px] text-destructive hover:underline ml-2 shrink-0">
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="mt-auto">
          <button
            onClick={() => setActiveKey(def.key)}
            className={`w-full px-3 py-1.5 text-xs font-medium rounded-lg transition-opacity flex items-center justify-center gap-1 ${brandBtn(def.key)}`}>
            {connectedAccounts.length > 0 ? (
              <><Plus className="w-3 h-3" /> Connect another account</>
            ) : 'Connect'}
          </button>
        </div>
      </div>
    );
  }

  // ── Flyn Voice card (pool + admin-approval state machine) ──────────────────

  function FlynVoiceCard() {
    const base = 'bg-card border border-border rounded-xl p-4 flex flex-col gap-3 h-full';

    if (voiceLoading) {
      return (
        <div className={base}>
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-muted animate-pulse shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="h-3 w-24 bg-muted rounded animate-pulse" />
              <div className="h-2.5 w-32 bg-muted rounded animate-pulse" />
            </div>
          </div>
          <div className="mt-auto h-7 bg-muted rounded-lg animate-pulse" />
        </div>
      );
    }

    const Header = ({ pill, iconBg }: { pill?: React.ReactNode; iconBg?: string }) => (
      <div className="flex items-start gap-3 flex-1">
        <div className={`w-10 h-10 rounded-xl ${iconBg ?? 'bg-violet-600'} flex items-center justify-center shrink-0`}>
          <Phone className="w-5 h-5 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-medium text-sm">Flyn Voice</p>
            {pill}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">AI-powered inbound & outbound calling</p>
        </div>
      </div>
    );

    // STATE D — active
    if (voiceStatus === 'active') {
      const currentProvider = telephony?.voice?.aiProvider ?? 'twilio';
      return (
        <div className={base}>
          <Header
            iconBg="bg-green-600"
            pill={
              <span className="px-1.5 py-0.5 text-[10px] font-semibold bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400 rounded-full inline-flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" /> Active
              </span>
            }
          />
          {voiceNumber && <p className="text-sm font-mono font-semibold">{voiceNumber}</p>}

          {/* AI Provider toggle */}
          <div className="space-y-1">
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">AI Provider</p>
            <div className="flex rounded-lg border border-border overflow-hidden text-[11px] font-medium">
              <button
                onClick={() => currentProvider !== 'twilio' && handleUpdateVoiceProvider('twilio')}
                disabled={updatingProvider || currentProvider === 'twilio'}
                className={`flex-1 py-1 transition-colors ${currentProvider === 'twilio' ? 'bg-violet-600 text-white' : 'hover:bg-accent text-muted-foreground'}`}
              >
                Twilio
              </button>
              <button
                onClick={() => currentProvider !== 'vapi' && handleUpdateVoiceProvider('vapi')}
                disabled={updatingProvider || currentProvider === 'vapi'}
                className={`flex-1 py-1 transition-colors ${currentProvider === 'vapi' ? 'bg-violet-600 text-white' : 'hover:bg-accent text-muted-foreground'}`}
              >
                VAPI
              </button>
            </div>
          </div>

          <div className="mt-auto flex gap-2">
            <button onClick={() => setShowVoiceModal(true)}
              className="flex-1 px-3 py-1.5 text-xs bg-primary/10 hover:bg-primary/20 text-primary font-medium rounded-lg transition-colors flex items-center justify-center gap-1">
              <Settings className="w-3 h-3" /> Manage
            </button>
            <button onClick={handleDeactivateVoice}
              className="px-3 py-1.5 text-xs border border-border rounded-lg hover:bg-destructive/10 hover:text-destructive transition-colors">
              Deactivate
            </button>
          </div>
        </div>
      );
    }

    // INACTIVE — self-service: click opens the allocation popup.
    return (
      <div className={base}>
        <Header />
        <ul className="text-[11px] text-muted-foreground space-y-1">
          <li className="flex items-center gap-1.5"><CheckCircle2 className="w-3 h-3 text-violet-500" /> Dedicated phone number — first one free</li>
          <li className="flex items-center gap-1.5"><CheckCircle2 className="w-3 h-3 text-violet-500" /> Inbound AI agent</li>
          <li className="flex items-center gap-1.5"><CheckCircle2 className="w-3 h-3 text-violet-500" /> HD call recording</li>
        </ul>
        <div className="mt-auto">
          <button onClick={() => setShowAllocateModal(true)}
            className="w-full px-3 py-1.5 text-xs rounded-lg font-medium text-white bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:opacity-90 transition-opacity">
            Activate
          </button>
        </div>
      </div>
    );
  }

  // ── Channel card ──────────────────────────────────────────────────────────

  function ChannelCard({ def }: { def: ChannelDef }) {
    const connected = isConnected(def.key);
    const ch = connectedChannel(def.key);

    // Flyn SMS card has custom activation UI (legacy telephony auto-provision)
    if (def.key === 'flyn_sms') {
      const status = telephony?.sms;
      const isProvisioning = status?.status === 'provisioning';

      return (
        <div className="bg-card border border-border rounded-xl p-4 flex flex-col gap-3 h-full">
          <div className="flex items-start gap-3 flex-1">
            <div className={`w-10 h-10 rounded-xl ${ICON_BG[def.key]} flex items-center justify-center shrink-0`}>
              {def.icon}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="font-medium text-sm">{def.label}</p>
                {connected && <span className="px-1.5 py-0.5 text-[10px] font-semibold bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400 rounded-full">Active</span>}
                {isProvisioning && <span className="px-1.5 py-0.5 text-[10px] font-semibold bg-amber-100 text-amber-700 rounded-full">Provisioning…</span>}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">{def.description}</p>
              {status?.phoneNumber && <p className="text-xs text-muted-foreground font-mono mt-0.5">{status.phoneNumber}</p>}
            </div>
          </div>
          <div className="mt-auto">
            {connected ? (
              <button onClick={handleDeactivateSms}
                className="w-full px-3 py-1.5 text-xs border border-border rounded-lg hover:bg-destructive/10 hover:text-destructive transition-colors">
                Deactivate
              </button>
            ) : (
              <button onClick={handleActivateSms}
                disabled={activatingSms || isProvisioning}
                className={`w-full px-3 py-1.5 text-xs rounded-lg font-medium transition-colors disabled:opacity-50 text-white ${ICON_BG[def.key]}`}>
                {activatingSms ? <span className="flex items-center justify-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Activating…</span> : 'Activate'}
              </button>
            )}
          </div>
        </div>
      );
    }

    return (
      <div
        onClick={() => !connected && setActiveKey(def.key)}
        className={`bg-card border rounded-xl p-4 flex flex-col gap-3 transition-all h-full ${connected ? 'border-green-500/40 cursor-default' : 'border-border hover:border-ring/40 hover:shadow-sm cursor-pointer'}`}>
        <div className="flex items-start gap-3 flex-1">
          <div className={`w-10 h-10 rounded-xl ${ICON_BG[def.key]} flex items-center justify-center shrink-0`}>
            {def.icon}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="font-medium text-sm">{def.label}</p>
              {connected && <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0" />}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">{def.description}</p>
            {connected && ch && <p className="text-xs text-muted-foreground mt-0.5 truncate">{ch.name}</p>}
          </div>
        </div>
        <div className="mt-auto">
          {connected ? (
            <button onClick={(e) => { e.stopPropagation(); ch && handleDisconnect(ch.id); }}
              className="w-full px-3 py-1.5 text-xs border border-border rounded-lg hover:bg-destructive/10 hover:text-destructive transition-colors">
              Disconnect
            </button>
          ) : (
            <button onClick={() => setActiveKey(def.key)}
              className={`w-full px-3 py-1.5 text-xs font-medium rounded-lg transition-opacity ${brandBtn(def.key)}`}>
              Connect
            </button>
          )}
        </div>
      </div>
    );
  }

  const easyChannels = CHANNELS.filter((c) => c.section === 'easy');
  const advancedChannels = CHANNELS.filter((c) => c.section === 'advanced');
  const activeDef = CHANNELS.find((c) => c.key === activeKey);

  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto p-6 space-y-8">
        {/* Header */}
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/settings')} className="p-1.5 rounded-lg hover:bg-accent">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h1 className="text-xl font-semibold">Channels & Integrations</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Connect messaging platforms and services to your workspace</p>
          </div>
          {loadingChannels && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground ml-auto" />}
        </div>

        {/* Easy Connections */}
        <section className="space-y-3">
          <div>
            <h2 className="text-sm font-semibold">Messaging Channels</h2>
            <p className="text-xs text-muted-foreground mt-0.5">One-click connections — no technical setup required</p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {easyChannels.map((def) =>
              def.key === 'flyn_voice'
                ? <FlynVoiceCard key={def.key} />
                : def.key === 'flyn_sms'
                  ? <ChannelCard key={def.key} def={def} />
                  : <MultiAccountCard key={def.key} def={def} />
            )}
          </div>
        </section>

        {/* Advanced */}
        <section className="space-y-3">
          <div>
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <Settings2 className="w-4 h-4 text-muted-foreground" />
              Advanced Connections
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">For developers — bring your own API credentials and infrastructure</p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {advancedChannels.map((def) => <MultiAccountCard key={def.key} def={def} />)}
          </div>
        </section>
      </div>

      {/* Connect Drawer */}
      <AnimatePresence>
        {activeKey && activeDef && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/40 z-40"
              onClick={() => setActiveKey(null)}
            />
            <motion.div
              initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              className="fixed right-0 top-0 h-full w-full max-w-md bg-background border-l border-border shadow-2xl z-50 flex flex-col"
            >
              <div className="flex items-center justify-between p-4 border-b border-border">
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-lg ${ICON_BG[activeKey]} flex items-center justify-center`}>
                    {activeDef.icon}
                  </div>
                  <div>
                    <p className="font-semibold text-sm">Connect {activeDef.label}</p>
                    <p className="text-xs text-muted-foreground">{activeDef.description}</p>
                  </div>
                </div>
                <button onClick={() => setActiveKey(null)} className="p-1.5 rounded-lg hover:bg-accent">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-5">
                {renderForm(activeKey)}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Flyn Voice allocation popup */}
      <AnimatePresence>
        {showAllocateModal && (
          <AllocateNumberModal
            onClose={() => setShowAllocateModal(false)}
            onAllocated={handleNumberAllocated}
          />
        )}
      </AnimatePresence>

      {/* Flyn Voice — manage numbers (free + paid) */}
      <AnimatePresence>
        {showVoiceModal && (
          <ManageNumbersModal
            onClose={() => setShowVoiceModal(false)}
            onChanged={() => {
              voiceProvisioning.getStatus().then((s) => {
                setVoiceStatus(s.status as VoiceActivationStatus);
                setVoiceNumber(s.phoneNumber);
              }).catch(() => { });
            }}
          />
        )}
      </AnimatePresence>
    </AppLayout>
  );
}

// ── Inline SMTP form ──────────────────────────────────────────────────────────

function SmtpForm({ onSubmit, onTest, isLoading }: { onSubmit: (c: ChannelConfig) => void; onTest: (c: ChannelConfig) => Promise<boolean>; isLoading: boolean }) {
  const [f, setF] = useState({ name: 'Custom Email', smtpHost: '', smtpPort: '587', smtpUsername: '', smtpPassword: '', imapHost: '', imapPort: '993' });
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

  const buildConfig = (): ChannelConfig => ({
    name: f.name,
    credentials: { smtpHost: f.smtpHost, smtpPort: Number(f.smtpPort), smtpUsername: f.smtpUsername, smtpPassword: f.smtpPassword, imapHost: f.imapHost || undefined, imapPort: f.imapPort ? Number(f.imapPort) : undefined },
  });

  const handleTest = async () => {
    setTesting(true); setResult(null);
    const ok = await onTest(buildConfig());
    setResult({ success: ok, message: ok ? 'SMTP connection verified!' : 'SMTP connection failed. Check your credentials.' });
    setTesting(false);
  };

  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit(buildConfig()); }} className="space-y-4">
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 rounded-lg bg-gray-600 flex items-center justify-center"><Server className="w-4 h-4 text-white" /></div>
        <h4 className="font-semibold text-sm">Custom SMTP / IMAP</h4>
      </div>
      <div><label className="block text-xs font-medium mb-1">Channel Name</label>
        <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} className="w-full px-3 py-2 border border-input rounded-lg bg-background text-sm" required /></div>
      <div className="grid grid-cols-3 gap-2">
        <div className="col-span-2"><label className="block text-xs font-medium mb-1">SMTP Host</label>
          <input value={f.smtpHost} onChange={(e) => setF({ ...f, smtpHost: e.target.value })} className="w-full px-3 py-2 border border-input rounded-lg bg-background text-sm" placeholder="smtp.example.com" required /></div>
        <div><label className="block text-xs font-medium mb-1">Port</label>
          <input value={f.smtpPort} onChange={(e) => setF({ ...f, smtpPort: e.target.value })} className="w-full px-3 py-2 border border-input rounded-lg bg-background text-sm" placeholder="587" /></div>
      </div>
      <div><label className="block text-xs font-medium mb-1">Username / Email</label>
        <input value={f.smtpUsername} onChange={(e) => setF({ ...f, smtpUsername: e.target.value })} className="w-full px-3 py-2 border border-input rounded-lg bg-background text-sm" placeholder="you@example.com" required /></div>
      <div><label className="block text-xs font-medium mb-1">Password</label>
        <input type="password" value={f.smtpPassword} onChange={(e) => setF({ ...f, smtpPassword: e.target.value })} className="w-full px-3 py-2 border border-input rounded-lg bg-background text-sm" required /></div>
      <div className="grid grid-cols-3 gap-2">
        <div className="col-span-2"><label className="block text-xs font-medium mb-1">IMAP Host (optional)</label>
          <input value={f.imapHost} onChange={(e) => setF({ ...f, imapHost: e.target.value })} className="w-full px-3 py-2 border border-input rounded-lg bg-background text-sm" placeholder="imap.example.com" /></div>
        <div><label className="block text-xs font-medium mb-1">Port</label>
          <input value={f.imapPort} onChange={(e) => setF({ ...f, imapPort: e.target.value })} className="w-full px-3 py-2 border border-input rounded-lg bg-background text-sm" placeholder="993" /></div>
      </div>
      {result && <div className={`p-3 rounded-lg text-sm ${result.success ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300' : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'}`}>{result.message}</div>}
      <div className="flex gap-3 pt-2">
        <button type="button" onClick={handleTest} disabled={testing || !f.smtpHost || !f.smtpUsername || !f.smtpPassword}
          className="flex-1 px-4 py-2 border border-input rounded-lg hover:bg-accent disabled:opacity-50 text-sm">
          {testing ? 'Testing…' : 'Test SMTP'}
        </button>
        <button type="submit" disabled={isLoading || !f.smtpHost || !f.smtpUsername || !f.smtpPassword}
          className="flex-1 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 text-sm">
          {isLoading ? 'Connecting…' : 'Connect'}
        </button>
      </div>
    </form>
  );
}
