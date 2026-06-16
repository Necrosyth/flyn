import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useLandingContent } from "@/contexts/LandingContentContext";
import { Save, Download, Loader2, Bot, Info } from "lucide-react";
import { toast } from "@/hooks/use-toast";

export function RobotsTxtEditor() {
  const { content, updateRobotsTxt, isSaving } = useLandingContent();

  const [value, setValue] = useState(content.robotsTxt ?? "");
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    setValue(content.robotsTxt ?? "");
    setHasChanges(false);
  }, [content.robotsTxt]);

  const handleSave = async () => {
    await updateRobotsTxt(value);
    setHasChanges(false);
    toast({ title: "robots.txt saved", description: "Changes stored. Download and commit the file to go live." });
  };

  const handleDownload = () => {
    const blob = new Blob([value], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "robots.txt";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Bot className="w-5 h-5 text-primary" />
                robots.txt
              </CardTitle>
              <CardDescription>Control which bots and crawlers can access your site</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={handleDownload}>
                <Download className="w-4 h-4 mr-2" />
                Download
              </Button>
              <Button
                size="sm"
                onClick={handleSave}
                disabled={!hasChanges || isSaving}
                className="flyn-button-gradient"
              >
                {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                Save
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-sm text-amber-700 dark:text-amber-400">
            <Info className="w-4 h-4 mt-0.5 shrink-0" />
            <span>
              After saving, click <strong>Download</strong> to get the updated file, then replace{" "}
              <code className="font-mono text-xs bg-amber-500/10 px-1 rounded">public/robots.txt</code> in the
              repository and redeploy for changes to go live.
            </span>
          </div>

          <Textarea
            value={value}
            onChange={(e) => { setValue(e.target.value); setHasChanges(true); }}
            className="font-mono text-xs leading-relaxed min-h-[500px] resize-y"
            spellCheck={false}
          />

          <p className="text-xs text-muted-foreground">
            {value.split("\n").length} lines · Changes are saved to Firebase and can be downloaded as a static file.
          </p>
        </CardContent>
      </Card>
    </motion.div>
  );
}
