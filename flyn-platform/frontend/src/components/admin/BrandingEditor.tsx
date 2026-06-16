import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Save } from 'lucide-react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase'; // Ensure this path is correct

export const BrandingEditor: React.FC = () => {
  const [data, setData] = useState({
    ogTitle: "",
    ogDescription: "",
    ogImageUrl: ""
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    const fetchBranding = async () => {
      try {
        const docRef = doc(db, 'landing_content', 'homepage');
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const d = docSnap.data() as any;
          setData({
            ogTitle: d.ogTitle ?? d.branding?.ogTitle ?? "",
            ogDescription: d.ogDescription ?? d.branding?.ogDescription ?? "",
            ogImageUrl: d.ogImageUrl ?? d.branding?.ogImageUrl ?? "",
          });
        }
      } catch (err) {
        console.error("Error fetching branding:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchBranding();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const docRef = doc(db, 'landing_content', 'homepage');
      await setDoc(docRef, data, { merge: true });
      toast({ title: "Branding Saved", description: "Metadata saved to database." });
    } catch (err) {
      toast({ variant: "destructive", title: "Error", description: "Failed to save metadata." });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="flex justify-center p-10"><Loader2 className="animate-spin" /></div>;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Branding & SEO Metadata</CardTitle>
        <CardDescription>Configure how your site appears when shared on social media (WhatsApp, LinkedIn, etc.)</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <label className="text-sm font-medium mb-1 block">OG Title</label>
          <Input value={data.ogTitle} onChange={(e) => setData({...data, ogTitle: e.target.value})} />
        </div>
        <div>
          <label className="text-sm font-medium mb-1 block">OG Description</label>
          <Textarea value={data.ogDescription} onChange={(e) => setData({...data, ogDescription: e.target.value})} rows={3} />
        </div>
        <div>
          <label className="text-sm font-medium mb-1 block">Cover Image URL</label>
          <Input value={data.ogImageUrl} onChange={(e) => setData({...data, ogImageUrl: e.target.value})} />
        </div>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          Save Branding
        </Button>
      </CardContent>
    </Card>
  );
};
