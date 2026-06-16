import { useState } from 'react';
import { ChannelType, ChannelConfig } from './channel.types';
import { WhatsAppConnectForm } from './WhatsAppConnectForm';
import { TelegramConnectForm } from './TelegramConnectForm';
import { SlackConnectForm } from './SlackConnectForm';
import { EmailConnectForm } from './EmailConnectForm';
import { FacebookConnectForm } from './FacebookConnectForm';
import { InstagramConnectForm } from './InstagramConnectForm';
import { TikTokConnectForm } from './TikTokConnectForm';
import { LinkedInConnectForm } from './LinkedInConnectForm';
import { AppleBusinessConnectForm } from './AppleBusinessConnectForm';
import { SnapchatConnectForm } from './SnapchatConnectForm';
import { TwilioConnectForm } from './TwilioConnectForm';
import { VapiConnectForm } from './VapiConnectForm';
import { GenericConnectForm } from './GenericConnectForm';
import { FaWhatsapp, FaCommentDots, FaRegImage, FaPhone, FaTelegramPlane, FaEnvelope, FaSlack, FaLinkedin, FaApple, FaGoogle, FaGlobe, FaFacebookMessenger, FaInstagram, FaTiktok, FaMicrosoft, FaSnapchat } from 'react-icons/fa';
import { FaXTwitter, FaRegHandshake } from 'react-icons/fa6';
interface ChannelConnectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConnect: (type: ChannelType, config: ChannelConfig) => Promise<void>;
  onTest: (type: ChannelType, config: ChannelConfig) => Promise<boolean>;
  tenantId: string;
}

type ChannelItem = {
  type: ChannelType;
  name: string;
  description: string;
  icon: React.ReactNode;
  color: string;
  comingSoon?: boolean;
};

const CHANNEL_GROUPS: { name: string; items: ChannelItem[] }[] = [
  {
    name: 'Communication',
    items: [
      {
        type: ChannelType.WHATSAPP,
        name: 'WhatsApp Business',
        description: 'QR scan or Business API',
        icon: <FaWhatsapp className="w-5 h-5 text-foreground" />,
        color: 'bg-green-500',
      },
      {
        type: ChannelType.TELEGRAM,
        name: 'Telegram',
        description: 'Connect via Bot API',
        icon: <FaTelegramPlane className="w-5 h-5 text-foreground" />,
        color: 'bg-blue-500',
      },
      {
        type: ChannelType.EMAIL,
        name: 'Email',
        description: 'Gmail, Outlook or SMTP',
        icon: <FaEnvelope className="w-4 h-4 text-foreground" />,
        color: 'bg-gray-600',
      },
      {
        type: ChannelType.SMS,
        name: 'SMS',
        description: 'Twilio, Vonage or Telnyx',
        icon: <FaCommentDots className="w-4 h-4 text-foreground" />,
        color: 'bg-yellow-500',
        comingSoon: true,
      },
      {
        type: ChannelType.MMS,
        name: 'MMS',
        description: 'Multimedia messaging',
        icon: <FaRegImage className="w-4 h-4 text-foreground" />,
        color: 'bg-yellow-600',
        comingSoon: true,
      },
      {
        type: ChannelType.VOICE,
        name: 'Voice Calls',
        description: 'Twilio or SIP trunk',
        icon: <FaPhone className="w-4 h-4 text-foreground" />,
        color: 'bg-orange-500',
        comingSoon: true,
      },
    ]
  },
  {
    name: 'Social',
    items: [
      {
        type: ChannelType.FACEBOOK,
        name: 'Facebook Messenger',
        description: 'OAuth or page access token',
        icon: <FaFacebookMessenger className="w-5 h-5 text-foreground" />,
        color: 'bg-blue-600',
      },
      {
        type: ChannelType.INSTAGRAM,
        name: 'Instagram',
        description: 'OAuth or access token',
        icon: <FaInstagram className="w-5 h-5 text-foreground" />,
        color: 'bg-pink-600',
      },
      {
        type: ChannelType.TIKTOK,
        name: 'TikTok',
        description: 'Direct Messages',
        icon: <FaTiktok className="w-5 h-5 text-foreground" />,
        color: 'bg-background',
      },
      {
        type: ChannelType.TWITTER,
        name: 'Twitter / X',
        description: 'Direct Messages',
        icon: <FaXTwitter className="w-5 h-5 text-foreground" />,
        color: 'bg-zinc-900',
        comingSoon: true,
      },
      {
        type: ChannelType.LINKEDIN,
        name: 'LinkedIn Messaging',
        description: 'Pages API',
        icon: <FaLinkedin className="w-5 h-5 text-foreground" />,
        color: 'bg-blue-700',
      },
      {
        type: ChannelType.SNAPCHAT,
        name: 'Snapchat',
        description: 'Business Messaging',
        icon: <FaSnapchat className="w-5 h-5 text-black" />,
        color: 'bg-[#FFFC00]',
      },
    ]
  },
  {
    name: 'Office',
    items: [
      {
        type: ChannelType.SLACK,
        name: 'Slack',
        description: 'OAuth or bot token',
        icon: <FaSlack className="w-5 h-5 text-foreground" />,
        color: 'bg-purple-500',
      },
      {
        type: ChannelType.TEAMS,
        name: 'Microsoft Teams',
        description: 'Azure AD or bot framework',
        icon: <FaMicrosoft className="w-5 h-5 text-foreground" />,
        color: 'bg-indigo-600',
        comingSoon: true,
      },
      {
        type: ChannelType.SLACK_CONNECT,
        name: 'Slack Connect',
        description: 'External shared channels',
        icon: <FaRegHandshake className="w-5 h-5 text-foreground" />,
        color: 'bg-purple-600',
        comingSoon: true,
      },
      {
        type: ChannelType.GOOGLE_BUSINESS_MESSAGES,
        name: 'Google Business',
        description: 'Service account or OAuth',
        icon: <FaGoogle className="w-5 h-5 text-foreground" />,
        color: 'bg-slate-700',
        comingSoon: true,
      },
      {
        type: ChannelType.APPLE_BUSINESS_CHAT,
        name: 'Apple Business Chat',
        description: 'Requires Apple approval',
        icon: <FaApple className="w-5 h-5 text-foreground" />,
        color: 'bg-zinc-800',
      },
    ]
  },
  {
    name: 'Website',
    items: [
      {
        type: ChannelType.WEBCHAT,
        name: 'Web Chat',
        description: 'Embed on your website',
        icon: <FaGlobe className="w-5 h-5 text-foreground" />,
        color: 'bg-slate-600',
        comingSoon: true,
      },
    ]
  },
  {
    name: 'Integrations',
    items: [
      {
        type: ChannelType.TWILIO,
        name: 'Twilio',
        description: 'SMS, Voice & Messaging API',
        icon: (
          <svg viewBox="0 0 30 30" className="w-5 h-5 fill-white">
            <path d="M15 0C6.716 0 0 6.716 0 15c0 8.285 6.716 15 15 15 8.285 0 15-6.715 15-15C30 6.716 23.285 0 15 0zm0 26.456C8.733 26.456 3.544 21.267 3.544 15 3.544 8.733 8.733 3.544 15 3.544c6.267 0 11.456 5.189 11.456 11.456 0 6.267-5.19 11.456-11.456 11.456zm6.912-14.368a2.544 2.544 0 1 1-5.088 0 2.544 2.544 0 0 1 5.088 0zm0 5.824a2.544 2.544 0 1 1-5.088 0 2.544 2.544 0 0 1 5.088 0zm-5.824-5.824a2.544 2.544 0 1 1-5.088 0 2.544 2.544 0 0 1 5.088 0zm0 5.824a2.544 2.544 0 1 1-5.088 0 2.544 2.544 0 0 1 5.088 0z" />
          </svg>
        ),
        color: 'bg-red-600',
      },
      {
        type: ChannelType.VAPI,
        name: 'Vapi',
        description: 'AI Voice Calling Platform',
        icon: (
          <svg viewBox="0 0 24 24" className="w-5 h-5 fill-white">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z" />
          </svg>
        ),
        color: 'bg-violet-600',
      },
    ]
  }
];

export function ChannelConnectModal({
  isOpen,
  onClose,
  onConnect,
  onTest,
  tenantId,
}: ChannelConnectModalProps) {
  const [selectedChannel, setSelectedChannel] = useState<ChannelType | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleConnect = async (config: ChannelConfig) => {
    if (!selectedChannel) return;
    
    setIsLoading(true);
    setError(null);
    
    try {
      await onConnect(selectedChannel, config);
      setSelectedChannel(null);
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : undefined;
      setError(msg || 'Failed to connect channel');
    } finally {
      setIsLoading(false);
    }
  };

  const handleTest = async (config: ChannelConfig): Promise<boolean> => {
    if (!selectedChannel) return false;
    return await onTest(selectedChannel, config);
  };

  const handleClose = () => {
    setSelectedChannel(null);
    setError(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto" data-lenis-prevent>
      <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
        <div className="fixed inset-0 transition-opacity" onClick={handleClose}>
          <div className="absolute inset-0 bg-gray-500 opacity-75"></div>
        </div>

        <span className="hidden sm:inline-block sm:align-middle sm:h-screen"></span>

        <div className="inline-block align-bottom bg-white rounded-lg text-left shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
          <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4 max-h-[80vh] overflow-y-auto custom-scrollbar">
            <div className="sm:flex sm:items-start">
              <div className="mt-3 text-center sm:mt-0 sm:ml-4 sm:text-left w-full">
                <h3 className="text-lg leading-6 font-medium text-gray-900">
                  {selectedChannel ? 'Configure Channel' : 'Connect a Channel'}
                </h3>
                
                {!selectedChannel && (
                  <p className="text-sm text-muted-foreground mt-2">
                    Choose a messaging platform to connect to your unified inbox
                  </p>
                )}

                {error && (
                  <div className="mt-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm">
                    {error}
                  </div>
                )}

                {!selectedChannel ? (
                  <div className="mt-4 space-y-6">
                    {CHANNEL_GROUPS.map((group) => (
                      <div key={group.name}>
                        <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2 px-1">
                          {group.name}
                        </h4>
                        <div className="space-y-1.5">
                          {group.items.map((channel) => (
                            <button
                              key={channel.type}
                              onClick={() => !channel.comingSoon && setSelectedChannel(channel.type)}
                              disabled={channel.comingSoon}
                              className={`w-full flex items-center p-2.5 border rounded-lg transition-all text-left ${
                                channel.comingSoon
                                  ? 'border-gray-100 opacity-50 cursor-not-allowed'
                                  : 'border-gray-100 hover:border-blue-400 hover:bg-blue-50/10 cursor-pointer'
                              }`}
                            >
                              <div className={`${channel.color} w-9 h-9 rounded flex items-center justify-center text-foreground text-lg mr-3 shrink-0`}>
                                {channel.icon}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <h4 className="text-sm font-semibold text-gray-900 truncate">{channel.name}</h4>
                                  {channel.comingSoon && (
                                    <span className="px-1.5 py-0.5 text-[9px] font-bold bg-gray-100 text-muted-foreground rounded uppercase tracking-wide shrink-0">
                                      Soon
                                    </span>
                                  )}
                                </div>
                                <p className="text-[11px] text-muted-foreground truncate">{channel.description}</p>
                              </div>
                              {!channel.comingSoon && (
                                <svg className="w-4 h-4 text-foreground shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                </svg>
                              )}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="mt-4">
                    <button
                      onClick={() => setSelectedChannel(null)}
                      className="text-sm text-blue-600 hover:text-blue-800 flex items-center mb-4"
                    >
                      <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                      </svg>
                      Back to channels
                    </button>

                    {selectedChannel === ChannelType.WHATSAPP && (
                      <WhatsAppConnectForm
                        onSubmit={handleConnect}
                        onTest={handleTest}
                        isLoading={isLoading}
                      />
                    )}
                    {selectedChannel === ChannelType.TELEGRAM && (
                      <TelegramConnectForm
                        onSubmit={handleConnect}
                        onTest={handleTest}
                        isLoading={isLoading}
                      />
                    )}
                    {selectedChannel === ChannelType.SLACK && (
                      <SlackConnectForm
                        onSubmit={handleConnect}
                        onTest={handleTest}
                        isLoading={isLoading}
                      />
                    )}
                    {selectedChannel === ChannelType.EMAIL && (
                      <EmailConnectForm
                        onSubmit={handleConnect}
                        onTest={handleTest}
                        isLoading={isLoading}
                        tenantId={tenantId}
                      />
                    )}
                    {selectedChannel === ChannelType.FACEBOOK && (
                      <FacebookConnectForm
                        onSubmit={handleConnect}
                        onTest={handleTest}
                        isLoading={isLoading}
                      />
                    )}
                    {selectedChannel === ChannelType.INSTAGRAM && (
                      <InstagramConnectForm
                        onSubmit={handleConnect}
                        onTest={handleTest}
                        isLoading={isLoading}
                      />
                    )}
                    {selectedChannel === ChannelType.TIKTOK && (
                      <TikTokConnectForm
                        onSubmit={handleConnect}
                        onTest={handleTest}
                        isLoading={isLoading}
                      />
                    )}
                    {selectedChannel === ChannelType.LINKEDIN && (
                      <LinkedInConnectForm
                        onSubmit={handleConnect}
                        onTest={handleTest}
                        isLoading={isLoading}
                      />
                    )}
                    {selectedChannel === ChannelType.APPLE_BUSINESS_CHAT && (
                      <AppleBusinessConnectForm
                        onSubmit={handleConnect}
                        onTest={handleTest}
                        isLoading={isLoading}
                      />
                    )}
                    {selectedChannel === ChannelType.SNAPCHAT && (
                      <SnapchatConnectForm
                        onSubmit={handleConnect}
                        onTest={handleTest}
                        isLoading={isLoading}
                      />
                    )}
                    {selectedChannel === ChannelType.TWILIO && (
                      <TwilioConnectForm
                        onSubmit={handleConnect}
                        onTest={handleTest}
                        isLoading={isLoading}
                      />
                    )}
                    {selectedChannel === ChannelType.VAPI && (
                      <VapiConnectForm
                        onSubmit={handleConnect}
                        onTest={handleTest}
                        isLoading={isLoading}
                      />
                    )}
                    {selectedChannel !== null &&
                      ![
                        ChannelType.WHATSAPP,
                        ChannelType.TELEGRAM,
                        ChannelType.SLACK,
                        ChannelType.EMAIL,
                        ChannelType.FACEBOOK,
                        ChannelType.INSTAGRAM,
                        ChannelType.TIKTOK,
                        ChannelType.LINKEDIN,
                        ChannelType.APPLE_BUSINESS_CHAT,
                        ChannelType.SNAPCHAT,
                        ChannelType.TWILIO,
                        ChannelType.VAPI,
                      ].includes(selectedChannel) && (
                        <GenericConnectForm
                          defaultName={`${selectedChannel} Inbox`}
                          onSubmit={handleConnect}
                          onTest={handleTest}
                          isLoading={isLoading}
                        />
                      )}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
            {!selectedChannel && (
              <button
                type="button"
                onClick={handleClose}
                className="w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm"
              >
                Cancel
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
