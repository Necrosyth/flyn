import { useState } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useMarketingDashboard, Lead } from "@/contexts/MarketingDashboardContext";
import {
  Users,
  Plus,
  Search,
  Filter,
  MoreVertical,
  Mail,
  Phone,
  MessageSquare,
  Trash2,
  Edit,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const statusColors: Record<Lead["status"], string> = {
  new: "bg-blue-500/10 text-blue-600 border-blue-500/20",
  contacted: "bg-purple-500/10 text-purple-600 border-purple-500/20",
  qualified: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  trial: "bg-cyan-500/10 text-cyan-600 border-cyan-500/20",
  activated: "bg-green-500/10 text-green-600 border-green-500/20",
  paid: "bg-primary/10 text-primary border-primary/20",
  lost: "bg-destructive/10 text-destructive border-destructive/20",
};

const sourceIcons: Record<Lead["source"], React.ElementType> = {
  whatsapp: MessageSquare,
  email: Mail,
  webchat: MessageSquare,
  forms: Users,
  api: Users,
  referral: Users,
};

export function LeadManagement() {
  const { leads, addLead, updateLead, deleteLead, teamMembers } = useMarketingDashboard();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [newLead, setNewLead] = useState({
    name: "",
    email: "",
    phone: "",
    company: "",
    source: "email" as Lead["source"],
    status: "new" as Lead["status"],
    score: 50,
  });

  const filteredLeads = leads.filter(lead => {
    const matchesSearch = lead.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          lead.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          lead.company?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === "all" || lead.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const handleAddLead = () => {
    addLead(newLead);
    setIsAddDialogOpen(false);
    setNewLead({ name: "", email: "", phone: "", company: "", source: "email", status: "new", score: 50 });
  };

  const getAssigneeName = (assignedTo?: string) => {
    if (!assignedTo) return "Unassigned";
    const member = teamMembers.find(m => m.id === assignedTo);
    return member?.name || "Unknown";
  };

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Users className="w-5 h-5 text-primary" />
                Lead Management
              </CardTitle>
              <CardDescription>Manage and track all your leads in one place</CardDescription>
            </div>
            <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
              <DialogTrigger asChild>
                <Button className="flyn-button-gradient">
                  <Plus className="w-4 h-4 mr-2" />
                  Add Lead
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add New Lead</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 mt-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Name</Label>
                      <Input
                        value={newLead.name}
                        onChange={(e) => setNewLead(prev => ({ ...prev, name: e.target.value }))}
                        placeholder="John Smith"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Email</Label>
                      <Input
                        type="email"
                        value={newLead.email}
                        onChange={(e) => setNewLead(prev => ({ ...prev, email: e.target.value }))}
                        placeholder="john@example.com"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Phone</Label>
                      <Input
                        value={newLead.phone}
                        onChange={(e) => setNewLead(prev => ({ ...prev, phone: e.target.value }))}
                        placeholder="+1 555 123 4567"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Company</Label>
                      <Input
                        value={newLead.company}
                        onChange={(e) => setNewLead(prev => ({ ...prev, company: e.target.value }))}
                        placeholder="Acme Corp"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Source</Label>
                      <Select value={newLead.source} onValueChange={(v: Lead["source"]) => setNewLead(prev => ({ ...prev, source: v }))}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="email">Email</SelectItem>
                          <SelectItem value="whatsapp">WhatsApp</SelectItem>
                          <SelectItem value="webchat">Webchat</SelectItem>
                          <SelectItem value="forms">Forms</SelectItem>
                          <SelectItem value="api">API</SelectItem>
                          <SelectItem value="referral">Referral</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Lead Score</Label>
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        value={newLead.score}
                        onChange={(e) => setNewLead(prev => ({ ...prev, score: parseInt(e.target.value) || 0 }))}
                      />
                    </div>
                  </div>
                  <Button onClick={handleAddLead} className="w-full flyn-button-gradient">
                    Add Lead
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search leads..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[160px]">
                <Filter className="w-4 h-4 mr-2" />
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="new">New</SelectItem>
                <SelectItem value="contacted">Contacted</SelectItem>
                <SelectItem value="qualified">Qualified</SelectItem>
                <SelectItem value="trial">Trial</SelectItem>
                <SelectItem value="activated">Activated</SelectItem>
                <SelectItem value="paid">Paid</SelectItem>
                <SelectItem value="lost">Lost</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Leads Table */}
          <div className="rounded-lg border border-border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-muted/50">
                    <th className="text-left text-xs font-medium text-muted-foreground uppercase p-3">Lead</th>
                    <th className="text-left text-xs font-medium text-muted-foreground uppercase p-3">Source</th>
                    <th className="text-left text-xs font-medium text-muted-foreground uppercase p-3">Status</th>
                    <th className="text-left text-xs font-medium text-muted-foreground uppercase p-3">Score</th>
                    <th className="text-left text-xs font-medium text-muted-foreground uppercase p-3">Assigned</th>
                    <th className="text-left text-xs font-medium text-muted-foreground uppercase p-3">Last Activity</th>
                    <th className="text-right text-xs font-medium text-muted-foreground uppercase p-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLeads.map((lead) => {
                    const SourceIcon = sourceIcons[lead.source];
                    return (
                      <tr key={lead.id} className="border-t border-border hover:bg-muted/30 transition-colors">
                        <td className="p-3">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-sm font-medium">
                              {lead.name.charAt(0)}
                            </div>
                            <div>
                              <p className="font-medium text-sm">{lead.name}</p>
                              <p className="text-xs text-muted-foreground">{lead.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="p-3">
                          <div className="flex items-center gap-2">
                            <SourceIcon className="w-4 h-4 text-muted-foreground" />
                            <span className="text-sm capitalize">{lead.source}</span>
                          </div>
                        </td>
                        <td className="p-3">
                          <Select
                            value={lead.status}
                            onValueChange={(v: Lead["status"]) => updateLead(lead.id, { status: v })}
                          >
                            <SelectTrigger className="h-7 w-28 border-0 bg-transparent p-0">
                              <Badge variant="outline" className={`${statusColors[lead.status]} capitalize`}>
                                {lead.status}
                              </Badge>
                            </SelectTrigger>
                            <SelectContent>
                              {Object.keys(statusColors).map((status) => (
                                <SelectItem key={status} value={status}>
                                  <span className="capitalize">{status}</span>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="p-3">
                          <div className="flex items-center gap-2">
                            <div className={`w-2 h-2 rounded-full ${
                              lead.score >= 70 ? "bg-green-500" :
                              lead.score >= 40 ? "bg-amber-500" : "bg-destructive"
                            }`} />
                            <span className="text-sm font-medium">{lead.score}</span>
                          </div>
                        </td>
                        <td className="p-3">
                          <span className="text-sm">{getAssigneeName(lead.assignedTo)}</span>
                        </td>
                        <td className="p-3">
                          <span className="text-sm text-muted-foreground">
                            {new Date(lead.lastActivity).toLocaleDateString()}
                          </span>
                        </td>
                        <td className="p-3 text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <MoreVertical className="w-4 h-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem>
                                <Mail className="w-4 h-4 mr-2" />
                                Send Email
                              </DropdownMenuItem>
                              <DropdownMenuItem>
                                <Phone className="w-4 h-4 mr-2" />
                                Call
                              </DropdownMenuItem>
                              <DropdownMenuItem>
                                <MessageSquare className="w-4 h-4 mr-2" />
                                WhatsApp
                              </DropdownMenuItem>
                              <DropdownMenuItem>
                                <Edit className="w-4 h-4 mr-2" />
                                Edit
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className="text-destructive"
                                onClick={() => deleteLead(lead.id)}
                              >
                                <Trash2 className="w-4 h-4 mr-2" />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {filteredLeads.length === 0 && (
            <div className="text-center py-12">
              <Users className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground">No leads found</p>
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
