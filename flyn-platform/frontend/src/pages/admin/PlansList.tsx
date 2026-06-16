import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { motion } from 'framer-motion';
import { Edit2, DollarSign, Users, RefreshCw, ArrowLeft } from 'lucide-react';
import { getAllPlans, seedPlans } from '@/services/plansApi';
import type { PlanDefinition } from '@/services/plansApi';

export default function PlansList() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [plans, setPlans] = useState<PlanDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);

  useEffect(() => {
    const fetchPlans = async () => {
      try {
        const data = await getAllPlans();
        setPlans(data);
      } catch (error) {
        toast({
          title: 'Error',
          description: 'Failed to load plans',
          variant: 'destructive',
        });
      } finally {
        setLoading(false);
      }
    };
    fetchPlans();
  }, [toast]);

  const handleSeed = async () => {
    setSeeding(true);
    try {
      await seedPlans();
      const data = await getAllPlans();
      setPlans(data);
      toast({ title: 'Plans seeded', description: 'All 4 plans + comparison table written to Firestore.' });
    } catch {
      toast({ title: 'Seed failed', description: 'Could not seed plans. Check console.', variant: 'destructive' });
    } finally {
      setSeeding(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-6xl mx-auto space-y-6 p-6"
    >
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-3">
          <Button variant="ghost" size="icon" className="mt-1 shrink-0" onClick={() => navigate('/admin/landing')}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold">Manage Plans</h1>
            <p className="text-muted-foreground">
              Edit pricing, features, and limits for each plan
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          onClick={handleSeed}
          disabled={seeding}
          className="gap-2 shrink-0"
        >
          <RefreshCw className={`w-4 h-4 ${seeding ? 'animate-spin' : ''}`} />
          {seeding ? 'Seeding...' : plans.length === 0 ? 'Seed Plans' : 'Re-seed Plans'}
        </Button>
      </div>

      {/* Plans Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {plans.map((plan, idx) => (
          <motion.div
            key={plan.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.1 }}
          >
            <Card className="flex flex-col h-full hover:shadow-lg transition-shadow">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle>{plan.name}</CardTitle>
                    <CardDescription className="mt-2">{plan.description}</CardDescription>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="flex-1 space-y-4">
                {/* Price */}
                <div className="flex items-center gap-2 text-lg font-semibold">
                  <DollarSign className="w-5 h-5 text-green-600" />
                  {plan.pricing?.monthly === 0 && plan.pricing?.yearly === 0 ? 'Custom' : `$${plan.pricing?.monthly}/mo`}
                </div>

                {/* Limits */}
                <div className="space-y-2 text-sm">
                  <div className="flex items-center justify-between text-muted-foreground">
                    <span>Messages/month:</span>
                    <span className="font-medium text-foreground">
                      {plan.limits.messagesPerMonth.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-muted-foreground">
                    <span>AI Tokens/month:</span>
                    <span className="font-medium text-foreground">
                      {plan.limits.aiTokensPerMonth.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Users className="w-4 h-4" />
                    <span>{plan.limits.teamMembers} team members</span>
                  </div>
                </div>

                {/* Feature Count */}
                <div className="text-sm text-muted-foreground">
                  {Object.values(plan.features).reduce((count, category) => {
                    if (!category) return count;
                    return count + Object.values(category).filter(Boolean).length;
                  }, 0)}{' '}
                  features enabled
                </div>

                {/* Last Updated */}
                {plan.updatedAt && (
                  <div className="text-xs text-muted-foreground">
                    Updated: {new Date(plan.updatedAt).toLocaleDateString()}
                  </div>
                )}

                {plan.enforcedAt && (
                  <div className="text-xs bg-green-100 text-green-800 p-2 rounded">
                    Enforced: {new Date(plan.enforcedAt).toLocaleDateString()}
                  </div>
                )}
              </CardContent>

              {/* Actions */}
              <div className="px-6 py-4 border-t">
                <Button
                  onClick={() => navigate(`/admin/plans/${plan.id}`)}
                  className="w-full gap-2"
                  variant="outline"
                >
                  <Edit2 className="w-4 h-4" />
                  Edit Plan
                </Button>
              </div>
            </Card>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}
