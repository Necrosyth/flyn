import { useState, useEffect, useCallback, useRef } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useLandingContent } from "@/contexts/LandingContentContext";
import {
  Save, Loader2, Mail, Phone, MapPin, Twitter, Linkedin, Instagram, Facebook, Youtube,
  Plus, Trash2, Edit2, X, Check, Building2, Users, Globe, Clock, RefreshCw,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import {
  getLocations, getAgents,
  adminCreateLocation, adminUpdateLocation, adminDeleteLocation,
  adminCreateAgent, adminUpdateAgent, adminDeleteAgent,
  type ContactLocation, type LiveAgent,
} from "@/services/contactApi";

// ── Location form defaults ─────────────────────────────────────────────────────

const BLANK_LOC: Omit<ContactLocation, 'id'> = {
  city: "", country: "", country_code: "", address: "", postal_code: "",
  phone: "", email: "", timezone: "", department: "general",
  hours: { monday_friday: "9am–6pm", saturday: "Closed", sunday: "Closed" },
  agent_count: 1, agent_available: true, languages: ["English"],
};

const BLANK_AGENT: Omit<LiveAgent, 'id'> = {
  name: "", department: "general", location: "", status: "online",
  current_chats: 0, max_chats: 5, languages: ["English"],
  average_response_time: 60, customer_rating: 4.8, is_available: true,
};

// ── Google Places address autocomplete ────────────────────────────────────────

interface PlaceFields {
  address: string;
  city: string;
  country: string;
  country_code: string;
  postal_code: string;
  timezone: string;
  coordinates?: { lat: number; lng: number };
}

function PlacesAddressInput({
  value, onChange, onPlaceSelect, className,
}: {
  value: string;
  onChange: (val: string) => void;
  onPlaceSelect: (fields: PlaceFields) => void;
  className?: string;
}) {
  const [suggestions, setSuggestions] = useState<{ description: string; placeId: string }[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const acRef = useRef<any>(null);
  const detailsRef = useRef<any>(null);
  const MAPS_KEY = (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined)?.trim();

  useEffect(() => {
    if (!MAPS_KEY) return;
    const init = () => {
      acRef.current = new (window as any).google.maps.places.AutocompleteService();
      detailsRef.current = new (window as any).google.maps.places.PlacesService(document.createElement('div'));
    };
    if ((window as any).google?.maps?.places) { init(); return; }
    if (document.querySelector('script[data-gm-places]')) {
      const iv = setInterval(() => {
        if ((window as any).google?.maps?.places) { init(); clearInterval(iv); }
      }, 100);
      return () => clearInterval(iv);
    }
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${MAPS_KEY}&libraries=places`;
    script.async = true;
    script.dataset.gmPlaces = '1';
    script.onload = init;
    document.head.appendChild(script);
  }, [MAPS_KEY]);

  const getSuggestions = useCallback((input: string) => {
    if (!acRef.current || input.length < 2) { setSuggestions([]); return; }
    acRef.current.getPlacePredictions({ input }, (predictions: any[], status: string) => {
      if (status === 'OK' && predictions) {
        setSuggestions(predictions.slice(0, 5).map((p: any) => ({ description: p.description, placeId: p.place_id })));
      } else {
        setSuggestions([]);
      }
    });
  }, []);

  const handleSelect = useCallback((s: { description: string; placeId: string }) => {
    setSuggestions([]);
    setShowSuggestions(false);
    onChange(s.description);
    if (!detailsRef.current) {
      onPlaceSelect({ address: s.description, city: '', country: '', country_code: '', postal_code: '', timezone: '' });
      return;
    }
    detailsRef.current.getDetails(
      { placeId: s.placeId, fields: ['address_components', 'formatted_address', 'geometry'] },
      async (place: any, status: string) => {
        if (status !== 'OK' || !place) {
          onPlaceSelect({ address: s.description, city: '', country: '', country_code: '', postal_code: '', timezone: '' });
          return;
        }
        let city = '', country = '', country_code = '', postal_code = '';
        for (const c of place.address_components ?? []) {
          if (c.types.includes('locality')) city = c.long_name;
          else if (c.types.includes('administrative_area_level_1') && !city) city = c.long_name;
          if (c.types.includes('country')) { country = c.long_name; country_code = c.short_name; }
          if (c.types.includes('postal_code')) postal_code = c.long_name;
        }
        const lat: number | undefined = place.geometry?.location?.lat();
        const lng: number | undefined = place.geometry?.location?.lng();
        let timezone = '';
        if (lat != null && lng != null && MAPS_KEY) {
          try {
            const ts = Math.floor(Date.now() / 1000);
            const tzRes = await fetch(`https://maps.googleapis.com/maps/api/timezone/json?location=${lat},${lng}&timestamp=${ts}&key=${MAPS_KEY}`);
            const tzJson = await tzRes.json();
            if (tzJson.status === 'OK') timezone = tzJson.timeZoneId;
          } catch { /* ignore */ }
        }
        onPlaceSelect({
          address: place.formatted_address ?? s.description,
          city, country, country_code, postal_code, timezone,
          ...(lat != null ? { coordinates: { lat, lng: lng! } } : {}),
        });
        onChange(place.formatted_address ?? s.description);
      },
    );
  }, [onChange, onPlaceSelect, MAPS_KEY]);

  if (!MAPS_KEY) {
    return <Input value={value} onChange={e => onChange(e.target.value)} className={className} />;
  }

  return (
    <div className="relative">
      <Input
        value={value}
        onChange={e => { onChange(e.target.value); getSuggestions(e.target.value); setShowSuggestions(true); }}
        onFocus={() => { if (suggestions.length) setShowSuggestions(true); }}
        onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
        className={className}
      />
      {showSuggestions && suggestions.length > 0 && (
        <div className="absolute z-50 w-full top-full mt-1 rounded-md border border-border bg-background shadow-lg overflow-hidden">
          {suggestions.map(sug => (
            <button
              key={sug.placeId}
              type="button"
              className="w-full text-left px-3 py-2 text-sm hover:bg-secondary transition-colors flex items-center gap-2"
              onMouseDown={() => handleSelect(sug)}
            >
              <MapPin className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              {sug.description}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Small edit-in-place row ────────────────────────────────────────────────────

function LocRow({ loc, onSave, onDelete }: {
  loc: ContactLocation;
  onSave: (id: string, data: Partial<ContactLocation>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<ContactLocation>(loc);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try { await onSave(loc.id, draft); setEditing(false); }
    finally { setSaving(false); }
  };

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-3">
      {editing ? (
        <>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1"><Label className="text-xs">City</Label><Input value={draft.city} onChange={e => setDraft(d => ({ ...d, city: e.target.value }))} className="h-8 text-sm" /></div>
            <div className="space-y-1"><Label className="text-xs">Country</Label><Input value={draft.country} onChange={e => setDraft(d => ({ ...d, country: e.target.value }))} className="h-8 text-sm" /></div>
            <div className="space-y-1"><Label className="text-xs">Country Code</Label><Input value={draft.country_code} placeholder="US" onChange={e => setDraft(d => ({ ...d, country_code: e.target.value.toUpperCase() }))} className="h-8 text-sm" /></div>
            <div className="space-y-1"><Label className="text-xs">Department</Label><Input value={draft.department} onChange={e => setDraft(d => ({ ...d, department: e.target.value }))} className="h-8 text-sm" /></div>
            <div className="space-y-1 col-span-2">
              <Label className="text-xs">Address</Label>
              <PlacesAddressInput
                value={draft.address}
                onChange={v => setDraft(d => ({ ...d, address: v }))}
                onPlaceSelect={f => setDraft(d => ({
                  ...d,
                  address: f.address,
                  ...(f.city ? { city: f.city } : {}),
                  ...(f.country ? { country: f.country } : {}),
                  ...(f.country_code ? { country_code: f.country_code } : {}),
                  ...(f.postal_code ? { postal_code: f.postal_code } : {}),
                  ...(f.timezone ? { timezone: f.timezone } : {}),
                  ...(f.coordinates ? { coordinates: f.coordinates } : {}),
                }))}
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1"><Label className="text-xs">Phone</Label><Input value={draft.phone} onChange={e => setDraft(d => ({ ...d, phone: e.target.value }))} className="h-8 text-sm" /></div>
            <div className="space-y-1"><Label className="text-xs">Email</Label><Input value={draft.email} onChange={e => setDraft(d => ({ ...d, email: e.target.value }))} className="h-8 text-sm" /></div>
            <div className="space-y-1"><Label className="text-xs">Timezone</Label><Input value={draft.timezone} placeholder="America/New_York" onChange={e => setDraft(d => ({ ...d, timezone: e.target.value }))} className="h-8 text-sm" /></div>
            <div className="space-y-1"><Label className="text-xs">Hours (Mon–Fri)</Label><Input value={draft.hours.monday_friday} onChange={e => setDraft(d => ({ ...d, hours: { ...d.hours, monday_friday: e.target.value } }))} className="h-8 text-sm" /></div>
            <div className="space-y-1"><Label className="text-xs">Languages (comma-sep)</Label><Input value={draft.languages.join(", ")} onChange={e => setDraft(d => ({ ...d, languages: e.target.value.split(",").map(l => l.trim()).filter(Boolean) }))} className="h-8 text-sm" /></div>
            <div className="space-y-1"><Label className="text-xs">Agent Count</Label><Input type="number" value={draft.agent_count} onChange={e => setDraft(d => ({ ...d, agent_count: Number(e.target.value) }))} className="h-8 text-sm" /></div>
          </div>
          <div className="flex items-center gap-2 pt-1">
            <Button size="sm" className="h-7 text-xs flyn-button-gradient gap-1" onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />} Save
            </Button>
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { setDraft(loc); setEditing(false); }}>
              <X className="w-3 h-3 mr-1" /> Cancel
            </Button>
          </div>
        </>
      ) : (
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <Building2 className="w-4 h-4 text-primary" />
            </div>
            <div>
              <p className="font-medium text-sm text-foreground">{loc.city}, {loc.country}</p>
              <p className="text-xs text-muted-foreground">{loc.department} · {loc.address}</p>
              <div className="flex gap-1.5 mt-1">
                {loc.languages.slice(0, 3).map(l => (
                  <span key={l} className="text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded-full">{l}</span>
                ))}
              </div>
            </div>
          </div>
          <div className="flex gap-1 shrink-0">
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditing(true)}><Edit2 className="w-3.5 h-3.5" /></Button>
            <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => onDelete(loc.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
          </div>
        </div>
      )}
    </div>
  );
}

function AgentRow({ agent, onSave, onDelete }: {
  agent: LiveAgent;
  onSave: (id: string, data: Partial<LiveAgent>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<LiveAgent>(agent);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try { await onSave(agent.id, draft); setEditing(false); }
    finally { setSaving(false); }
  };

  const STATUS_COLORS: Record<string, string> = {
    online: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30",
    away: "bg-amber-500/15 text-amber-500 border-amber-500/30",
    busy: "bg-red-500/15 text-red-500 border-red-500/30",
    offline: "bg-zinc-500/15 text-zinc-500 border-zinc-500/30",
  };

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-3">
      {editing ? (
        <>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1"><Label className="text-xs">Name</Label><Input value={draft.name} onChange={e => setDraft(d => ({ ...d, name: e.target.value }))} className="h-8 text-sm" /></div>
            <div className="space-y-1"><Label className="text-xs">Department</Label><Input value={draft.department} onChange={e => setDraft(d => ({ ...d, department: e.target.value }))} className="h-8 text-sm" /></div>
            <div className="space-y-1"><Label className="text-xs">Location</Label><Input value={draft.location} onChange={e => setDraft(d => ({ ...d, location: e.target.value }))} className="h-8 text-sm" /></div>
            <div className="space-y-1"><Label className="text-xs">Status</Label>
              <select value={draft.status} onChange={e => setDraft(d => ({ ...d, status: e.target.value as LiveAgent['status'] }))}
                className="w-full h-8 text-sm border border-input rounded-md bg-background px-2">
                <option value="online">Online</option>
                <option value="away">Away</option>
                <option value="busy">Busy</option>
                <option value="offline">Offline</option>
              </select>
            </div>
            <div className="space-y-1"><Label className="text-xs">Max Chats</Label><Input type="number" value={draft.max_chats} onChange={e => setDraft(d => ({ ...d, max_chats: Number(e.target.value) }))} className="h-8 text-sm" /></div>
            <div className="space-y-1"><Label className="text-xs">Rating (0–5)</Label><Input type="number" step="0.1" min="0" max="5" value={draft.customer_rating} onChange={e => setDraft(d => ({ ...d, customer_rating: Number(e.target.value) }))} className="h-8 text-sm" /></div>
            <div className="space-y-1 col-span-2"><Label className="text-xs">Languages (comma-sep)</Label><Input value={draft.languages.join(", ")} onChange={e => setDraft(d => ({ ...d, languages: e.target.value.split(",").map(l => l.trim()).filter(Boolean) }))} className="h-8 text-sm" /></div>
          </div>
          <div className="flex items-center gap-2 pt-1">
            <Button size="sm" className="h-7 text-xs flyn-button-gradient gap-1" onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />} Save
            </Button>
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { setDraft(agent); setEditing(false); }}>
              <X className="w-3 h-3 mr-1" /> Cancel
            </Button>
          </div>
        </>
      ) : (
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-violet-500/20 flex items-center justify-center shrink-0 text-violet-500 font-bold text-sm">
              {agent.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <p className="font-medium text-sm text-foreground">{agent.name}</p>
                <Badge className={`text-[10px] px-1.5 py-0 ${STATUS_COLORS[agent.status] ?? STATUS_COLORS.offline}`}>{agent.status}</Badge>
              </div>
              <p className="text-xs text-muted-foreground">{agent.department} · {agent.location}</p>
            </div>
          </div>
          <div className="flex gap-1 shrink-0">
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditing(true)}><Edit2 className="w-3.5 h-3.5" /></Button>
            <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => onDelete(agent.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main editor ────────────────────────────────────────────────────────────────

export function ContactEditor() {
  const { content, patchContent, isSaving } = useLandingContent();
  const [contact, setContact] = useState(content.contact);
  const [social, setSocial] = useState(content.social);
  const [footer, setFooter] = useState(content.footer);
  const [hasChanges, setHasChanges] = useState(false);

  // Locations state
  const [locations, setLocations] = useState<ContactLocation[]>([]);
  const [locLoading, setLocLoading] = useState(false);
  const [addingLoc, setAddingLoc] = useState(false);
  const [newLoc, setNewLoc] = useState<Omit<ContactLocation, 'id'>>(BLANK_LOC);

  // Agents state
  const [agents, setAgents] = useState<LiveAgent[]>([]);
  const [agentLoading, setAgentLoading] = useState(false);
  const [addingAgent, setAddingAgent] = useState(false);
  const [newAgent, setNewAgent] = useState<Omit<LiveAgent, 'id'>>(BLANK_AGENT);

  useEffect(() => {
    setContact(content.contact);
    setSocial(content.social);
    setFooter(content.footer);
  }, [content]);

  const loadLocations = useCallback(async () => {
    setLocLoading(true);
    try { setLocations(await getLocations()); } catch { /* keep empty */ }
    finally { setLocLoading(false); }
  }, []);

  const loadAgents = useCallback(async () => {
    setAgentLoading(true);
    try { setAgents(await getAgents()); } catch { /* keep empty */ }
    finally { setAgentLoading(false); }
  }, []);

  useEffect(() => { loadLocations(); loadAgents(); }, [loadLocations, loadAgents]);

  const handleContactChange = (field: string, value: string) => {
    setContact((prev) => ({ ...prev, [field]: value }));
    setHasChanges(true);
  };

  const handleSocialChange = (field: string, value: string) => {
    setSocial((prev) => ({ ...prev, [field]: value }));
    setHasChanges(true);
  };

  const handleFooterChange = (field: string, value: string) => {
    setFooter((prev) => ({ ...prev, [field]: value }));
    setHasChanges(true);
  };

  const handleSave = async () => {
    await patchContent((current) => ({
      ...current,
      contact: { ...current.contact, ...contact },
      social: { ...current.social, ...social },
      footer: { ...current.footer, ...footer },
    }));
    setHasChanges(false);
    toast({ title: "Settings updated", description: "Contact & social information saved." });
  };

  // Location handlers
  const handleSaveLoc = async (id: string, data: Partial<ContactLocation>) => {
    try {
      await adminUpdateLocation(id, data);
      setLocations(prev => prev.map(l => l.id === id ? { ...l, ...data } : l));
      toast({ title: "Location updated" });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Failed to update location", description: err?.message });
    }
  };

  const handleDeleteLoc = async (id: string) => {
    try {
      await adminDeleteLocation(id);
      setLocations(prev => prev.filter(l => l.id !== id));
      toast({ title: "Location removed" });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Failed to delete location", description: err?.message });
    }
  };

  const handleCreateLoc = async () => {
    if (!newLoc.city || !newLoc.country) {
      toast({ variant: "destructive", title: "City and Country are required" });
      return;
    }
    try {
      const created = await adminCreateLocation(newLoc);
      setLocations(prev => [...prev, created]);
      setNewLoc(BLANK_LOC);
      setAddingLoc(false);
      toast({ title: "Location added" });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Failed to add location", description: err?.message });
    }
  };

  // Agent handlers
  const handleSaveAgent = async (id: string, data: Partial<LiveAgent>) => {
    try {
      await adminUpdateAgent(id, data);
      setAgents(prev => prev.map(a => a.id === id ? { ...a, ...data } : a));
      toast({ title: "Agent updated" });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Failed to update agent", description: err?.message });
    }
  };

  const handleDeleteAgent = async (id: string) => {
    try {
      await adminDeleteAgent(id);
      setAgents(prev => prev.filter(a => a.id !== id));
      toast({ title: "Agent removed" });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Failed to delete agent", description: err?.message });
    }
  };

  const handleCreateAgent = async () => {
    if (!newAgent.name || !newAgent.department) {
      toast({ variant: "destructive", title: "Name and Department are required" });
      return;
    }
    try {
      const created = await adminCreateAgent(newAgent);
      setAgents(prev => [...prev, created]);
      setNewAgent(BLANK_AGENT);
      setAddingAgent(false);
      toast({ title: "Agent added" });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Failed to add agent", description: err?.message });
    }
  };

  const socialFields = [
    { key: "twitter", label: "Twitter / X", icon: Twitter, placeholder: "https://twitter.com/yourhandle" },
    { key: "linkedin", label: "LinkedIn", icon: Linkedin, placeholder: "https://linkedin.com/company/yourcompany" },
    { key: "instagram", label: "Instagram", icon: Instagram, placeholder: "https://instagram.com/yourhandle" },
    { key: "facebook", label: "Facebook", icon: Facebook, placeholder: "https://facebook.com/yourpage" },
    { key: "youtube", label: "YouTube", icon: Youtube, placeholder: "https://youtube.com/@yourchannel" },
  ];

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">

      {/* ── Contact Information ── */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Phone className="w-5 h-5 text-primary" />
                Contact Information
              </CardTitle>
              <CardDescription>Business contact details displayed on the site</CardDescription>
            </div>
            <Button onClick={handleSave} disabled={!hasChanges || isSaving} className="flyn-button-gradient">
              {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
              Save All Changes
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-2">
              <Label className="flex items-center gap-2"><Mail className="w-4 h-4 text-muted-foreground" />General Email</Label>
              <Input value={contact.email} onChange={(e) => handleContactChange("email", e.target.value)} placeholder="hello@example.com" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="supportEmail">Support Email</Label>
              <Input id="supportEmail" value={contact.supportEmail} onChange={(e) => handleContactChange("supportEmail", e.target.value)} placeholder="support@flyn.ai" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="brandEmail">Brand/Press Email</Label>
              <Input id="brandEmail" value={contact.brandEmail} onChange={(e) => handleContactChange("brandEmail", e.target.value)} placeholder="brand@flyn.ai" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="careersEmail">Careers Email</Label>
              <Input id="careersEmail" value={contact.careersEmail} onChange={(e) => handleContactChange("careersEmail", e.target.value)} placeholder="careers@flyn.ai" />
            </div>
            <div className="space-y-2">
              <Label className="flex items-center gap-2"><Mail className="w-4 h-4 text-muted-foreground" />Sales Email</Label>
              <Input value={contact.salesEmail} onChange={(e) => handleContactChange("salesEmail", e.target.value)} placeholder="sales@example.com" />
            </div>
            <div className="space-y-2">
              <Label className="flex items-center gap-2"><Phone className="w-4 h-4 text-muted-foreground" />Phone Number</Label>
              <Input value={contact.phone} onChange={(e) => handleContactChange("phone", e.target.value)} placeholder="+1 (555) 123-4567" />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label className="flex items-center gap-2"><MapPin className="w-4 h-4 text-muted-foreground" />Business Address</Label>
              <Input value={contact.address} onChange={(e) => handleContactChange("address", e.target.value)} placeholder="123 Innovation Drive, San Francisco, CA" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Office Locations ── */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Globe className="w-5 h-5 text-primary" />
                Office Locations
              </CardTitle>
              <CardDescription>Manage the office cards shown on the Locations tab of the contact page</CardDescription>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={loadLocations} disabled={locLoading}>
                <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${locLoading ? "animate-spin" : ""}`} />
                Refresh
              </Button>
              <Button size="sm" className="flyn-button-gradient gap-1" onClick={() => setAddingLoc(true)} disabled={addingLoc}>
                <Plus className="w-3.5 h-3.5" /> Add Location
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {addingLoc && (
            <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 space-y-3">
              <p className="text-sm font-medium text-foreground">New Office Location</p>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1"><Label className="text-xs">City *</Label><Input value={newLoc.city} onChange={e => setNewLoc(d => ({ ...d, city: e.target.value }))} className="h-8 text-sm" /></div>
                <div className="space-y-1"><Label className="text-xs">Country *</Label><Input value={newLoc.country} onChange={e => setNewLoc(d => ({ ...d, country: e.target.value }))} className="h-8 text-sm" /></div>
                <div className="space-y-1"><Label className="text-xs">Country Code</Label><Input value={newLoc.country_code} placeholder="US" onChange={e => setNewLoc(d => ({ ...d, country_code: e.target.value.toUpperCase() }))} className="h-8 text-sm" /></div>
                <div className="space-y-1"><Label className="text-xs">Department</Label><Input value={newLoc.department} onChange={e => setNewLoc(d => ({ ...d, department: e.target.value }))} className="h-8 text-sm" /></div>
                <div className="space-y-1 col-span-2">
                  <Label className="text-xs">Address</Label>
                  <PlacesAddressInput
                    value={newLoc.address}
                    onChange={v => setNewLoc(d => ({ ...d, address: v }))}
                    onPlaceSelect={f => setNewLoc(d => ({
                      ...d,
                      address: f.address,
                      ...(f.city ? { city: f.city } : {}),
                      ...(f.country ? { country: f.country } : {}),
                      ...(f.country_code ? { country_code: f.country_code } : {}),
                      ...(f.postal_code ? { postal_code: f.postal_code } : {}),
                      ...(f.timezone ? { timezone: f.timezone } : {}),
                      ...(f.coordinates ? { coordinates: f.coordinates } : {}),
                    }))}
                    className="h-8 text-sm"
                  />
                </div>
                <div className="space-y-1"><Label className="text-xs">Phone</Label><Input value={newLoc.phone} onChange={e => setNewLoc(d => ({ ...d, phone: e.target.value }))} className="h-8 text-sm" /></div>
                <div className="space-y-1"><Label className="text-xs">Email</Label><Input value={newLoc.email} onChange={e => setNewLoc(d => ({ ...d, email: e.target.value }))} className="h-8 text-sm" /></div>
                <div className="space-y-1"><Label className="text-xs">Timezone</Label><Input value={newLoc.timezone} placeholder="America/New_York" onChange={e => setNewLoc(d => ({ ...d, timezone: e.target.value }))} className="h-8 text-sm" /></div>
                <div className="space-y-1"><Label className="text-xs">Hours (Mon–Fri)</Label><Input value={newLoc.hours.monday_friday} onChange={e => setNewLoc(d => ({ ...d, hours: { ...d.hours, monday_friday: e.target.value } }))} className="h-8 text-sm" /></div>
              </div>
              <div className="flex gap-2 pt-1">
                <Button size="sm" className="h-7 text-xs flyn-button-gradient gap-1" onClick={handleCreateLoc}><Check className="w-3 h-3" /> Add</Button>
                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { setAddingLoc(false); setNewLoc(BLANK_LOC); }}><X className="w-3 h-3 mr-1" /> Cancel</Button>
              </div>
            </div>
          )}

          {locLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[1, 2].map(i => <div key={i} className="h-20 rounded-xl border border-border bg-muted/30 animate-pulse" />)}
            </div>
          ) : locations.length === 0 ? (
            <div className="text-center py-10 text-sm text-muted-foreground">
              No locations yet. Click "Add Location" to create one, or the data hasn't been seeded.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {locations.map(loc => (
                <LocRow key={loc.id} loc={loc} onSave={handleSaveLoc} onDelete={handleDeleteLoc} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Live Agents ── */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Users className="w-5 h-5 text-primary" />
                Live Agents
              </CardTitle>
              <CardDescription>Manage the support agents shown on the Live Chat tab of the contact page</CardDescription>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={loadAgents} disabled={agentLoading}>
                <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${agentLoading ? "animate-spin" : ""}`} />
                Refresh
              </Button>
              <Button size="sm" className="flyn-button-gradient gap-1" onClick={() => setAddingAgent(true)} disabled={addingAgent}>
                <Plus className="w-3.5 h-3.5" /> Add Agent
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {addingAgent && (
            <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 space-y-3">
              <p className="text-sm font-medium text-foreground">New Agent</p>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1"><Label className="text-xs">Name *</Label><Input value={newAgent.name} onChange={e => setNewAgent(d => ({ ...d, name: e.target.value }))} className="h-8 text-sm" /></div>
                <div className="space-y-1"><Label className="text-xs">Department *</Label><Input value={newAgent.department} onChange={e => setNewAgent(d => ({ ...d, department: e.target.value }))} className="h-8 text-sm" /></div>
                <div className="space-y-1"><Label className="text-xs">Location</Label><Input value={newAgent.location} placeholder="New York, US" onChange={e => setNewAgent(d => ({ ...d, location: e.target.value }))} className="h-8 text-sm" /></div>
                <div className="space-y-1"><Label className="text-xs">Status</Label>
                  <select value={newAgent.status} onChange={e => setNewAgent(d => ({ ...d, status: e.target.value as LiveAgent['status'] }))}
                    className="w-full h-8 text-sm border border-input rounded-md bg-background px-2">
                    <option value="online">Online</option>
                    <option value="away">Away</option>
                    <option value="busy">Busy</option>
                    <option value="offline">Offline</option>
                  </select>
                </div>
                <div className="space-y-1"><Label className="text-xs">Max Chats</Label><Input type="number" value={newAgent.max_chats} onChange={e => setNewAgent(d => ({ ...d, max_chats: Number(e.target.value) }))} className="h-8 text-sm" /></div>
                <div className="space-y-1"><Label className="text-xs">Languages (comma-sep)</Label><Input value={newAgent.languages.join(", ")} onChange={e => setNewAgent(d => ({ ...d, languages: e.target.value.split(",").map(l => l.trim()).filter(Boolean) }))} className="h-8 text-sm" /></div>
              </div>
              <div className="flex gap-2 pt-1">
                <Button size="sm" className="h-7 text-xs flyn-button-gradient gap-1" onClick={handleCreateAgent}><Check className="w-3 h-3" /> Add</Button>
                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { setAddingAgent(false); setNewAgent(BLANK_AGENT); }}><X className="w-3 h-3 mr-1" /> Cancel</Button>
              </div>
            </div>
          )}

          {agentLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[1, 2].map(i => <div key={i} className="h-20 rounded-xl border border-border bg-muted/30 animate-pulse" />)}
            </div>
          ) : agents.length === 0 ? (
            <div className="text-center py-10 text-sm text-muted-foreground">
              No agents yet. Click "Add Agent" to create one.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {agents.map(agent => (
                <AgentRow key={agent.id} agent={agent} onSave={handleSaveAgent} onDelete={handleDeleteAgent} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Social Links ── */}
      <Card>
        <CardHeader>
          <CardTitle>Social Media Links</CardTitle>
          <CardDescription>Connect your social profiles</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {socialFields.map((field) => (
              <div key={field.key} className="space-y-2">
                <Label className="flex items-center gap-2"><field.icon className="w-4 h-4 text-muted-foreground" />{field.label}</Label>
                <Input value={social[field.key as keyof typeof social]} onChange={(e) => handleSocialChange(field.key, e.target.value)} placeholder={field.placeholder} />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* ── Footer Settings ── */}
      <Card>
        <CardHeader>
          <CardTitle>Footer Settings</CardTitle>
          <CardDescription>Customize the footer CTA and copyright</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>CTA Headline</Label>
              <Input value={footer.ctaHeadline} onChange={(e) => handleFooterChange("ctaHeadline", e.target.value)} placeholder="Start Running Your Organization Smarter —" />
            </div>
            <div className="space-y-2">
              <Label>Highlighted Text (gradient)</Label>
              <Input value={footer.ctaHighlightedText} onChange={(e) => handleFooterChange("ctaHighlightedText", e.target.value)} placeholder="Today" />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>Copyright Text</Label>
              <Input value={footer.copyrightText} onChange={(e) => handleFooterChange("copyrightText", e.target.value)} placeholder="Flyn.AI. All rights reserved." />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Bottom save bar */}
      {hasChanges && (
        <div className="sticky bottom-4 flex justify-end">
          <Button onClick={handleSave} disabled={isSaving} className="flyn-button-gradient shadow-lg gap-2">
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save Changes
          </Button>
        </div>
      )}
    </motion.div>
  );
}
