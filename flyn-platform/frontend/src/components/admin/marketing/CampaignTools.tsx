import { useState } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useMarketingDashboard, Campaign } from "@/contexts/MarketingDashboardContext";
import {
  MessageSquare,
  Mail,
  Phone,
  Linkedin,
  Plus,
  Play,
  Pause,
  Copy,
  Send,
  TrendingUp,
} from "lucide-react";

const campaignTypeIcons: Record<Campaign["type"], React.ElementType> = {
  whatsapp: MessageSquare,
  email: Mail,
  sms: Phone,
  social: Linkedin,
};

const statusColors: Record<Campaign["status"], string> = {
  draft: "bg-muted text-muted-foreground",
  scheduled: "bg-blue-500/10 text-blue-600",
  active: "bg-green-500/10 text-green-600",
  paused: "bg-amber-500/10 text-amber-600",
  completed: "bg-primary/10 text-primary",
};

// Pre-approved templates
const whatsappTemplates = [
  {
    id: "wt-1",
    name: "Welcome Message",
    content: "Hi {{name}}! 👋 Welcome to FLYN AI. I'm here to help you get started with our platform. Would you like a quick demo?",
  },
  {
    id: "wt-2",
    name: "Trial Reminder",
    content: "Hey {{name}}! Your FLYN AI trial ends in {{days}} days. Ready to unlock the full power? Let me know if you have any questions! 🚀",
  },
  {
    id: "wt-3",
    name: "Follow-up",
    content: "Hi {{name}}, just checking in! Did you get a chance to explore FLYN AI? Happy to answer any questions.",
  },
];

const emailTemplates = [
  {
    id: "et-1",
    name: "Demo Request Follow-up",
    subject: "Your FLYN AI Demo - Let's Schedule!",
    content: "Hi {{name}},\n\nThanks for your interest in FLYN AI! I'd love to show you how we can help {{company}} streamline operations.\n\nWould you be available for a 15-minute call this week?\n\nBest,\n{{sender_name}}",
  },
  {
    id: "et-2",
    name: "Activation Nudge",
    subject: "You're so close to unlocking FLYN AI's power!",
    content: "Hi {{name}},\n\nI noticed you haven't completed your setup yet. Here's a quick checklist to get you started:\n\n1. Connect your first channel\n2. Import your contacts\n3. Send your first message\n\nNeed help? Just reply to this email!\n\nBest,\n{{sender_name}}",
  },
];

const linkedinScripts = [
  {
    id: "li-1",
    name: "Cold Outreach",
    content: "Hi {{name}}, I came across your profile and noticed you're in {{industry}}. We're helping companies like yours automate customer conversations with AI. Would you be open to a quick chat?",
  },
  {
    id: "li-2",
    name: "Post-Connection",
    content: "Thanks for connecting, {{name}}! I'd love to share how FLYN AI is helping {{industry}} teams save 10+ hours/week on customer communications. Interested in a demo?",
  },
];

export function CampaignTools() {
  const { campaigns, addCampaign, updateCampaign } = useMarketingDashboard();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newCampaign, setNewCampaign] = useState({
    name: "",
    type: "email" as Campaign["type"],
    status: "draft" as Campaign["status"],
    targetCount: 0,
    sentCount: 0,
    openRate: 0,
    responseRate: 0,
  });

  const handleCreateCampaign = () => {
    addCampaign(newCampaign);
    setIsCreateOpen(false);
    setNewCampaign({
      name: "",
      type: "email",
      status: "draft",
      targetCount: 0,
      sentCount: 0,
      openRate: 0,
      responseRate: 0,
    });
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      {/* Active Campaigns */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Send className="w-5 h-5 text-primary" />
                Campaign Management
              </CardTitle>
              <CardDescription>Create and manage outreach campaigns</CardDescription>
            </div>
            <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
              <DialogTrigger asChild>
                <Button className="flyn-button-gradient">
                  <Plus className="w-4 h-4 mr-2" />
                  New Campaign
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create Campaign</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 mt-4">
                  <div className="space-y-2">
                    <Label>Campaign Name</Label>
                    <Input
                      value={newCampaign.name}
                      onChange={(e) => setNewCampaign(prev => ({ ...prev, name: e.target.value }))}
                      placeholder="Q1 Product Launch"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Channel</Label>
                    <Select
                      value={newCampaign.type}
                      onValueChange={(v: Campaign["type"]) => setNewCampaign(prev => ({ ...prev, type: v }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="whatsapp">WhatsApp</SelectItem>
                        <SelectItem value="email">Email</SelectItem>
                        <SelectItem value="sms">SMS</SelectItem>
                        <SelectItem value="social">Social</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Target Audience Size</Label>
                    <Input
                      type="number"
                      value={newCampaign.targetCount}
                      onChange={(e) => setNewCampaign(prev => ({ ...prev, targetCount: parseInt(e.target.value) || 0 }))}
                    />
                  </div>
                  <Button onClick={handleCreateCampaign} className="w-full flyn-button-gradient">
                    Create Campaign
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {campaigns.map((campaign) => {
              const TypeIcon = campaignTypeIcons[campaign.type];
              const progress = campaign.targetCount > 0 ? (campaign.sentCount / campaign.targetCount) * 100 : 0;

              return (
                <div
                  key={campaign.id}
                  className="flex items-center gap-4 p-4 rounded-lg border border-border hover:bg-muted/30 transition-colors"
                >
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <TypeIcon className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium">{campaign.name}</p>
                      <Badge className={statusColors[campaign.status]}>{campaign.status}</Badge>
                    </div>
                    <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground">
                      <span>{campaign.sentCount}/{campaign.targetCount} sent</span>
                      <span className="flex items-center gap-1">
                        <TrendingUp className="w-3 h-3" />
                        {campaign.openRate}% open
                      </span>
                      <span>{campaign.responseRate}% response</span>
                    </div>
                    <Progress value={progress} className="h-1.5 mt-2" />
                  </div>
                  <div className="flex items-center gap-2">
                    {campaign.status === "active" ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => updateCampaign(campaign.id, { status: "paused" })}
                      >
                        <Pause className="w-4 h-4" />
                      </Button>
                    ) : campaign.status === "paused" || campaign.status === "draft" ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => updateCampaign(campaign.id, { status: "active" })}
                      >
                        <Play className="w-4 h-4" />
                      </Button>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Template Library */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Copy className="w-5 h-5 text-primary" />
            Approved Templates
          </CardTitle>
          <CardDescription>Pre-approved messaging templates for compliant outreach</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="whatsapp">
            <TabsList className="mb-4">
              <TabsTrigger value="whatsapp" className="gap-2">
                <MessageSquare className="w-4 h-4" />
                WhatsApp
              </TabsTrigger>
              <TabsTrigger value="email" className="gap-2">
                <Mail className="w-4 h-4" />
                Email
              </TabsTrigger>
              <TabsTrigger value="linkedin" className="gap-2">
                <Linkedin className="w-4 h-4" />
                LinkedIn
              </TabsTrigger>
            </TabsList>

            <TabsContent value="whatsapp" className="space-y-3">
              {whatsappTemplates.map((template) => (
                <div
                  key={template.id}
                  className="p-4 rounded-lg border border-border hover:border-primary/50 transition-colors"
                >
                  <div className="flex items-center justify-between mb-2">
                    <p className="font-medium">{template.name}</p>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => copyToClipboard(template.content)}
                    >
                      <Copy className="w-4 h-4 mr-1" />
                      Copy
                    </Button>
                  </div>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">{template.content}</p>
                </div>
              ))}
            </TabsContent>

            <TabsContent value="email" className="space-y-3">
              {emailTemplates.map((template) => (
                <div
                  key={template.id}
                  className="p-4 rounded-lg border border-border hover:border-primary/50 transition-colors"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <p className="font-medium">{template.name}</p>
                      <p className="text-sm text-primary">Subject: {template.subject}</p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => copyToClipboard(template.content)}
                    >
                      <Copy className="w-4 h-4 mr-1" />
                      Copy
                    </Button>
                  </div>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">{template.content}</p>
                </div>
              ))}
            </TabsContent>

            <TabsContent value="linkedin" className="space-y-3">
              {linkedinScripts.map((script) => (
                <div
                  key={script.id}
                  className="p-4 rounded-lg border border-border hover:border-primary/50 transition-colors"
                >
                  <div className="flex items-center justify-between mb-2">
                    <p className="font-medium">{script.name}</p>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => copyToClipboard(script.content)}
                    >
                      <Copy className="w-4 h-4 mr-1" />
                      Copy
                    </Button>
                  </div>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">{script.content}</p>
                </div>
              ))}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </motion.div>
  );
}
