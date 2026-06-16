import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { motion } from 'framer-motion';
import { ChevronLeft, Save, Zap, Plus, Trash2, GripVertical } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { getPlanById, updatePlan, enforcePlanUpdate, getAdminSchema, updateSchema } from '@/services/plansApi';
import type { PlanDefinition, PlanFeatures, PricingTableSchema, PricingTableCategory, PricingTableFeatureRow } from '@/services/plansApi';

export default function PlanEditor() {
  const { planId } = useParams<{ planId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [plan, setPlan] = useState<PlanDefinition | null>(null);
  const [schema, setSchema] = useState<PricingTableSchema | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingSchema, setSavingSchema] = useState(false);
  const [showEnforceDialog, setShowEnforceDialog] = useState(false);
  const [applyToExisting, setApplyToExisting] = useState(false);

  useEffect(() => {
    const fetchAll = async () => {
      if (!planId) return;
      try {
        const [planData, schemaData] = await Promise.all([
          getPlanById(planId),
          getAdminSchema().catch(() => null),
        ]);
        setPlan(planData);
        if (schemaData) setSchema(schemaData);
      } catch (error) {
        toast({ title: 'Error', description: 'Failed to load plan', variant: 'destructive' });
        navigate('/admin/plans');
      } finally {
        setLoading(false);
      }
    };
    fetchAll();
  }, [planId, navigate, toast]);

  const handleFeatureToggle = (category: keyof PlanFeatures, feature: string, value: boolean) => {
    if (!plan) return;
    setPlan({
      ...plan,
      features: {
        ...plan.features,
        [category]: {
          ...(plan.features[category] || {}),
          [feature]: value,
        },
      },
    });
  };

  const handleLimitChange = (key: keyof typeof plan.limits, value: number) => {
    if (!plan) return;
    setPlan({
      ...plan,
      limits: {
        ...plan.limits,
        [key]: value,
      },
    });
  };

  const handleSave = async () => {
    if (!plan) return;
    setSaving(true);
    try {
      const updated = await updatePlan(plan.id, {
        name: plan.name,
        description: plan.description,
        tagline: plan.tagline,
        highlights: plan.highlights,
        pricing: plan.pricing,
        features: plan.features,
        limits: plan.limits,
      });
      setPlan(updated);
      toast({
        title: 'Success',
        description: `Plan '${plan.name}' updated successfully`,
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to save plan',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleEnforce = async () => {
    if (!plan) return;
    setSaving(true);
    try {
      const result = await enforcePlanUpdate(plan.id, applyToExisting);
      toast({
        title: 'Success',
        description: `Plan enforced on ${result.updated} subscriptions`,
      });
      setShowEnforceDialog(false);
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to enforce plan',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  // ─── Schema management ────────────────────────────────────────────────────

  const handleSaveSchema = async () => {
    if (!schema) return;
    setSavingSchema(true);
    try {
      const updated = await updateSchema(schema);
      setSchema(updated);
      toast({ title: 'Success', description: 'Comparison table updated' });
    } catch {
      toast({ title: 'Error', description: 'Failed to save comparison table', variant: 'destructive' });
    } finally {
      setSavingSchema(false);
    }
  };

  const updateCategoryLabel = (catIdx: number, label: string) => {
    if (!schema) return;
    const cats = [...schema.categories];
    cats[catIdx] = { ...cats[catIdx], label };
    setSchema({ ...schema, categories: cats });
  };

  const addCategory = () => {
    if (!schema) return;
    const newCat: PricingTableCategory = {
      key: `category_${Date.now()}`,
      label: 'New Category',
      order: schema.categories.length,
      features: [],
    };
    setSchema({ ...schema, categories: [...schema.categories, newCat] });
  };

  const removeCategory = (catIdx: number) => {
    if (!schema) return;
    setSchema({ ...schema, categories: schema.categories.filter((_, i) => i !== catIdx) });
  };

  const addFeatureRow = (catIdx: number) => {
    if (!schema) return;
    const cats = [...schema.categories];
    const cat = cats[catIdx];
    const newRow: PricingTableFeatureRow = {
      key: `feature_${Date.now()}`,
      label: 'New Feature',
      order: cat.features.length,
      type: 'boolean',
    };
    cats[catIdx] = { ...cat, features: [...cat.features, newRow] };
    setSchema({ ...schema, categories: cats });
  };

  const updateFeatureRow = (catIdx: number, rowIdx: number, patch: Partial<PricingTableFeatureRow>) => {
    if (!schema) return;
    const cats = [...schema.categories];
    const rows = [...cats[catIdx].features];
    rows[rowIdx] = { ...rows[rowIdx], ...patch };
    cats[catIdx] = { ...cats[catIdx], features: rows };
    setSchema({ ...schema, categories: cats });
  };

  const removeFeatureRow = (catIdx: number, rowIdx: number) => {
    if (!schema) return;
    const cats = [...schema.categories];
    cats[catIdx] = { ...cats[catIdx], features: cats[catIdx].features.filter((_, i) => i !== rowIdx) };
    setSchema({ ...schema, categories: cats });
  };

  const toggleFeatureForPlan = (categoryKey: string, featureKey: string, value: boolean) => {
    if (!plan) return;
    const features = { ...(plan.features as Record<string, Record<string, boolean>>) };
    features[categoryKey] = { ...(features[categoryKey] ?? {}), [featureKey]: value };
    setPlan({ ...plan, features: features as PlanFeatures });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!plan) return null;

  const featureCategories = [
    {
      id: 'core_modules',
      label: 'Core Modules',
      description: 'CRM, inbox, events, HR, accounting, messaging channels',
    },
    {
      id: 'communication',
      label: 'Communication & AI',
      description: 'Email, AI agents, chatbot, marketing, social media, website builder',
    },
    {
      id: 'automation',
      label: 'Automation & Productivity',
      description: 'Workflows, calendar, telephony, freelancers, contracts, SLA',
    },
    {
      id: 'platform',
      label: 'Platform & Integrations',
      description: 'API access, white-label, custom domains, integrations',
    },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-4xl mx-auto space-y-6 p-6"
    >
      {/* Header */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => navigate('/admin/plans')}
          className="p-2 hover:bg-muted rounded-lg transition"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-3xl font-bold">{plan.name} Plan</h1>
          <p className="text-muted-foreground">Edit features and limits</p>
        </div>
      </div>

      {/* Basic Info */}
      <Card>
        <CardHeader>
          <CardTitle>Basic Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="name">Plan Name</Label>
            <Input
              id="name"
              value={plan.name}
              onChange={(e) => setPlan({ ...plan, name: e.target.value })}
              placeholder="e.g., Pro, Growth"
            />
          </div>
          <div>
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={plan.description}
              onChange={(e) => setPlan({ ...plan, description: e.target.value })}
              placeholder="Brief description of the plan"
              rows={2}
            />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="priceMonthly">Monthly Price ($)</Label>
              <Input
                id="priceMonthly"
                type="number"
                value={plan.pricing?.monthly ?? 0}
                onChange={(e) => setPlan({ ...plan, pricing: { ...(plan.pricing ?? { monthly: 0, yearly: 0, currency: 'USD' }), monthly: parseFloat(e.target.value) } })}
              />
              <Input
                value={plan.pricing?.displayMonthly ?? ''}
                onChange={(e) => setPlan({ ...plan, pricing: { ...(plan.pricing ?? { monthly: 0, yearly: 0, currency: 'USD' }), displayMonthly: e.target.value || undefined } })}
                placeholder="Override e.g. 29.99 (decimal auto-superscripted)"
                className="text-xs"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="priceYearly">Yearly Price ($)</Label>
              <Input
                id="priceYearly"
                type="number"
                value={plan.pricing?.yearly ?? 0}
                onChange={(e) => setPlan({ ...plan, pricing: { ...(plan.pricing ?? { monthly: 0, yearly: 0, currency: 'USD' }), yearly: parseFloat(e.target.value) } })}
              />
              <Input
                value={plan.pricing?.displayYearly ?? ''}
                onChange={(e) => setPlan({ ...plan, pricing: { ...(plan.pricing ?? { monthly: 0, yearly: 0, currency: 'USD' }), displayYearly: e.target.value || undefined } })}
                placeholder="Override e.g. 29.99 (decimal auto-superscripted)"
                className="text-xs"
              />
            </div>
            <div>
              <Label htmlFor="ctaText">CTA Button Text</Label>
              <Input
                id="ctaText"
                value={plan.pricing?.ctaText ?? ''}
                onChange={(e) => setPlan({ ...plan, pricing: { ...(plan.pricing ?? { monthly: 0, yearly: 0, currency: 'USD' }), ctaText: e.target.value } })}
                placeholder="Get Started"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stripe Sync Status */}
      <Card>
        <CardHeader>
          <CardTitle>Stripe Sync</CardTitle>
          <CardDescription>
            Live Stripe IDs for this plan. Run <code>scripts/stripe-bootstrap.mjs</code> to populate,
            or update pricing above to auto-rotate prices.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground w-36 shrink-0">Product ID</span>
            {plan.stripeProductId
              ? <Badge variant="outline" className="font-mono text-xs">{plan.stripeProductId}</Badge>
              : <Badge variant="secondary" className="text-xs">Not synced</Badge>
            }
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground w-36 shrink-0">Monthly Price ID</span>
            {plan.pricing?.stripeMonthlyPriceId
              ? <Badge variant="outline" className="font-mono text-xs">{plan.pricing.stripeMonthlyPriceId}</Badge>
              : <Badge variant="secondary" className="text-xs">Not synced</Badge>
            }
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground w-36 shrink-0">Yearly Price ID</span>
            {plan.pricing?.stripeYearlyPriceId
              ? <Badge variant="outline" className="font-mono text-xs">{plan.pricing.stripeYearlyPriceId}</Badge>
              : <Badge variant="secondary" className="text-xs">Not synced</Badge>
            }
          </div>
        </CardContent>
      </Card>

      {/* Plan Highlights (pricing card bullet points) */}
      <Card>
        <CardHeader>
          <CardTitle>Plan Highlights</CardTitle>
          <CardDescription>Bullet points shown on the public pricing page card</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {(plan.highlights ?? []).map((h, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <Input
                value={h}
                onChange={e => {
                  const next = [...(plan.highlights ?? [])];
                  next[idx] = e.target.value;
                  setPlan({ ...plan, highlights: next });
                }}
                placeholder="e.g., Up to 5,000 messages/mo"
              />
              <Button
                variant="ghost"
                size="icon"
                className="shrink-0 text-destructive hover:text-destructive"
                onClick={() => {
                  const next = (plan.highlights ?? []).filter((_, i) => i !== idx);
                  setPlan({ ...plan, highlights: next });
                }}
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          ))}
          <Button
            variant="outline"
            size="sm"
            className="mt-2"
            onClick={() => setPlan({ ...plan, highlights: [...(plan.highlights ?? []), ''] })}
          >
            <Plus className="w-4 h-4 mr-1" /> Add Bullet
          </Button>
        </CardContent>
      </Card>

      {/* Usage Limits */}
      <Card>
        <CardHeader>
          <CardTitle>Usage Limits</CardTitle>
          <CardDescription>Monthly caps for usage metrics</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="messages">Messages per Month</Label>
            <Input
              id="messages"
              type="number"
              value={plan.limits.messagesPerMonth}
              onChange={(e) =>
                handleLimitChange('messagesPerMonth', parseInt(e.target.value))
              }
            />
          </div>
          <div>
            <Label htmlFor="aiTokens">AI Tokens per Month</Label>
            <Input
              id="aiTokens"
              type="number"
              value={plan.limits.aiTokensPerMonth}
              onChange={(e) =>
                handleLimitChange('aiTokensPerMonth', parseInt(e.target.value))
              }
            />
          </div>
          <div>
            <Label htmlFor="telephony">Telephony Minutes per Month</Label>
            <Input
              id="telephony"
              type="number"
              value={plan.limits.telephonyMinutesPerMonth}
              onChange={(e) =>
                handleLimitChange('telephonyMinutesPerMonth', parseInt(e.target.value))
              }
            />
          </div>
          <div>
            <Label htmlFor="teamMembers">Team Members</Label>
            <Input
              id="teamMembers"
              type="number"
              value={plan.limits.teamMembers}
              onChange={(e) => handleLimitChange('teamMembers', parseInt(e.target.value))}
            />
          </div>
        </CardContent>
      </Card>

      {/* Features */}
      <div className="space-y-4">
        {featureCategories.map((category) => (
          <Card key={category.id}>
            <CardHeader>
              <CardTitle className="text-lg">{category.label}</CardTitle>
              <CardDescription>{category.description}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {Object.entries(plan.features[category.id as keyof PlanFeatures] || {}).map(
                  ([feature, enabled]) => (
                    <div key={feature} className="flex items-center space-x-2">
                      <Checkbox
                        id={`${category.id}-${feature}`}
                        checked={enabled as boolean}
                        onCheckedChange={(checked) =>
                          handleFeatureToggle(
                            category.id as keyof PlanFeatures,
                            feature,
                            checked as boolean,
                          )
                        }
                      />
                      <label
                        htmlFor={`${category.id}-${feature}`}
                        className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer capitalize"
                      >
                        {feature.replace(/_/g, ' ')}
                      </label>
                    </div>
                  ),
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Comparison Table Schema */}
      {schema && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Comparison Table</CardTitle>
                <CardDescription>
                  Edit the public pricing page comparison table. Changes affect all plans.
                  Toggle values here to set this plan's value for each row.
                </CardDescription>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={addCategory}>
                  <Plus className="w-4 h-4 mr-1" /> Add Category
                </Button>
                <Button size="sm" onClick={handleSaveSchema} disabled={savingSchema}>
                  <Save className="w-4 h-4 mr-1" />
                  {savingSchema ? 'Saving...' : 'Save Table'}
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {schema.categories
              .sort((a, b) => a.order - b.order)
              .map((category, catIdx) => (
                <div key={category.key} className="border border-border rounded-lg overflow-hidden">
                  {/* Category header */}
                  <div className="flex items-center gap-3 bg-muted/50 px-4 py-3">
                    <GripVertical className="w-4 h-4 text-muted-foreground shrink-0" />
                    <Input
                      value={category.label}
                      onChange={e => updateCategoryLabel(catIdx, e.target.value)}
                      className="h-7 text-sm font-semibold bg-transparent border-0 p-0 focus-visible:ring-0 flex-1"
                      placeholder="Category label"
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => addFeatureRow(catIdx)}
                      className="text-xs"
                    >
                      <Plus className="w-3 h-3 mr-1" /> Row
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive hover:text-destructive"
                      onClick={() => removeCategory(catIdx)}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>

                  {/* Feature rows */}
                  <div className="divide-y divide-border">
                    {category.features
                      .sort((a, b) => a.order - b.order)
                      .map((row, rowIdx) => {
                        const currentFeatureMap = (plan?.features as Record<string, Record<string, boolean>>)?.[category.key] ?? {};
                        const isEnabled = currentFeatureMap[row.key] === true;

                        return (
                          <div key={row.key} className="flex items-center gap-3 px-4 py-2.5">
                            <GripVertical className="w-4 h-4 text-muted-foreground shrink-0" />

                            {/* Label */}
                            <Input
                              value={row.label}
                              onChange={e => updateFeatureRow(catIdx, rowIdx, { label: e.target.value })}
                              className="h-7 text-sm border-border flex-1 min-w-0"
                              placeholder="Feature label"
                            />

                            {/* Key */}
                            <Input
                              value={row.key}
                              onChange={e => updateFeatureRow(catIdx, rowIdx, { key: e.target.value })}
                              className="h-7 text-xs font-mono border-border w-48"
                              placeholder="feature.key"
                            />

                            {/* Type */}
                            <select
                              value={row.type}
                              onChange={e => updateFeatureRow(catIdx, rowIdx, { type: e.target.value as 'boolean' | 'limit' })}
                              className="h-7 text-xs border border-border rounded px-2 bg-background"
                            >
                              <option value="boolean">boolean</option>
                              <option value="limit">limit</option>
                            </select>

                            {/* LimitKey (only for limit type) */}
                            {row.type === 'limit' && (
                              <Input
                                value={row.limitKey ?? ''}
                                onChange={e => updateFeatureRow(catIdx, rowIdx, { limitKey: e.target.value })}
                                className="h-7 text-xs font-mono border-border w-36"
                                placeholder="limits.field"
                              />
                            )}

                            {/* Toggle for THIS plan */}
                            {row.type === 'boolean' && (
                              <div className="flex items-center gap-1.5 shrink-0">
                                <Checkbox
                                  checked={isEnabled}
                                  onCheckedChange={checked =>
                                    toggleFeatureForPlan(category.key, row.key, checked as boolean)
                                  }
                                />
                                <span className={`text-xs ${isEnabled ? 'text-green-600' : 'text-muted-foreground'}`}>
                                  {isEnabled ? 'ON' : 'OFF'}
                                </span>
                              </div>
                            )}

                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-destructive hover:text-destructive shrink-0"
                              onClick={() => removeFeatureRow(catIdx, rowIdx)}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        );
                      })}

                    {category.features.length === 0 && (
                      <div className="px-4 py-3 text-sm text-muted-foreground italic">
                        No feature rows. Click "+ Row" to add one.
                      </div>
                    )}
                  </div>
                </div>
              ))}
          </CardContent>
        </Card>
      )}

      {/* Actions */}
      <div className="flex gap-3 justify-between items-center p-6 bg-muted rounded-lg">
        <div className="flex gap-2">
          <Button
            onClick={handleSave}
            disabled={saving}
            className="gap-2"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
        <Button
          onClick={() => setShowEnforceDialog(true)}
          variant="outline"
          className="gap-2"
          disabled={saving}
        >
          <Zap className="w-4 h-4" />
          Enforce on Existing
        </Button>
      </div>

      {/* Enforce Dialog */}
      <AlertDialog open={showEnforceDialog} onOpenChange={setShowEnforceDialog}>
        <AlertDialogContent>
          <AlertDialogTitle>Apply Changes to Existing Subscriptions?</AlertDialogTitle>
          <AlertDialogDescription className="space-y-4">
            <p>Choose how to apply these plan changes:</p>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="radio"
                name="enforcement"
                value="immediate"
                checked={applyToExisting}
                onChange={(e) => setApplyToExisting(e.target.checked)}
                className="w-4 h-4"
              />
              <div>
                <div className="font-medium">Apply Immediately</div>
                <div className="text-sm text-muted-foreground">
                  All users on this plan immediately get the new features
                </div>
              </div>
            </label>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="radio"
                name="enforcement"
                value="future"
                checked={!applyToExisting}
                onChange={(e) => setApplyToExisting(!e.target.checked)}
                className="w-4 h-4"
              />
              <div>
                <div className="font-medium">Future Only</div>
                <div className="text-sm text-muted-foreground">
                  Only new customers get the new features
                </div>
              </div>
            </label>
          </AlertDialogDescription>
          <div className="flex gap-3 justify-end">
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleEnforce} disabled={saving}>
              {saving ? 'Enforcing...' : 'Enforce Changes'}
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </motion.div>
  );
}
