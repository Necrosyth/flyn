import { createContext, useContext, useState, ReactNode, useCallback } from "react";

// ============================================
// NOTIFICATION EVENT TYPES - From notification docs
// ============================================
export const NOTIFICATION_EVENTS = {
  // Onboarding & Activation
  "account.created": "account.created",
  "channel.connected": "channel.connected",
  "automation.created": "automation.created",
  
  // Usage & Billing
  "usage.threshold.50": "usage.threshold.50",
  "usage.threshold.80": "usage.threshold.80",
  "usage.threshold.90": "usage.threshold.90",
  "usage.threshold.100": "usage.threshold.100",
  "billing.payment.failed": "billing.payment.failed",
  "billing.invoice.generated": "billing.invoice.generated",
  
  // AI & Automation
  "ai.agent.ready": "ai.agent.ready",
  "ai.agent.deployed": "ai.agent.deployed",
  "ai.simulation.complete": "ai.simulation.complete",
  "ai.confidence.warning": "ai.confidence.warning",
  
  // Messaging & Channels
  "message.sent": "message.sent",
  "message.failed": "message.failed",
  "channel.rate_limit": "channel.rate_limit",
  "channel.disconnected": "channel.disconnected",
  "channel.whatsapp.approved": "channel.whatsapp.approved",
  
  // Telephony
  "call.incoming": "call.incoming",
  "call.dropped": "call.dropped",
  "call.recording.notice": "call.recording.notice",
  
  // Security & Compliance
  "security.api_key.created": "security.api_key.created",
  "security.suspicious_activity": "security.suspicious_activity",
  "security.sso.enabled": "security.sso.enabled",
  "security.new_login": "security.new_login",
  
  // Team & Permissions
  "team.user.added": "team.user.added",
  "team.role.updated": "team.role.updated",
  "team.permission.blocked": "team.permission.blocked",
  
  // Upgrade & Conversion
  "upgrade.feature_tease": "upgrade.feature_tease",
  "upgrade.success": "upgrade.success",
  "feature.locked.click": "feature.locked.click",
  
  // Trial
  "trial.started": "trial.started",
  "trial.ending.3_days": "trial.ending.3_days",
  "trial.ended": "trial.ended",
  
  // System
  "system.maintenance": "system.maintenance",
  "system.incident.resolved": "system.incident.resolved",
  
  // Occasions & Lifecycle
  "occasion.org_anniversary": "occasion.org_anniversary",
  "occasion.join_anniversary": "occasion.join_anniversary",
  "occasion.milestone": "occasion.milestone",
  "occasion.holiday": "occasion.holiday",
  "occasion.birthday": "occasion.birthday",

  // Lifecycle Messaging (from Messaging Templates v2.0)
  "onboarding.account_verified": "onboarding.account_verified",
  "onboarding.profile_incomplete": "onboarding.profile_incomplete",
  "trial.midpoint": "trial.midpoint",
  "trial.expired": "trial.expired",
  "usage.exhausted": "usage.exhausted",
  "upgrade.prompt": "upgrade.prompt",
  "engagement.inactive.7d": "engagement.inactive.7d",
  "engagement.inactive.14d": "engagement.inactive.14d",
  "engagement.winback.30d": "engagement.winback.30d",
  "feature.new_launch": "feature.new_launch",
  "feature.nudge": "feature.nudge",
  "billing.renewed": "billing.renewed",
  "billing.downgrade_warning": "billing.downgrade_warning",
} as const;

export type NotificationEventType = keyof typeof NOTIFICATION_EVENTS;

// ============================================
// NOTIFICATION CHANNELS
// ============================================
export type NotificationChannel = "in_app" | "email" | "toast" | "modal" | "banner";

// ============================================
// NOTIFICATION LEVELS
// ============================================
export type NotificationLevel = "info" | "success" | "warning" | "error";

// ============================================
// NOTIFICATION TYPES
// ============================================
export interface NotificationTemplate {
  id: string;
  eventType: NotificationEventType;
  title: string;
  message: string;
  level: NotificationLevel;
  channels: NotificationChannel[];
  cta?: {
    label: string;
    action: string; // URL or action key
  };
  icon?: string;
  dismissable?: boolean;
  autoHideDuration?: number; // ms, 0 = no auto-hide
}

export interface Notification {
  id: string;
  template: NotificationTemplate;
  data: Record<string, string | number>; // Template variables
  createdAt: Date;
  readAt: Date | null;
  dismissed: boolean;
}

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null;
};

// ============================================
// NOTIFICATION TEMPLATES - Source of truth
// ============================================
const NOTIFICATION_TEMPLATES: Record<NotificationEventType, Omit<NotificationTemplate, "id">> = {
  // Onboarding
  "account.created": {
    eventType: "account.created",
    title: "Welcome to FLYN AI",
    message: "Your workspace is ready. Explore the system in safe mode — no live costs incurred.",
    level: "success",
    channels: ["banner", "email"],
    cta: { label: "Start Exploring", action: "/dashboard" },
  },
  "channel.connected": {
    eventType: "channel.connected",
    title: "Channel Connected",
    message: "{{channel}} is connected successfully. Messages are ready to flow when you activate live mode.",
    level: "success",
    channels: ["toast"],
    autoHideDuration: 5000,
  },
  "automation.created": {
    eventType: "automation.created",
    title: "Automation Created",
    message: "You can simulate this workflow before publishing live.",
    level: "success",
    channels: ["toast"],
    cta: { label: "Run Simulation", action: "simulate" },
  },

  // Usage
  "usage.threshold.50": {
    eventType: "usage.threshold.50",
    title: "Usage Update",
    message: "You've used 50% of your {{resource}} this month. Everything is running normally.",
    level: "info",
    channels: ["in_app"],
  },
  "usage.threshold.80": {
    eventType: "usage.threshold.80",
    title: "Usage Warning",
    message: "You've used 80% of your {{resource}} allowance. No action required yet.",
    level: "warning",
    channels: ["in_app", "email"],
    cta: { label: "View Usage", action: "/settings" },
  },
  "usage.threshold.90": {
    eventType: "usage.threshold.90",
    title: "Action Recommended",
    message: "You're close to your monthly {{resource}} cap. Upgrade now to avoid any interruption.",
    level: "warning",
    channels: ["modal", "email"],
    cta: { label: "Upgrade Plan", action: "/settings?tab=billing" },
  },
  "usage.threshold.100": {
    eventType: "usage.threshold.100",
    title: "Limit Reached",
    message: "Your {{resource}} limit has been reached. Live execution is paused according to your plan.",
    level: "error",
    channels: ["modal", "email"],
    cta: { label: "Upgrade Now", action: "/settings?tab=billing" },
  },
  "billing.payment.failed": {
    eventType: "billing.payment.failed",
    title: "Payment Issue",
    message: "We were unable to process your recent payment. Update your payment method to avoid service interruption.",
    level: "error",
    channels: ["modal", "email"],
    cta: { label: "Update Payment", action: "/settings?tab=billing" },
  },
  "billing.invoice.generated": {
    eventType: "billing.invoice.generated",
    title: "Invoice Ready",
    message: "Your latest invoice is now available.",
    level: "info",
    channels: ["in_app", "email"],
    cta: { label: "View Invoice", action: "/settings?tab=billing" },
  },

  // AI
  "ai.agent.ready": {
    eventType: "ai.agent.ready",
    title: "AI Agent Ready",
    message: "Your AI agent is ready. You can deploy it when live execution is enabled.",
    level: "success",
    channels: ["toast"],
  },
  "ai.agent.deployed": {
    eventType: "ai.agent.deployed",
    title: "AI Agent Live",
    message: "AI agent is now live across selected channels. Performance metrics will appear shortly.",
    level: "success",
    channels: ["toast", "in_app"],
  },
  "ai.simulation.complete": {
    eventType: "ai.simulation.complete",
    title: "Simulation Complete",
    message: "Simulation completed successfully. No live data or costs were incurred.",
    level: "success",
    channels: ["toast"],
  },
  "ai.confidence.warning": {
    eventType: "ai.confidence.warning",
    title: "AI Confidence Warning",
    message: "AI confidence dropped below threshold. Consider reviewing responses or enabling human fallback.",
    level: "warning",
    channels: ["in_app"],
    cta: { label: "Review Conversations", action: "/inbox" },
  },

  // Messaging
  "message.sent": {
    eventType: "message.sent",
    title: "Message Sent",
    message: "Message delivered successfully via {{channel}}.",
    level: "success",
    channels: ["toast"],
    autoHideDuration: 3000,
  },
  "message.failed": {
    eventType: "message.failed",
    title: "Message Failed",
    message: "Message delivery failed. Reason: {{error}}",
    level: "error",
    channels: ["toast", "in_app"],
    cta: { label: "Retry", action: "retry" },
  },
  "channel.rate_limit": {
    eventType: "channel.rate_limit",
    title: "Rate Limit Reached",
    message: "{{channel}} rate limit reached. Messages will resume automatically. No messages lost.",
    level: "warning",
    channels: ["toast"],
  },
  "channel.disconnected": {
    eventType: "channel.disconnected",
    title: "Channel Disconnected",
    message: "{{channel}} was disconnected. No messages will be sent until reconnection.",
    level: "error",
    channels: ["in_app", "email"],
    cta: { label: "Reconnect Channel", action: "/settings?tab=channels" },
  },
  "channel.whatsapp.approved": {
    eventType: "channel.whatsapp.approved",
    title: "WhatsApp Activated",
    message: "WhatsApp is now live. Usage applies based on your plan limits.",
    level: "success",
    channels: ["toast", "in_app", "email"],
  },

  // Telephony
  "call.incoming": {
    eventType: "call.incoming",
    title: "Incoming Call",
    message: "Incoming call from {{number}}. Routing to {{agent}}.",
    level: "info",
    channels: ["toast"],
  },
  "call.dropped": {
    eventType: "call.dropped",
    title: "Call Dropped",
    message: "Call ended unexpectedly. Audio logs are available for review.",
    level: "warning",
    channels: ["in_app"],
  },
  "call.recording.notice": {
    eventType: "call.recording.notice",
    title: "Recording Active",
    message: "This call is being recorded in compliance with your settings.",
    level: "info",
    channels: ["toast"],
    autoHideDuration: 3000,
  },

  // Security
  "security.api_key.created": {
    eventType: "security.api_key.created",
    title: "API Key Created",
    message: "New API key generated. Keep it secure — this key grants live execution access.",
    level: "info",
    channels: ["in_app"],
  },
  "security.suspicious_activity": {
    eventType: "security.suspicious_activity",
    title: "Security Alert",
    message: "Unusual activity detected. Execution temporarily limited as a precaution.",
    level: "error",
    channels: ["modal", "email"],
    cta: { label: "Review Activity", action: "/settings?tab=security" },
  },
  "security.sso.enabled": {
    eventType: "security.sso.enabled",
    title: "SSO Enabled",
    message: "Single Sign-On has been successfully enabled for your organization.",
    level: "success",
    channels: ["toast", "in_app"],
  },
  "security.new_login": {
    eventType: "security.new_login",
    title: "New Login Detected",
    message: "New login from {{device}} in {{location}}.",
    level: "info",
    channels: ["email"],
  },

  // Team
  "team.user.added": {
    eventType: "team.user.added",
    title: "User Added",
    message: "{{user}} has been added to your workspace.",
    level: "info",
    channels: ["toast"],
  },
  "team.role.updated": {
    eventType: "team.role.updated",
    title: "Role Updated",
    message: "{{user}}'s role was updated to {{role}}.",
    level: "info",
    channels: ["in_app"],
  },
  "team.permission.blocked": {
    eventType: "team.permission.blocked",
    title: "Permission Blocked",
    message: "Action blocked. You don't have permission to perform this operation.",
    level: "error",
    channels: ["toast"],
  },

  // Upgrade
  "upgrade.feature_tease": {
    eventType: "upgrade.feature_tease",
    title: "Feature Available",
    message: "This feature is available on {{plan}}. Upgrade to unlock AI automation and deeper analytics.",
    level: "info",
    channels: ["modal"],
    cta: { label: "Compare Plans", action: "/settings?tab=billing" },
  },
  "upgrade.success": {
    eventType: "upgrade.success",
    title: "Upgrade Complete",
    message: "Your new plan is active. All limits updated instantly — no downtime.",
    level: "success",
    channels: ["toast", "in_app", "email"],
  },
  "feature.locked.click": {
    eventType: "feature.locked.click",
    title: "Feature Locked",
    message: "This feature isn't included in your plan. Upgrade to unlock — no data lost.",
    level: "info",
    channels: ["modal"],
    cta: { label: "Upgrade", action: "/settings?tab=billing" },
  },

  // Trial
  "trial.started": {
    eventType: "trial.started",
    title: "Trial Started",
    message: "Your trial is now active. You can send real messages and run live automations.",
    level: "success",
    channels: ["banner", "email"],
  },
  "trial.ending.3_days": {
    eventType: "trial.ending.3_days",
    title: "Trial Ending Soon",
    message: "Your trial ends in 3 days. Select a plan to keep conversations live.",
    level: "warning",
    channels: ["banner", "email"],
    cta: { label: "Choose Plan", action: "/settings?tab=billing" },
  },
  "trial.ended": {
    eventType: "trial.ended",
    title: "Trial Ended",
    message: "Your trial has ended. Upgrade to continue live operations.",
    level: "warning",
    channels: ["modal", "email"],
    cta: { label: "Upgrade Now", action: "/settings?tab=billing" },
  },

  // System
  "system.maintenance": {
    eventType: "system.maintenance",
    title: "Scheduled Maintenance",
    message: "Maintenance scheduled for {{time}}. No data loss or disruption expected.",
    level: "info",
    channels: ["banner"],
  },
  "system.incident.resolved": {
    eventType: "system.incident.resolved",
    title: "Incident Resolved",
    message: "Service fully restored. Thank you for your patience.",
    level: "success",
    channels: ["banner"],
  },

  // Lifecycle Messaging
  "onboarding.account_verified": {
    eventType: "onboarding.account_verified",
    title: "Email Verified",
    message: "Your email is confirmed. You're all set to go live.",
    level: "success",
    channels: ["toast", "in_app"],
    cta: { label: "Complete Profile", action: "/settings" },
  },
  "onboarding.profile_incomplete": {
    eventType: "onboarding.profile_incomplete",
    title: "Finish Your Setup",
    message: "Add your business details and connect a channel to send your first message.",
    level: "info",
    channels: ["banner", "in_app"],
    cta: { label: "Complete Setup", action: "/settings" },
    dismissable: true,
  },
  "trial.midpoint": {
    eventType: "trial.midpoint",
    title: "Halfway Through Your Trial",
    message: "You're at the midpoint of your trial. Explore live messaging before your time runs out.",
    level: "info",
    channels: ["in_app", "email"],
    cta: { label: "Explore Features", action: "/dashboard" },
  },
  "trial.expired": {
    eventType: "trial.expired",
    title: "Trial Expired",
    message: "Your trial period has ended. Upgrade to keep your automations running.",
    level: "warning",
    channels: ["modal", "email"],
    cta: { label: "View Plans", action: "/settings?tab=billing" },
  },
  "usage.exhausted": {
    eventType: "usage.exhausted",
    title: "Usage Exhausted",
    message: "You've reached your {{resource}} limit for this month. Live delivery is paused.",
    level: "error",
    channels: ["modal", "email"],
    cta: { label: "Upgrade Now", action: "/settings?tab=billing" },
  },
  "upgrade.prompt": {
    eventType: "upgrade.prompt",
    title: "Ready to Go Further?",
    message: "Your usage is growing. Unlock more capacity and AI features with a higher plan.",
    level: "info",
    channels: ["in_app", "email"],
    cta: { label: "Compare Plans", action: "/settings?tab=billing" },
  },
  "engagement.inactive.7d": {
    eventType: "engagement.inactive.7d",
    title: "You've Been Away",
    message: "It's been 7 days since you last logged in. Your automations are still running.",
    level: "info",
    channels: ["in_app", "email"],
    cta: { label: "Resume Your Work", action: "/dashboard" },
  },
  "engagement.inactive.14d": {
    eventType: "engagement.inactive.14d",
    title: "Missing You",
    message: "Two weeks without a login. Check in to review your live conversations.",
    level: "info",
    channels: ["in_app", "email"],
    cta: { label: "Log Back In", action: "/dashboard" },
  },
  "engagement.winback.30d": {
    eventType: "engagement.winback.30d",
    title: "We've Kept Things Running",
    message: "A lot has happened in 30 days. Come back and see what your AI agents have been up to.",
    level: "info",
    channels: ["email"],
    cta: { label: "Come Back", action: "/dashboard" },
  },
  "feature.new_launch": {
    eventType: "feature.new_launch",
    title: "New Feature Live",
    message: "{{feature_name}} is now available on your plan. Try it today.",
    level: "success",
    channels: ["banner", "in_app", "email"],
    cta: { label: "Try It Now", action: "{{feature_url}}" },
    dismissable: true,
    autoHideDuration: 0,
  },
  "feature.nudge": {
    eventType: "feature.nudge",
    title: "Untapped Potential",
    message: "You haven't used {{feature_name}} yet — it could save you time every week.",
    level: "info",
    channels: ["in_app", "email"],
    cta: { label: "Explore {{feature_name}}", action: "{{feature_url}}" },
  },
  "billing.renewed": {
    eventType: "billing.renewed",
    title: "Subscription Renewed",
    message: "Your {{plan_name}} plan has been renewed. Thank you for staying with FLYN AI.",
    level: "success",
    channels: ["toast", "in_app", "email"],
    cta: { label: "View Receipt", action: "/settings?tab=billing" },
  },
  "billing.downgrade_warning": {
    eventType: "billing.downgrade_warning",
    title: "Downgrade Scheduled",
    message: "Your plan will downgrade at the end of this billing cycle. Some features may be affected.",
    level: "warning",
    channels: ["modal", "email"],
    cta: { label: "Keep Current Plan", action: "/settings?tab=billing" },
  },

  // Occasions
  "occasion.org_anniversary": {
    eventType: "occasion.org_anniversary",
    title: "Celebrating Your Journey",
    message: "Today marks {{years}} {{years_word}} since {{org_name}} was founded. Building something meaningful takes vision — we're proud to support your journey.",
    level: "success",
    channels: ["banner"],
    cta: { label: "View Milestones", action: "/dashboard" },
    dismissable: true,
  },
  "occasion.join_anniversary": {
    eventType: "occasion.join_anniversary",
    title: "Another Year Together",
    message: "You've been with FLYN AI for {{years}} {{years_word}} — thank you for building with us.",
    level: "success",
    channels: ["banner"],
    cta: { label: "See What's New", action: "/dashboard" },
    dismissable: true,
  },
  "occasion.milestone": {
    eventType: "occasion.milestone",
    title: "Milestone Reached",
    message: "{{org_name}} just crossed {{milestone}}. Consistency builds trust — well done.",
    level: "success",
    channels: ["toast", "in_app"],
  },
  "occasion.holiday": {
    eventType: "occasion.holiday",
    title: "Holiday Notice",
    message: "It's {{holiday_name}} in {{country}}. Your workflows remain active unless adjusted.",
    level: "info",
    channels: ["banner"],
    cta: { label: "Adjust Availability", action: "/settings" },
    dismissable: true,
  },
  "occasion.birthday": {
    eventType: "occasion.birthday",
    title: "Happy Birthday!",
    message: "Thanks for being part of the FLYN AI journey, {{first_name}}.",
    level: "success",
    channels: ["toast"],
    autoHideDuration: 10000,
  },
};

// ============================================
// CONTEXT TYPES
// ============================================
interface NotificationContextState {
  notifications: Notification[];
  activeBanner: Notification | null;
  activeModal: Notification | null;
}

interface NotificationContextType extends NotificationContextState {
  // Trigger notifications
  notify: (eventType: NotificationEventType, data?: Record<string, string | number>) => void;
  
  // Read notifications
  getUnreadCount: () => number;
  getNotifications: (limit?: number) => Notification[];
  
  // Actions
  markAsRead: (notificationId: string) => void;
  markAllAsRead: () => void;
  dismiss: (notificationId: string) => void;
  dismissBanner: () => void;
  dismissModal: () => void;
  
  // Clear all
  clearAll: () => void;
}

// ============================================
// HELPERS
// ============================================
const interpolateTemplate = (template: string, data: Record<string, string | number>): string => {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    return String(data[key] ?? match);
  });
};

// ============================================
// CONTEXT
// ============================================
const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const NotificationProvider = ({ children }: { children: ReactNode }) => {
  const [state, setState] = useState<NotificationContextState>(() => {
    const stored = localStorage.getItem("flyn_notifications");
    if (stored) {
      const parsed = JSON.parse(stored) as unknown;
      const parsedObj = isRecord(parsed) ? parsed : {};
      const rawNotifications = Array.isArray(parsedObj.notifications) ? parsedObj.notifications : [];
      const notifications = rawNotifications.map((n: unknown) => {
        const nObj = isRecord(n) ? n : {};
        const createdAtRaw = nObj.createdAt;
        const readAtRaw = nObj.readAt;

        return {
          ...nObj,
          createdAt: new Date(
            typeof createdAtRaw === "string" || typeof createdAtRaw === "number"
              ? createdAtRaw
              : Date.now(),
          ),
          readAt:
            typeof readAtRaw === "string" || typeof readAtRaw === "number"
              ? new Date(readAtRaw)
              : null,
        } as Notification;
      });
      return {
        notifications,
        activeBanner: null,
        activeModal: null,
      };
    }
    return {
      notifications: [],
      activeBanner: null,
      activeModal: null,
    };
  });

  const persistState = useCallback((newState: NotificationContextState) => {
    localStorage.setItem("flyn_notifications", JSON.stringify({
      notifications: newState.notifications,
      // Don't persist active banner/modal
    }));
    setState(newState);
  }, []);

  const notify = useCallback((eventType: NotificationEventType, data: Record<string, string | number> = {}) => {
    const templateDef = NOTIFICATION_TEMPLATES[eventType];
    if (!templateDef) return;

    const template: NotificationTemplate = {
      id: `${eventType}-${Date.now()}`,
      ...templateDef,
      title: interpolateTemplate(templateDef.title, data),
      message: interpolateTemplate(templateDef.message, data),
    };

    const notification: Notification = {
      id: `notif-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      template,
      data,
      createdAt: new Date(),
      readAt: null,
      dismissed: false,
    };

    // Determine how to display based on channels
    let newBanner = state.activeBanner;
    let newModal = state.activeModal;

    if (template.channels.includes("banner")) {
      newBanner = notification;
    }
    if (template.channels.includes("modal")) {
      newModal = notification;
    }

    persistState({
      notifications: [notification, ...state.notifications].slice(0, 100), // Keep last 100
      activeBanner: newBanner,
      activeModal: newModal,
    });
  }, [state, persistState]);

  const getUnreadCount = useCallback((): number => {
    return state.notifications.filter((n) => !n.readAt && !n.dismissed).length;
  }, [state.notifications]);

  const getNotifications = useCallback((limit?: number): Notification[] => {
    const active = state.notifications.filter((n) => !n.dismissed);
    return limit ? active.slice(0, limit) : active;
  }, [state.notifications]);

  const markAsRead = useCallback((notificationId: string) => {
    setState((prev) => ({
      ...prev,
      notifications: prev.notifications.map((n) =>
        n.id === notificationId ? { ...n, readAt: new Date() } : n
      ),
    }));
  }, []);

  const markAllAsRead = useCallback(() => {
    setState((prev) => ({
      ...prev,
      notifications: prev.notifications.map((n) => ({
        ...n,
        readAt: n.readAt || new Date(),
      })),
    }));
  }, []);

  const dismiss = useCallback((notificationId: string) => {
    setState((prev) => ({
      ...prev,
      notifications: prev.notifications.map((n) =>
        n.id === notificationId ? { ...n, dismissed: true } : n
      ),
    }));
  }, []);

  const dismissBanner = useCallback(() => {
    setState((prev) => ({
      ...prev,
      activeBanner: null,
    }));
  }, []);

  const dismissModal = useCallback(() => {
    setState((prev) => ({
      ...prev,
      activeModal: null,
    }));
  }, []);

  const clearAll = useCallback(() => {
    persistState({
      notifications: [],
      activeBanner: null,
      activeModal: null,
    });
  }, [persistState]);

  return (
    <NotificationContext.Provider
      value={{
        ...state,
        notify,
        getUnreadCount,
        getNotifications,
        markAsRead,
        markAllAsRead,
        dismiss,
        dismissBanner,
        dismissModal,
        clearAll,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
};

export const useNotifications = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error("useNotifications must be used within NotificationProvider");
  }
  return context;
};
