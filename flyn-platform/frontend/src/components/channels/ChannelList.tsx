import { useState } from 'react';
import { ChannelConnection, ChannelType } from './channel.types';

interface ChannelListProps {
  channels: ChannelConnection[];
  onDisconnect: (channelId: string) => Promise<void>;
  isLoading: boolean;
}

function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
    </svg>
  );
}

function TelegramIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
      <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
    </svg>
  );
}

function TwitterXIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.741l7.74-8.853L1.335 2.25H8.28l4.253 5.622 5.71-5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
    </svg>
  );
}

function TikTokIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
      <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V8.74a8.16 8.16 0 004.77 1.52V6.79a4.85 4.85 0 01-1-.1z"/>
    </svg>
  );
}

function FacebookIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
    </svg>
  );
}

function InstagramIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
    </svg>
  );
}

function SlackIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
      <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zM15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z"/>
    </svg>
  );
}

function LinkedInIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
    </svg>
  );
}

function EmailIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" xmlns="http://www.w3.org/2000/svg">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>
    </svg>
  );
}

function SMSIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" xmlns="http://www.w3.org/2000/svg">
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"/>
    </svg>
  );
}

function WebChatIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="12" r="10"/>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/>
    </svg>
  );
}

function TeamsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
      <path d="M20.625 7.875a2.625 2.625 0 100-5.25 2.625 2.625 0 000 5.25zM14.625 6.375a3 3 0 100-6 3 3 0 000 6zM20.625 9c-1.155 0-2.247.318-3.18.873A5.246 5.246 0 0119.5 13.5v.75H24v-1.875C24 10.258 22.467 9 20.625 9zM14.625 7.5c-2.9 0-5.25 2.35-5.25 5.25V14.25h10.5V12.75c0-2.9-2.35-5.25-5.25-5.25zM4.5 9.75a2.25 2.25 0 100-4.5 2.25 2.25 0 000 4.5zM1.5 11.25C.675 11.25 0 11.925 0 12.75V14.25h4.5v-.75a5.246 5.246 0 011.275-3.42A4.48 4.48 0 001.5 11.25zM14.625 15.75H9.375A1.875 1.875 0 007.5 17.625v3.75A1.875 1.875 0 009.375 23.25h5.25A1.875 1.875 0 0016.5 21.375v-3.75a1.875 1.875 0 00-1.875-1.875z"/>
    </svg>
  );
}

const CHANNEL_ICON_COMPONENTS: Partial<Record<ChannelType, React.ComponentType<{ className?: string }>>> = {
  [ChannelType.WHATSAPP]: WhatsAppIcon,
  [ChannelType.TELEGRAM]: TelegramIcon,
  [ChannelType.TWITTER]: TwitterXIcon,
  [ChannelType.TIKTOK]: TikTokIcon,
  [ChannelType.FACEBOOK]: FacebookIcon,
  [ChannelType.INSTAGRAM]: InstagramIcon,
  [ChannelType.SLACK]: SlackIcon,
  [ChannelType.SLACK_CONNECT]: SlackIcon,
  [ChannelType.LINKEDIN]: LinkedInIcon,
  [ChannelType.EMAIL]: EmailIcon,
  [ChannelType.SMS]: SMSIcon,
  [ChannelType.MMS]: SMSIcon,
  [ChannelType.WEBCHAT]: WebChatIcon,
  [ChannelType.TEAMS]: TeamsIcon,
};

const channelTypeNames: Partial<Record<ChannelType, string>> = {
  [ChannelType.WHATSAPP]: 'WhatsApp Business API',
  [ChannelType.TELEGRAM]: 'Telegram',
  [ChannelType.SLACK]: 'Slack',
  [ChannelType.SLACK_CONNECT]: 'Slack Connect',
  [ChannelType.EMAIL]: 'Email',
  [ChannelType.FACEBOOK]: 'Facebook Messenger',
  [ChannelType.INSTAGRAM]: 'Instagram Direct Messages',
  [ChannelType.SMS]: 'SMS',
  [ChannelType.MMS]: 'MMS',
  [ChannelType.VOICE]: 'Voice Calls',
  [ChannelType.WEBCHAT]: 'Web Chat / Live Chat Widget',
  [ChannelType.TEAMS]: 'Microsoft Teams',
  [ChannelType.APPLE_BUSINESS_CHAT]: 'Apple Business Chat',
  [ChannelType.GOOGLE_BUSINESS_MESSAGES]: 'Google Business Messages',
  [ChannelType.TWITTER]: 'Twitter / X Direct Messages',
  [ChannelType.TIKTOK]: 'TikTok Direct Messages',
  [ChannelType.LINKEDIN]: 'LinkedIn Messaging',
};

const CHANNEL_COLORS: Partial<Record<ChannelType, string>> = {
  [ChannelType.WHATSAPP]: 'bg-green-100 text-green-600',
  [ChannelType.TELEGRAM]: 'bg-sky-100 text-sky-500',
  [ChannelType.TWITTER]: 'bg-gray-100 text-gray-900',
  [ChannelType.TIKTOK]: 'bg-zinc-900 text-white',
  [ChannelType.FACEBOOK]: 'bg-blue-100 text-blue-600',
  [ChannelType.INSTAGRAM]: 'bg-pink-100 text-pink-600',
  [ChannelType.SLACK]: 'bg-purple-100 text-purple-600',
  [ChannelType.SLACK_CONNECT]: 'bg-purple-100 text-purple-600',
  [ChannelType.EMAIL]: 'bg-gray-100 text-gray-600',
  [ChannelType.SMS]: 'bg-yellow-100 text-yellow-700',
  [ChannelType.MMS]: 'bg-yellow-100 text-yellow-700',
  [ChannelType.VOICE]: 'bg-orange-100 text-orange-600',
  [ChannelType.WEBCHAT]: 'bg-slate-100 text-slate-600',
  [ChannelType.TEAMS]: 'bg-indigo-100 text-indigo-600',
  [ChannelType.LINKEDIN]: 'bg-blue-100 text-blue-700',
};

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-green-500',
  inactive: 'bg-yellow-500',
  disconnected: 'bg-gray-400',
  error: 'bg-red-500',
};

export function ChannelList({ channels, onDisconnect, isLoading }: ChannelListProps) {
  const [disconnectingId, setDisconnectingId] = useState<string | null>(null);

  const handleDisconnect = async (channelId: string) => {
    if (!confirm('Are you sure you want to disconnect this channel?')) return;
    setDisconnectingId(channelId);
    try {
      await onDisconnect(channelId);
    } finally {
      setDisconnectingId(null);
    }
  };

  if (channels.length === 0) {
    return (
      <div className="text-center py-12 bg-gray-50 rounded-lg">
        <div className="text-4xl mb-4">📭</div>
        <h3 className="text-lg font-medium text-gray-900 mb-2">No channels connected</h3>
        <p className="text-gray-500 max-w-sm mx-auto">
          Connect your messaging platforms to start receiving and sending messages from your unified inbox.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {channels.map((channel) => {
        const IconComponent = CHANNEL_ICON_COMPONENTS[channel.type];
        const colorClass = CHANNEL_COLORS[channel.type] || 'bg-gray-100 text-gray-600';

        return (
          <div
            key={channel.id}
            className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${colorClass}`}>
                  {IconComponent
                    ? <IconComponent className="w-6 h-6" />
                    : <span className="text-xl">💬</span>}
                </div>

                <div>
                  <div className="flex items-center space-x-2">
                    <p className="text-sm text-gray-500">{channelTypeNames[channel.type] || channel.type}</p>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                      channel.status === 'active' ? 'bg-green-100 text-green-800' :
                      channel.status === 'error' ? 'bg-red-100 text-red-800' :
                      'bg-gray-100 text-gray-800'
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${STATUS_COLORS[channel.status] || 'bg-gray-400'}`}></span>
                      {channel.status.charAt(0).toUpperCase() + channel.status.slice(1)}
                    </span>
                  </div>
                  <p className="text-sm text-gray-500 mt-0.5">
                    Connected on {new Date(channel.createdAt).toLocaleDateString()}
                  </p>
                  {channel.chatwootInboxId && (
                    <p className="text-xs text-gray-400 mt-0.5">
                      Inbox ID: {channel.chatwootInboxId}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex items-center space-x-3">
                <button
                  onClick={() => handleDisconnect(channel.id)}
                  disabled={isLoading || disconnectingId === channel.id}
                  className="px-3 py-1.5 text-sm text-red-600 hover:text-red-800 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                >
                  {disconnectingId === channel.id ? 'Disconnecting...' : 'Disconnect'}
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
