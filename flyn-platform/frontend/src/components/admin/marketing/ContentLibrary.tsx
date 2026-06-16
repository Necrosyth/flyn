import { useState } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useMarketingDashboard, ContentAsset } from "@/contexts/MarketingDashboardContext";
import {
  FileText,
  Video,
  HelpCircle,
  DollarSign,
  BookOpen,
  Presentation,
  Plus,
  Download,
  Link,
  Search,
  ExternalLink,
} from "lucide-react";

const typeIcons: Record<ContentAsset["type"], React.ElementType> = {
  "pitch-deck": Presentation,
  "one-pager": FileText,
  "video": Video,
  "faq": HelpCircle,
  "pricing": DollarSign,
  "case-study": BookOpen,
};

const typeColors: Record<ContentAsset["type"], string> = {
  "pitch-deck": "bg-blue-500/10 text-blue-600",
  "one-pager": "bg-purple-500/10 text-purple-600",
  "video": "bg-red-500/10 text-red-600",
  "faq": "bg-amber-500/10 text-amber-600",
  "pricing": "bg-green-500/10 text-green-600",
  "case-study": "bg-cyan-500/10 text-cyan-600",
};

export function ContentLibrary() {
  const { contentAssets, addContentAsset } = useMarketingDashboard();
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [newAsset, setNewAsset] = useState({
    name: "",
    type: "pitch-deck" as ContentAsset["type"],
    url: "",
    version: "1.0",
  });

  const filteredAssets = contentAssets.filter(asset => {
    const matchesSearch = asset.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesType = typeFilter === "all" || asset.type === typeFilter;
    return matchesSearch && matchesType;
  });

  const handleAddAsset = () => {
    addContentAsset(newAsset);
    setIsAddOpen(false);
    setNewAsset({ name: "", type: "pitch-deck", url: "", version: "1.0" });
  };

  const copyLink = (url: string) => {
    navigator.clipboard.writeText(`https://app.flynai.com${url}`);
  };

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-primary" />
                Content Library
              </CardTitle>
              <CardDescription>Central hub for all marketing and sales assets</CardDescription>
            </div>
            <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
              <DialogTrigger asChild>
                <Button className="flyn-button-gradient">
                  <Plus className="w-4 h-4 mr-2" />
                  Upload Asset
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Upload New Asset</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 mt-4">
                  <div className="space-y-2">
                    <Label>Asset Name</Label>
                    <Input
                      value={newAsset.name}
                      onChange={(e) => setNewAsset(prev => ({ ...prev, name: e.target.value }))}
                      placeholder="FLYN AI Product Overview"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Type</Label>
                      <Select
                        value={newAsset.type}
                        onValueChange={(v: ContentAsset["type"]) => setNewAsset(prev => ({ ...prev, type: v }))}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pitch-deck">Pitch Deck</SelectItem>
                          <SelectItem value="one-pager">One-Pager</SelectItem>
                          <SelectItem value="video">Video</SelectItem>
                          <SelectItem value="faq">FAQ</SelectItem>
                          <SelectItem value="pricing">Pricing</SelectItem>
                          <SelectItem value="case-study">Case Study</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Version</Label>
                      <Input
                        value={newAsset.version}
                        onChange={(e) => setNewAsset(prev => ({ ...prev, version: e.target.value }))}
                        placeholder="1.0"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>File URL</Label>
                    <Input
                      value={newAsset.url}
                      onChange={(e) => setNewAsset(prev => ({ ...prev, url: e.target.value }))}
                      placeholder="/assets/document.pdf"
                    />
                  </div>
                  <Button onClick={handleAddAsset} className="w-full flyn-button-gradient">
                    Upload Asset
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-3 mb-6">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search assets..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="All Types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="pitch-deck">Pitch Decks</SelectItem>
                <SelectItem value="one-pager">One-Pagers</SelectItem>
                <SelectItem value="video">Videos</SelectItem>
                <SelectItem value="faq">FAQs</SelectItem>
                <SelectItem value="pricing">Pricing</SelectItem>
                <SelectItem value="case-study">Case Studies</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Asset Grid */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredAssets.map((asset) => {
              const TypeIcon = typeIcons[asset.type];
              return (
                <div
                  key={asset.id}
                  className="p-4 rounded-xl border border-border hover:border-primary/50 hover:shadow-md transition-all"
                >
                  <div className="flex items-start gap-3">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${typeColors[asset.type]}`}>
                      <TypeIcon className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium text-sm truncate">{asset.name}</h3>
                      <p className="text-xs text-muted-foreground capitalize">
                        {asset.type.replace("-", " ")} • v{asset.version}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between mt-4 pt-3 border-t border-border">
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Download className="w-3 h-3" />
                      {asset.downloads} downloads
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => copyLink(asset.url)}
                      >
                        <Link className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        asChild
                      >
                        <a href={asset.url} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="w-4 h-4" />
                        </a>
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {filteredAssets.length === 0 && (
            <div className="text-center py-12">
              <FileText className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground">No assets found</p>
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
