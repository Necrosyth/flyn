import { motion } from "framer-motion";
import { Mail, Phone, Building2, Briefcase, MapPin, MessageSquare, UserPlus } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export interface Contact {
  id: string;
  name: string;
  avatar?: string;
  status: "lead" | "qualified" | "customer" | "churned";
  subtitle?: string;
  email?: string;
  phone?: string;
  company?: string;
  role?: string;
  location?: string;
  source?: string;
  score?: number;
  industry?: string;
}

interface ContactCardProps {
  contact: Contact;
  onAction?: (action: "call" | "whatsapp" | "email" | "assign", contact: Contact) => void;
  showActions?: boolean;
  className?: string;
}

export function ContactCard({
  contact,
  onAction,
  showActions = true,
  className,
}: ContactCardProps) {
  const initials = contact.name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase();

  const statusVariant = {
    lead: "lead" as const,
    qualified: "success" as const,
    customer: "active" as const,
    churned: "error" as const,
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={className}
    >
      <Card className="border-0 flyn-card">
        <CardContent className="p-6">
          {/* Header */}
          <div className="flex items-start gap-4 mb-4">
            <Avatar className="h-16 w-16">
              <AvatarImage src={contact.avatar} alt={contact.name} />
              <AvatarFallback className="bg-primary/10 text-primary text-lg">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <h3 className="text-xl font-semibold">{contact.name}</h3>
                <Badge variant={statusVariant[contact.status]}>
                  {contact.status.charAt(0).toUpperCase() + contact.status.slice(1)}
                </Badge>
              </div>
              {contact.subtitle && (
                <p className="text-muted-foreground mt-0.5">{contact.subtitle}</p>
              )}
            </div>
          </div>

          {/* Action buttons */}
          {showActions && (
            <div className="flex flex-wrap gap-2 mb-5">
              <Button
                size="sm"
                className="flyn-button-gradient"
                onClick={() => onAction?.("call", contact)}
              >
                <Phone className="h-4 w-4 mr-2" />
                Call Agent
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => onAction?.("whatsapp", contact)}
              >
                <MessageSquare className="h-4 w-4 mr-2" />
                WhatsApp
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => onAction?.("email", contact)}
              >
                <Mail className="h-4 w-4 mr-2" />
                Email
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onAction?.("assign", contact)}
              >
                <UserPlus className="h-4 w-4 mr-2" />
                Assign Agent
              </Button>
            </div>
          )}

          {/* Contact info */}
          <div className="space-y-2.5">
            <h4 className="font-semibold text-sm">Contact Info</h4>
            {contact.email && (
              <div className="flex items-center gap-3 text-sm">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <span>{contact.email}</span>
              </div>
            )}
            {contact.phone && (
              <div className="flex items-center gap-3 text-sm">
                <Phone className="h-4 w-4 text-muted-foreground" />
                <span>{contact.phone}</span>
              </div>
            )}
            {contact.company && (
              <div className="flex items-center gap-3 text-sm">
                <Building2 className="h-4 w-4 text-muted-foreground" />
                <span>{contact.company}</span>
              </div>
            )}
            {contact.role && (
              <div className="flex items-center gap-3 text-sm">
                <Briefcase className="h-4 w-4 text-muted-foreground" />
                <span>{contact.role}</span>
              </div>
            )}
            {contact.location && (
              <div className="flex items-center gap-3 text-sm">
                <MapPin className="h-4 w-4 text-muted-foreground" />
                <span>{contact.location}</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

interface ContactInfoPanelProps {
  contact: Contact;
  className?: string;
}

export function ContactInfoPanel({ contact, className }: ContactInfoPanelProps) {
  return (
    <div className={cn("space-y-4", className)}>
      {/* AI Insight */}
      <Card className="border-0 bg-gradient-to-br from-primary/5 to-accent/5">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-1.5 rounded-lg bg-primary/10">
              <span className="text-primary">✨</span>
            </div>
            <h4 className="font-semibold text-sm">AI Insight</h4>
          </div>
          <p className="text-sm text-muted-foreground">
            Based on recent interactions, the lead is likely ready to engage further.
          </p>
        </CardContent>
      </Card>

      {/* About */}
      <Card className="border-0 flyn-card">
        <CardContent className="p-4">
          <h4 className="font-semibold text-sm mb-3">About</h4>
          <div className="space-y-2 text-sm">
            {contact.source && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Source</span>
                <span className="font-medium">{contact.source}</span>
              </div>
            )}
            {contact.score !== undefined && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Lead Score</span>
                <span className="font-medium">{contact.score}</span>
              </div>
            )}
            {contact.industry && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Industry</span>
                <span className="font-medium">{contact.industry}</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
