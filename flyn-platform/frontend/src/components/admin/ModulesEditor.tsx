import { useState } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useLandingContent, ModuleContent } from "@/contexts/LandingContentContext";
import { Save, Plus, Trash2, GripVertical, Loader2, Boxes } from "lucide-react";
import { toast } from "@/hooks/use-toast";

export function ModulesEditor() {
  const { content, updateModules, isSaving } = useLandingContent();
  const [modules, setModules] = useState(content.modules);
  const [hasChanges, setHasChanges] = useState(false);

  const handleModuleChange = (id: string, field: keyof ModuleContent, value: string | boolean | string[]) => {
    setModules((prev) =>
      prev.map((m) => (m.id === id ? { ...m, [field]: value } : m))
    );
    setHasChanges(true);
  };

  const handleFeatureChange = (moduleId: string, featureIndex: number, value: string) => {
    setModules((prev) =>
      prev.map((m) => {
        if (m.id === moduleId) {
          const newFeatures = [...m.features];
          newFeatures[featureIndex] = value;
          return { ...m, features: newFeatures };
        }
        return m;
      })
    );
    setHasChanges(true);
  };

  const addFeature = (moduleId: string) => {
    setModules((prev) =>
      prev.map((m) => (m.id === moduleId ? { ...m, features: [...m.features, ""] } : m))
    );
    setHasChanges(true);
  };

  const removeFeature = (moduleId: string, featureIndex: number) => {
    setModules((prev) =>
      prev.map((m) => {
        if (m.id === moduleId) {
          return { ...m, features: m.features.filter((_, i) => i !== featureIndex) };
        }
        return m;
      })
    );
    setHasChanges(true);
  };

  const handleSave = async () => {
    await updateModules(modules);
    setHasChanges(false);
    toast({ title: "Modules updated", description: "Changes saved successfully." });
  };

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Boxes className="w-5 h-5 text-primary" />
                Product Modules
              </CardTitle>
              <CardDescription>Configure the modules displayed on your landing page</CardDescription>
            </div>
            <Button
              onClick={handleSave}
              disabled={!hasChanges || isSaving}
              className="flyn-button-gradient"
            >
              {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
              Save Changes
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {modules.map((module) => (
            <div
              key={module.id}
              className={`rounded-xl border p-4 transition-colors ${
                module.enabled ? "border-border bg-card" : "border-border/50 bg-muted/30 opacity-60"
              }`}
            >
              <div className="flex items-start gap-4">
                <div className="cursor-move text-muted-foreground hover:text-foreground">
                  <GripVertical className="w-5 h-5" />
                </div>

                <div className="flex-1 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary font-semibold">
                        {module.icon.charAt(0)}
                      </div>
                      <div>
                        <h3 className="font-semibold">{module.title}</h3>
                        <p className="text-xs text-muted-foreground">{module.href}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Label htmlFor={`enabled-${module.id}`} className="text-sm text-muted-foreground">
                        Visible
                      </Label>
                      <Switch
                        id={`enabled-${module.id}`}
                        checked={module.enabled}
                        onCheckedChange={(checked) => handleModuleChange(module.id, "enabled", checked)}
                      />
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-3">
                    <div className="space-y-2">
                      <Label>Title</Label>
                      <Input
                        value={module.title}
                        onChange={(e) => handleModuleChange(module.id, "title", e.target.value)}
                        placeholder="Module title"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Icon Name</Label>
                      <Input
                        value={module.icon}
                        onChange={(e) => handleModuleChange(module.id, "icon", e.target.value)}
                        placeholder="MessageSquare"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>CTA Text</Label>
                      <Input
                        value={module.cta}
                        onChange={(e) => handleModuleChange(module.id, "cta", e.target.value)}
                        placeholder="Explore"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label>Features</Label>
                      <Button variant="ghost" size="sm" onClick={() => addFeature(module.id)}>
                        <Plus className="w-4 h-4 mr-1" />
                        Add
                      </Button>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {module.features.map((feature, index) => (
                        <div key={index} className="flex items-center gap-2">
                          <Input
                            value={feature}
                            onChange={(e) => handleFeatureChange(module.id, index, e.target.value)}
                            placeholder="Feature"
                            className="text-sm"
                          />
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => removeFeature(module.id, index)}
                            className="shrink-0 h-9 w-9 text-destructive hover:text-destructive"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </motion.div>
  );
}
