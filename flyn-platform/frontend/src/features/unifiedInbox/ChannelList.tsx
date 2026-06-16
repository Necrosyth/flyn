import { cn } from "@/lib/utils";
import type { Channel, ChannelType } from "@/types/inbox";
import { ChannelIcon } from "./ChannelIcon";
import { StatusBadge } from "./StatusBadge";
import { MessageSquare } from "lucide-react";

interface ChannelListProps {
  channels: Channel[];
  selectedChannel: string | null;
  onSelectChannel: (channelId: string | null) => void;
}

const channelNames: Partial<Record<ChannelType, string>> = {
  whatsapp: "WhatsApp Business API",
  email: "Email",
  facebook: "Facebook Messenger",
  instagram: "Instagram Direct Messages",
  telegram: "Telegram",
  slack: "Slack",
  slack_connect: "Slack Connect",
  sms: "SMS",
  mms: "MMS",
  voice: "Voice Calls",
  web: "Web Chat",
  webchat: "Web Chat",
  teams: "Microsoft Teams",
  apple_business_chat: "Apple Business Chat",
  google_business_messages: "Google Business Messages",
  twitter: "Twitter / X Direct Messages",
  tiktok: "TikTok Direct Messages",
  linkedin: "LinkedIn Messaging",
};

export function ChannelList({ channels, selectedChannel, onSelectChannel }: ChannelListProps) {
  return (
    <div className="space-y-1">
      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-3 mb-2">
        Channels
      </h3>
      
      {/* Explicit 'All' Filter */}
      <button
        onClick={() => onSelectChannel(null)}
        className={cn(
          "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 mb-1",
          "hover:bg-accent/50",
          selectedChannel === null
            ? "bg-primary/10 text-primary border border-primary/20"
            : "text-foreground"
        )}
      >
        <div className={cn(
          "flex items-center justify-center w-8 h-8 rounded-lg",
          selectedChannel === null ? "bg-primary/20" : "bg-muted"
        )}>
          <MessageSquare className={cn("w-4 h-4", selectedChannel === null ? "text-primary" : "text-muted-foreground")} />
        </div>
        <span className="font-medium flex-1 text-left">All Conversations</span>
      </button>

      {channels.length === 0 && (
        <p className="text-xs text-muted-foreground px-3 py-2">
          No channels connected. Go to Integrations to connect WhatsApp, Email, or other channels.
        </p>
      )}
      {channels.map((channel) => (
        <button
          key={channel.id}
          onClick={() => onSelectChannel(selectedChannel === channel.id ? null : channel.id)}
          className={cn(
            "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200",
            "hover:bg-accent/50",
            selectedChannel === channel.id
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-foreground"
          )}
        >
          <div
            className={cn(
              "flex items-center justify-center w-8 h-8 rounded-lg",
              selectedChannel === channel.id
                ? "bg-primary-foreground/20"
                : "bg-muted"
            )}
          >
            <ChannelIcon
              type={channel.type}
              className={selectedChannel === channel.id ? "text-primary-foreground" : undefined}
              size={18}
            />
          </div>
          <span className="font-medium flex-1 text-left">
            {channelNames[channel.type] || channel.type}
          </span>
          {channel.status !== "active" && (
            <StatusBadge status={channel.status} />
          )}
        </button>
      ))}
    </div>
  );
}
