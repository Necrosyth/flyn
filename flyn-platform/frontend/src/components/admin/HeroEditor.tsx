import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useLandingContent } from "@/contexts/LandingContentContext";
import { Save, Eye, Plus, Trash2, Loader2, Globe } from "lucide-react";
import { toast } from "@/hooks/use-toast";

export function HeroEditor() {
  const { content, updateHero, patchContent, isSaving } = useLandingContent();
  const [formData, setFormData] = useState(content.hero);
  const [seoData, setSeoData] = useState({ siteTitle: content.siteTitle, seoDescription: content.seoDescription });
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    setFormData(content.hero);
  }, [content.hero]);

  useEffect(() => {
    setSeoData({ siteTitle: content.siteTitle, seoDescription: content.seoDescription });
  }, [content.siteTitle, content.seoDescription]);

  const handleChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setHasChanges(true);
  };

  const handleBadgeChange = (index: number, field: "icon" | "text", value: string) => {
    const newBadges = [...formData.trustBadges];
    newBadges[index] = { ...newBadges[index], [field]: value };
    setFormData((prev) => ({ ...prev, trustBadges: newBadges }));
    setHasChanges(true);
  };

  const addBadge = () => {
    setFormData((prev) => ({
      ...prev,
      trustBadges: [...prev.trustBadges, { icon: "Check", text: "New Badge" }],
    }));
    setHasChanges(true);
  };

  const removeBadge = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      trustBadges: prev.trustBadges.filter((_, i) => i !== index),
    }));
    setHasChanges(true);
  };

  const handleSave = async () => {
    await updateHero(formData);
    await patchContent((c) => ({ ...c, siteTitle: seoData.siteTitle, seoDescription: seoData.seoDescription }));
    setHasChanges(false);
    toast({ title: "Hero section updated", description: "Changes saved successfully." });
  };

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      {/* SEO / Browser Tab */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Globe className="w-4 h-4 text-primary" />
            <div>
              <CardTitle className="text-base">SEO &amp; Browser Tab</CardTitle>
              <CardDescription>Controls the browser tab title and search engine description for the landing page.</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="siteTitle">Browser Tab / Page Title</Label>
            <Input
              id="siteTitle"
              value={seoData.siteTitle}
              onChange={(e) => { setSeoData((p) => ({ ...p, siteTitle: e.target.value })); setHasChanges(true); }}
              placeholder="Flyn | All-in-One Business Automation Platform"
            />
            <p className="text-xs text-muted-foreground">Shown in browser tabs and search results. Keep under 60 characters.</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="seoDescription">Meta Description</Label>
            <Textarea
              id="seoDescription"
              value={seoData.seoDescription}
              onChange={(e) => { setSeoData((p) => ({ ...p, seoDescription: e.target.value })); setHasChanges(true); }}
              placeholder="Flyn unifies messaging, events, automation, and analytics..."
              rows={2}
            />
            <p className="text-xs text-muted-foreground">Used by search engines. Keep under 160 characters.</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Hero Section</CardTitle>
              <CardDescription>Edit the main headline and call-to-action on your landing page</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" asChild>
                <a href="/" target="_blank" rel="noopener noreferrer">
                  <Eye className="w-4 h-4 mr-2" />
                  Preview
                </a>
              </Button>
              <Button
                size="sm"
                onClick={handleSave}
                disabled={!hasChanges || isSaving}
                className="flyn-button-gradient"
              >
                {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                Save Changes
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="headline">Main Headline</Label>
                <Input
                  id="headline"
                  value={formData.headline}
                  onChange={(e) => handleChange("headline", e.target.value)}
                  placeholder="One AI Platform to Run"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="highlightedText">Highlighted Text (gradient)</Label>
                <Input
                  id="highlightedText"
                  value={formData.highlightedText}
                  onChange={(e) => handleChange("highlightedText", e.target.value)}
                  placeholder="Conversations"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="subheadline">Subheadline</Label>
                <Input
                  id="subheadline"
                  value={formData.subheadline}
                  onChange={(e) => handleChange("subheadline", e.target.value)}
                  placeholder="Events, Communities, and Growth"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => handleChange("description", e.target.value)}
                  placeholder="FLYN AI unifies messaging..."
                  rows={4}
                />
              </div>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="primaryCta">Primary CTA Button</Label>
                <Input
                  id="primaryCta"
                  value={formData.primaryCta}
                  onChange={(e) => handleChange("primaryCta", e.target.value)}
                  placeholder="Start Free Trial"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="secondaryCta">Secondary CTA Button</Label>
                <Input
                  id="secondaryCta"
                  value={formData.secondaryCta}
                  onChange={(e) => handleChange("secondaryCta", e.target.value)}
                  placeholder="Request Enterprise Demo"
                />
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Trust Badges</Label>
                  <Button variant="outline" size="sm" onClick={addBadge}>
                    <Plus className="w-4 h-4 mr-1" />
                    Add Badge
                  </Button>
                </div>
                <div className="space-y-2">
                  {formData.trustBadges.map((badge, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <Input
                        value={badge.icon}
                        onChange={(e) => handleBadgeChange(index, "icon", e.target.value)}
                        placeholder="Icon name"
                        className="w-32"
                      />
                      <Input
                        value={badge.text}
                        onChange={(e) => handleBadgeChange(index, "text", e.target.value)}
                        placeholder="Badge text"
                        className="flex-1"
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeBadge(index)}
                        className="shrink-0 text-destructive hover:text-destructive"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
