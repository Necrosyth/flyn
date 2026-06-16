/**
 * Plugin Registry Page
 *
 * Marketplace-style page showing all available plugins and modules.
 * Free/active plugins open their dashboard directly.
 * Paid-addon plugins show an upgrade gate when the tenant lacks the feature.
 */

import { useNavigate } from 'react-router-dom';
import {
  Users, Calendar, Briefcase, Heart, GraduationCap, Wrench,
  ChevronRight, Plug, Sparkles, CheckCircle2, Clock, Lock,
  MessageCircle, Phone, Bot, Receipt, Megaphone, PenTool, Share2,
  BookOpen, Zap,
} from 'lucide-react';
import AppLayout from '@/components/AppLayout';
import { usePlan } from '@/contexts/PlanContext';
import type { FeatureKey } from '@/contexts/PlanContext';
import { Button } from '@/components/ui/button';

type PluginStatus = 'active' | 'coming_soon' | 'beta' | 'paid_addon';

interface PluginConfig {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  color: string;
  gradient: string;
  status: PluginStatus;
  features: string[];
  route?: string;
  featureKey?: FeatureKey;
  upgradeMinPlan?: string;
  category: 'core' | 'vertical' | 'ai' | 'channel';
}

const plugins: PluginConfig[] = [
  // ── Core Modules ────────────────────────────────────────────────────────────
  {
    id: 'crm',
    name: 'CRM',
    category: 'core',
    description: 'Customer Relationship Management — contacts, deals, pipelines, and activity tracking with AI-powered lead scoring.',
    icon: <Users className="w-7 h-7" />,
    color: '#10b981',
    gradient: 'from-emerald-500 to-teal-600',
    status: 'active',
    features: ['Contact Management', 'Deal Pipeline', 'Activity Feed', 'Dashboard Analytics', 'Workflow Integration', 'Lead Scoring'],
    route: '/dashboard/crm',
  },
  {
    id: 'accounting',
    name: 'Accounting',
    category: 'core',
    description: 'Financial backbone for the entire platform — invoices, expenses, multi-currency support, tax compliance, and payroll across all modules.',
    icon: <Receipt className="w-7 h-7" />,
    color: '#14b8a6',
    gradient: 'from-teal-500 to-emerald-600',
    status: 'active',
    features: ['Invoice Builder', 'Multi-Currency', 'Expense Tracking', 'Tax Compliance', 'Payroll', 'Financial Reports', 'Bank Reconciliation', 'AR Aging'],
    route: '/dashboard/accounting',
  },
  {
    id: 'phonebook',
    name: 'Phonebook',
    category: 'core',
    description: 'Unified contact directory — manage contacts, create broadcast groups, and send bulk messages across WhatsApp, SMS, and Email.',
    icon: <BookOpen className="w-7 h-7" />,
    color: '#6366f1',
    gradient: 'from-indigo-500 to-violet-600',
    status: 'active',
    features: ['Contact Directory', 'Broadcast Groups', 'WhatsApp Broadcast', 'SMS & Email Blast', 'CSV Import/Export', 'Tag Management'],
    route: '/phonebook',
  },

  // ── Vertical Modules ─────────────────────────────────────────────────────────
  {
    id: 'events',
    name: 'Events',
    category: 'vertical',
    description: 'End-to-end event management — create events, track registrations, manage attendees, and reconcile revenue in real time.',
    icon: <Calendar className="w-7 h-7" />,
    color: '#6366f1',
    gradient: 'from-indigo-500 to-purple-600',
    status: 'active',
    features: ['Event Creation', 'Attendee Tracking', 'Ticketing & Revenue', 'Calendar Integration', 'WhatsApp Invites', 'Check-in Management'],
    route: '/dashboard/events',
  },
  {
    id: 'hr',
    name: 'HR',
    category: 'vertical',
    description: 'Full-cycle human resources — employee records, attendance, leave management, payroll integration, and performance reviews.',
    icon: <Briefcase className="w-7 h-7" />,
    color: '#f59e0b',
    gradient: 'from-amber-500 to-orange-600',
    status: 'active',
    features: ['Employee Records', 'Attendance Tracking', 'Leave Management', 'Payroll Integration', 'Performance Reviews', 'Department Analytics'],
    route: '/dashboard/hr',
  },
  {
    id: 'church',
    name: 'Church',
    category: 'vertical',
    description: 'Complete church management — member directory, small groups, donations tracking, ministry scheduling, and engagement scoring.',
    icon: <Heart className="w-7 h-7" />,
    color: '#ec4899',
    gradient: 'from-pink-500 to-rose-600',
    status: 'active',
    features: ['Member Directory', 'Small Groups', 'Donations Tracking', 'Ministry Management', 'Volunteer Scheduling', 'Giving Analytics'],
    route: '/dashboard/church',
  },
  {
    id: 'coaches',
    name: 'Coaches',
    category: 'vertical',
    description: 'Coaching operating system — manage clients, schedule sessions, track progress, and automate billing with AI health scoring.',
    icon: <GraduationCap className="w-7 h-7" />,
    color: '#8b5cf6',
    gradient: 'from-violet-500 to-purple-600',
    status: 'active',
    features: ['Client Management', 'Session Scheduling', 'Progress Tracking', 'Revenue Dashboard', 'AI Health Scores', 'Billing Automation'],
    route: '/dashboard/coaches',
  },
  {
    id: 'freelancers',
    name: 'Freelancers',
    category: 'vertical',
    description: 'Freelance business management — projects, milestone-based invoicing, client portals, and profitability analytics per client.',
    icon: <Wrench className="w-7 h-7" />,
    color: '#0ea5e9',
    gradient: 'from-sky-500 to-cyan-600',
    status: 'active',
    features: ['Project Management', 'Milestone Invoicing', 'Time Tracking', 'Client Portal', 'AI Estimates', 'Profitability Reports'],
    route: '/dashboard/freelancers',
  },

  // ── AI Modules ───────────────────────────────────────────────────────────────
  {
    id: 'ai-marketing',
    name: 'AI Marketing',
    category: 'ai',
    description: 'AI-powered campaign management — create audience segments, launch multi-channel campaigns, and generate copy across email, WhatsApp, SMS, and voice.',
    icon: <Megaphone className="w-7 h-7" />,
    color: '#f97316',
    gradient: 'from-orange-500 to-red-600',
    status: 'active',
    features: ['Campaign Builder', 'Audience Segments', 'AI Copy Generation', 'Multi-Channel Launch', 'Performance Analytics', 'A/B Testing'],
    route: '/ai/marketing',
    featureKey: 'ai.marketing',
    upgradeMinPlan: 'Growth',
  },
  {
    id: 'ai-content',
    name: 'AI Content Creator',
    category: 'ai',
    description: 'Long-form and short-form content generation — blog posts, landing pages, captions, ad copy, and brand voice management powered by AI.',
    icon: <PenTool className="w-7 h-7" />,
    color: '#a855f7',
    gradient: 'from-purple-500 to-pink-600',
    status: 'active',
    features: ['Blog Posts & Guides', 'Short-Form Captions', 'Ad Copy', 'Brand Voice Presets', 'Keyword Optimization', 'Multi-Language'],
    route: '/ai/content',
    featureKey: 'ai.content',
    upgradeMinPlan: 'Growth',
  },
  {
    id: 'ai-social',
    name: 'AI Social Media',
    category: 'ai',
    description: 'Social media calendar and AI composer — schedule posts across LinkedIn, Instagram, Twitter, and Facebook with AI-generated content and hashtags.',
    icon: <Share2 className="w-7 h-7" />,
    color: '#06b6d4',
    gradient: 'from-cyan-500 to-blue-600',
    status: 'active',
    features: ['Content Calendar', 'AI Post Composer', 'Multi-Platform Schedule', 'Hashtag Generator', 'Engagement Insights', 'Best Time Recommendations'],
    route: '/ai/social',
    featureKey: 'ai.social',
    upgradeMinPlan: 'Growth',
  },
  {
    id: 'ai-agents',
    name: 'AI Agents',
    category: 'ai',
    description: 'Build and deploy autonomous AI agents — handle incoming leads, answer customer queries, book appointments, and update your CRM 24/7.',
    icon: <Bot className="w-7 h-7" />,
    color: '#8b5cf6',
    gradient: 'from-violet-500 to-indigo-600',
    status: 'active',
    features: ['Agent Builder', 'Lead Qualification', 'Appointment Booking', 'CRM Auto-Update', 'WhatsApp & Email', 'AI Autopilot'],
    route: '/ai-agents',
    featureKey: 'ai.agent.builder',
    upgradeMinPlan: 'Growth',
  },
  {
    id: 'automations',
    name: 'Automations',
    category: 'ai',
    description: 'Visual workflow builder — design multi-step automations connecting CRM, messaging, AI, and external tools with drag-and-drop node editor.',
    icon: <Zap className="w-7 h-7" />,
    color: '#eab308',
    gradient: 'from-yellow-500 to-orange-500',
    status: 'active',
    features: ['Visual Flow Builder', 'Trigger Library', 'CRM Integration', 'AI Node', 'Webhook Support', 'Test Mode'],
    route: '/automations',
    featureKey: 'automation.builder',
    upgradeMinPlan: 'Starter',
  },

  // ── Channels ─────────────────────────────────────────────────────────────────
  {
    id: 'whatsapp-crm',
    name: 'WhatsApp CRM',
    category: 'channel',
    description: 'Manage customer relationships directly over WhatsApp — conversations, contacts, bulk broadcasts, and auto-replies in one place.',
    icon: <MessageCircle className="w-7 h-7" />,
    color: '#25d366',
    gradient: 'from-green-500 to-emerald-600',
    status: 'paid_addon',
    features: ['WhatsApp Conversations', 'Contact Sync', 'Bulk Messaging', 'Auto-replies', 'Conversation History', 'Template Manager'],
    route: '/plugins/whatsapp-crm',
    featureKey: 'channels.whatsapp',
    upgradeMinPlan: 'Growth',
  },
  {
    id: 'telegram',
    name: 'Telegram',
    category: 'channel',
    description: 'Manage your Telegram bot — subscriber conversations, channel broadcasting, bulk messaging, and bot command automation.',
    icon: <Bot className="w-7 h-7" />,
    color: '#2196f3',
    gradient: 'from-blue-500 to-indigo-600',
    status: 'paid_addon',
    features: ['Bot Conversations', 'Channel Management', 'Bulk Broadcasts', 'Bot Commands', 'Subscriber Analytics', 'Auto-responders'],
    route: '/plugins/telegram',
    featureKey: 'channels.telegram',
    upgradeMinPlan: 'Growth',
  },
  {
    id: 'telephony',
    name: 'Telephony',
    category: 'channel',
    description: 'AI-powered calling suite — power dialer, IVR builder, call recordings, live monitoring, and AI call autopilot for outbound campaigns.',
    icon: <Phone className="w-7 h-7" />,
    color: '#3b82f6',
    gradient: 'from-blue-500 to-indigo-600',
    status: 'paid_addon',
    features: ['Power Dialer', 'IVR Builder', 'Call Recordings', 'Live Monitoring', 'AI Call Autopilot', 'Call Analytics'],
    route: '/dialer',
    featureKey: 'telephony.calls.live',
    upgradeMinPlan: 'Growth',
  },
];

const CATEGORY_LABELS: Record<PluginConfig['category'], string> = {
  core: 'Core Modules',
  vertical: 'Industry Verticals',
  ai: 'AI & Automation',
  channel: 'Channels & Messaging',
};

const statusBadge = (status: PluginStatus) => {
  switch (status) {
    case 'active':
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
          <CheckCircle2 className="w-3 h-3" /> Active
        </span>
      );
    case 'beta':
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-500/15 text-amber-400 border border-amber-500/20">
          <Sparkles className="w-3 h-3" /> Beta
        </span>
      );
    case 'paid_addon':
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-500/15 text-blue-400 border border-blue-500/20">
          <Sparkles className="w-3 h-3" /> Add-on
        </span>
      );
    case 'coming_soon':
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-500/15 text-muted-foreground border border-slate-500/20">
          <Clock className="w-3 h-3" /> Coming Soon
        </span>
      );
  }
};

const PluginRegistry = () => {
  const navigate = useNavigate();
  const { isEntitled, currentPlan } = usePlan();

  const handlePluginClick = (plugin: PluginConfig) => {
    if (plugin.status === 'coming_soon') return;
    if (plugin.status === 'paid_addon' && plugin.featureKey && !isEntitled(plugin.featureKey)) return;
    if (plugin.route) navigate(plugin.route);
  };

  const categories = (['core', 'vertical', 'ai', 'channel'] as const).filter(
    (cat) => plugins.some((p) => p.category === cat)
  );

  return (
    <AppLayout>
      <div className="flex-1 overflow-auto">
        {/* Header */}
        <div className="relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-indigo-600/10 via-purple-600/5 to-transparent" />
          <div className="relative px-8 pt-10 pb-8">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2.5 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white shadow-lg shadow-indigo-500/20">
                <Plug className="w-6 h-6" />
              </div>
              <h1 className="text-3xl font-bold text-foreground tracking-tight">Plugins & Modules</h1>
            </div>
            <p className="text-muted-foreground text-base max-w-xl mt-2">
              Extend your platform with modular plugins. Each module adds domain-specific dashboards, workflow nodes, and financial integration.
            </p>
            <div className="flex items-center gap-4 mt-4 text-sm text-muted-foreground">
              <span className="flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> {plugins.filter(p => p.status === 'active').length} Active</span>
              <span className="flex items-center gap-1.5"><Sparkles className="w-3.5 h-3.5 text-blue-400" /> {plugins.filter(p => p.status === 'paid_addon').length} Add-ons</span>
              <span className="flex items-center gap-1.5"><Clock className="w-3.5 h-3.5 text-muted-foreground" /> {plugins.filter(p => p.status === 'coming_soon').length} Coming Soon</span>
            </div>
          </div>
        </div>

        {/* Plugin Grid — grouped by category */}
        <div className="px-8 pb-12 space-y-10">
          {categories.map((cat) => {
            const categoryPlugins = plugins.filter((p) => p.category === cat);
            return (
              <div key={cat}>
                <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-4">
                  {CATEGORY_LABELS[cat]}
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                  {categoryPlugins.map((plugin) => {
                    const isLocked =
                      plugin.status === 'paid_addon' &&
                      !!plugin.featureKey &&
                      !isEntitled(plugin.featureKey);

                    const isClickable =
                      plugin.status !== 'coming_soon' && !isLocked && !!plugin.route;

                    return (
                      <div
                        key={plugin.id}
                        onClick={() => handlePluginClick(plugin)}
                        className={`group relative rounded-2xl border transition-all duration-300 ${
                          isClickable
                            ? 'border-border bg-muted/40 hover:bg-muted/50 hover:border-border cursor-pointer hover:shadow-xl hover:shadow-black/20'
                            : isLocked
                            ? 'border-border bg-muted/40 cursor-default'
                            : 'border-border bg-white/[0.01] opacity-70 cursor-default'
                        }`}
                      >
                        {/* Gradient glow on hover */}
                        {isClickable && (
                          <div className={`absolute -inset-px rounded-2xl bg-gradient-to-br ${plugin.gradient} opacity-0 group-hover:opacity-10 transition-opacity duration-300 blur-sm`} />
                        )}

                        {/* Lock overlay */}
                        {isLocked && (
                          <div className="absolute inset-0 rounded-2xl bg-black/40 backdrop-blur-[2px] z-10 flex flex-col items-center justify-center gap-3 p-6">
                            <div className="p-3 rounded-full bg-muted border border-border">
                              <Lock className="w-6 h-6 text-white/70" />
                            </div>
                            <div className="text-center">
                              <p className="text-white/90 font-semibold text-sm mb-0.5">
                                {plugin.upgradeMinPlan
                                  ? `Requires ${plugin.upgradeMinPlan} plan`
                                  : 'Paid Add-on'}
                              </p>
                              <p className="text-white/50 text-xs">Your plan: {currentPlan}</p>
                            </div>
                            <Button
                              size="sm"
                              className="bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-400 hover:to-purple-500 text-white border-0 text-xs h-8 px-4"
                              onClick={(e) => { e.stopPropagation(); navigate('/settings/billing'); }}
                            >
                              Upgrade to unlock
                            </Button>
                          </div>
                        )}

                        <div className="relative p-6">
                          {/* Top row: icon + status */}
                          <div className="flex items-start justify-between mb-4">
                            <div
                              className={`p-3 rounded-xl bg-gradient-to-br ${plugin.gradient} text-white shadow-lg`}
                              style={{ boxShadow: `0 8px 24px ${plugin.color}22` }}
                            >
                              {plugin.icon}
                            </div>
                            {statusBadge(plugin.status)}
                          </div>

                          {/* Name and description */}
                          <h3 className="text-lg font-semibold text-foreground mb-1.5">{plugin.name}</h3>
                          <p className="text-sm text-muted-foreground leading-relaxed mb-4">{plugin.description}</p>

                          {/* Features */}
                          <div className="flex flex-wrap gap-1.5 mb-5">
                            {plugin.features.slice(0, 4).map((feature) => (
                              <span
                                key={feature}
                                className="px-2 py-0.5 rounded-md text-[11px] font-medium bg-muted/40 text-foreground border border-border"
                              >
                                {feature}
                              </span>
                            ))}
                            {plugin.features.length > 4 && (
                              <span className="px-2 py-0.5 rounded-md text-[11px] font-medium text-muted-foreground">
                                +{plugin.features.length - 4} more
                              </span>
                            )}
                          </div>

                          {/* Action */}
                          {isClickable ? (
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-medium text-indigo-400 group-hover:text-indigo-300 transition-colors">
                                {plugin.status === 'active' ? 'Open' : 'Open Plugin'}
                              </span>
                              <ChevronRight className="w-4 h-4 text-indigo-400 group-hover:translate-x-1 transition-transform" />
                            </div>
                          ) : isLocked ? (
                            <div className="flex items-center gap-1.5 text-muted-foreground text-sm">
                              <Lock className="w-3.5 h-3.5" />
                              <span>Upgrade to unlock</span>
                            </div>
                          ) : (
                            <div className="text-sm text-muted-foreground italic">Coming soon</div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </AppLayout>
  );
};

export default PluginRegistry;
