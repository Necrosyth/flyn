import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, User, BookOpen, Users, Calendar, BarChart3 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

export interface CoachData {
  id: string;
  name: string;
  activePrograms: number;
  successProbability: string;
  nextSession: string;
  healthStatus: "green" | "amber" | "red";
  email?: string;
  phone?: string;
  clients?: Array<{
    id: string;
    name: string;
    program: string;
    progress: number;
    healthStatus: "green" | "amber" | "red";
  }>;
  programs?: Array<{
    id: string;
    name: string;
    enrolled: number;
    completionRate: number;
  }>;
  sessions?: Array<{
    id: string;
    clientName: string;
    date: string;
    status: "scheduled" | "completed" | "cancelled";
  }>;
}

interface CoachProfileTabsProps {
  coach: CoachData;
  onClose: () => void;
  className?: string;
}

/**
 * CoachProfileTabs - Tabbed interface for coach details
 * Tabs: Overview | Programs | Clients | Sessions | Analytics
 */
export function CoachProfileTabs({ coach, onClose, className }: CoachProfileTabsProps) {
  const [activeTab, setActiveTab] = useState("overview");

  const healthColors = {
    green: "bg-status-active text-white",
    amber: "bg-status-pending text-white",
    red: "bg-destructive text-white",
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      className={cn("w-full", className)}
    >
      <Card className="border-0 flyn-card overflow-hidden">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-gradient-to-br from-primary to-flyn-cyan">
                <User className="h-5 w-5 text-white" />
              </div>
              <div>
                <CardTitle className="font-display flex items-center gap-2">
                  {coach.name}
                  <Badge className={cn("text-xs", healthColors[coach.healthStatus])}>
                    {coach.healthStatus === "green" ? "Healthy" : coach.healthStatus === "amber" ? "Attention" : "At Risk"}
                  </Badge>
                </CardTitle>
                <p className="text-sm text-muted-foreground">{coach.activePrograms} active programs</p>
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>

        <CardContent>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="w-full grid grid-cols-5 mb-4">
              <TabsTrigger value="overview" className="text-xs">
                <User className="h-3.5 w-3.5 mr-1.5" />
                Overview
              </TabsTrigger>
              <TabsTrigger value="programs" className="text-xs">
                <BookOpen className="h-3.5 w-3.5 mr-1.5" />
                Programs
              </TabsTrigger>
              <TabsTrigger value="clients" className="text-xs">
                <Users className="h-3.5 w-3.5 mr-1.5" />
                Clients
              </TabsTrigger>
              <TabsTrigger value="sessions" className="text-xs">
                <Calendar className="h-3.5 w-3.5 mr-1.5" />
                Sessions
              </TabsTrigger>
              <TabsTrigger value="analytics" className="text-xs">
                <BarChart3 className="h-3.5 w-3.5 mr-1.5" />
                Analytics
              </TabsTrigger>
            </TabsList>

            <AnimatePresence mode="wait">
              <TabsContent value="overview" className="mt-0">
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="grid grid-cols-2 gap-4"
                >
                  <div className="p-4 rounded-lg bg-muted/50">
                    <p className="text-sm text-muted-foreground">Success Probability</p>
                    <p className="text-2xl font-bold font-display">{coach.successProbability}</p>
                  </div>
                  <div className="p-4 rounded-lg bg-muted/50">
                    <p className="text-sm text-muted-foreground">Next Session</p>
                    <p className="text-lg font-medium">{coach.nextSession}</p>
                  </div>
                  <div className="p-4 rounded-lg bg-muted/50 col-span-2">
                    <p className="text-sm text-muted-foreground">Contact</p>
                    <p className="text-sm">{coach.email || "coach@example.com"}</p>
                    <p className="text-sm">{coach.phone || "+1 (555) 123-4567"}</p>
                  </div>
                </motion.div>
              </TabsContent>

              <TabsContent value="programs" className="mt-0">
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-2">
                  {(coach.programs || []).map((program) => (
                    <div key={program.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                      <div>
                        <p className="font-medium">{program.name}</p>
                        <p className="text-xs text-muted-foreground">{program.enrolled} enrolled</p>
                      </div>
                      <Badge variant="secondary">{program.completionRate}% completion</Badge>
                    </div>
                  ))}
                </motion.div>
              </TabsContent>

              <TabsContent value="clients" className="mt-0">
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-2">
                  {(coach.clients || []).map((client) => (
                    <div key={client.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                      <div className="flex items-center gap-2">
                        <div className={cn("w-2 h-2 rounded-full", 
                          client.healthStatus === "green" ? "bg-status-active" : 
                          client.healthStatus === "amber" ? "bg-status-pending" : "bg-destructive"
                        )} />
                        <div>
                          <p className="font-medium">{client.name}</p>
                          <p className="text-xs text-muted-foreground">{client.program}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-medium">{client.progress}%</p>
                        <p className="text-xs text-muted-foreground">progress</p>
                      </div>
                    </div>
                  ))}
                </motion.div>
              </TabsContent>

              <TabsContent value="sessions" className="mt-0">
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-2">
                  {(coach.sessions || []).map((session) => (
                    <div key={session.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                      <div>
                        <p className="font-medium">{session.clientName}</p>
                        <p className="text-xs text-muted-foreground">{session.date}</p>
                      </div>
                      <Badge variant={session.status === "completed" ? "secondary" : session.status === "scheduled" ? "default" : "destructive"}>
                        {session.status}
                      </Badge>
                    </div>
                  ))}
                </motion.div>
              </TabsContent>

              <TabsContent value="analytics" className="mt-0">
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="grid grid-cols-2 gap-4">
                  <div className="p-4 rounded-lg bg-muted/50">
                    <p className="text-sm text-muted-foreground">Sessions This Month</p>
                    <p className="text-2xl font-bold font-display">-</p>
                  </div>
                  <div className="p-4 rounded-lg bg-muted/50">
                    <p className="text-sm text-muted-foreground">Revenue Generated</p>
                    <p className="text-2xl font-bold font-display">-</p>
                  </div>
                  <div className="p-4 rounded-lg bg-muted/50">
                    <p className="text-sm text-muted-foreground">Client Retention</p>
                    <p className="text-2xl font-bold font-display">-</p>
                  </div>
                  <div className="p-4 rounded-lg bg-muted/50">
                    <p className="text-sm text-muted-foreground">Avg. Rating</p>
                    <p className="text-2xl font-bold font-display">-</p>
                  </div>
                </motion.div>
              </TabsContent>
            </AnimatePresence>
          </Tabs>
        </CardContent>
      </Card>
    </motion.div>
  );
}
