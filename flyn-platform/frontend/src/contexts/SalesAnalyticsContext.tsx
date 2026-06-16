import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { authedFetch } from "@/services/authApi";
import { API_BASE_URL } from "@/lib/api";

export interface SalesMetrics {
  totalRevenue: number;
  monthlyRevenue: number;
  yearlyRevenue: number;
  revenueGrowth: number;
  totalCustomers: number;
  newCustomersThisMonth: number;
  customerGrowth: number;
  avgRevenuePerUser: number;
  churnRate: number;
  conversionRate: number;
  activePlans: { planId: string; planName: string; count: number; revenue: number }[];
}

export interface RevenueDataPoint {
  date: string;
  revenue: number;
  subscriptions: number;
  oneTime: number;
}

export interface CustomerDataPoint {
  date: string;
  total: number;
  new: number;
  churned: number;
}

export interface Transaction {
  id: string;
  customerId: string;
  customerName: string;
  customerEmail: string;
  amount: number;
  currency: string;
  status: "succeeded" | "pending" | "failed" | "refunded";
  type: "subscription" | "one_time";
  planName?: string;
  createdAt: string;
}

export interface StripeConnection {
  isConnected: boolean;
  accountId?: string;
  accountName?: string;
  liveMode: boolean;
  connectedAt?: string;
}

interface SalesAnalyticsContextType {
  metrics: SalesMetrics;
  revenueHistory: RevenueDataPoint[];
  customerHistory: CustomerDataPoint[];
  recentTransactions: Transaction[];
  stripeConnection: StripeConnection;
  connectStripe: () => Promise<void>;
  disconnectStripe: () => Promise<void>;
  refreshMetrics: () => Promise<void>;
  isLoading: boolean;
}

// Mock data for demo
const mockMetrics: SalesMetrics = {
  totalRevenue: 125430,
  monthlyRevenue: 12540,
  yearlyRevenue: 125430,
  revenueGrowth: 23.5,
  totalCustomers: 847,
  newCustomersThisMonth: 68,
  customerGrowth: 12.3,
  avgRevenuePerUser: 148,
  churnRate: 2.4,
  conversionRate: 8.7,
  activePlans: [
    { planId: "free", planName: "Free", count: 423, revenue: 0 },
    { planId: "growth", planName: "Growth", count: 312, revenue: 15288 },
    { planId: "enterprise", planName: "Enterprise", count: 112, revenue: 22288 },
  ],
};

const mockRevenueHistory: RevenueDataPoint[] = Array.from({ length: 30 }, (_, i) => {
  const date = new Date();
  date.setDate(date.getDate() - (29 - i));
  return {
    date: date.toISOString().split("T")[0],
    revenue: Math.floor(Math.random() * 2000) + 800,
    subscriptions: Math.floor(Math.random() * 1500) + 600,
    oneTime: Math.floor(Math.random() * 500) + 200,
  };
});

const mockCustomerHistory: CustomerDataPoint[] = Array.from({ length: 30 }, (_, i) => {
  const date = new Date();
  date.setDate(date.getDate() - (29 - i));
  return {
    date: date.toISOString().split("T")[0],
    total: 750 + i * 3 + Math.floor(Math.random() * 10),
    new: Math.floor(Math.random() * 8) + 2,
    churned: Math.floor(Math.random() * 3),
  };
});

const mockTransactions: Transaction[] = [
  { id: "txn_1", customerId: "cus_1", customerName: "John Doe", customerEmail: "john@example.com", amount: 4900, currency: "usd", status: "succeeded", type: "subscription", planName: "Pro", createdAt: new Date().toISOString() },
  { id: "txn_2", customerId: "cus_2", customerName: "Jane Smith", customerEmail: "jane@example.com", amount: 19900, currency: "usd", status: "succeeded", type: "subscription", planName: "Enterprise", createdAt: new Date(Date.now() - 3600000).toISOString() },
  { id: "txn_3", customerId: "cus_3", customerName: "Bob Wilson", customerEmail: "bob@example.com", amount: 4900, currency: "usd", status: "pending", type: "subscription", planName: "Pro", createdAt: new Date(Date.now() - 7200000).toISOString() },
  { id: "txn_4", customerId: "cus_4", customerName: "Alice Brown", customerEmail: "alice@example.com", amount: 9900, currency: "usd", status: "succeeded", type: "one_time", createdAt: new Date(Date.now() - 86400000).toISOString() },
  { id: "txn_5", customerId: "cus_5", customerName: "Charlie Davis", customerEmail: "charlie@example.com", amount: 4900, currency: "usd", status: "refunded", type: "subscription", planName: "Pro", createdAt: new Date(Date.now() - 172800000).toISOString() },
];

const SalesAnalyticsContext = createContext<SalesAnalyticsContextType | undefined>(undefined);

export function SalesAnalyticsProvider({ children }: { children: ReactNode }) {
  const [metrics, setMetrics] = useState<SalesMetrics>(mockMetrics);
  const [revenueHistory, setRevenueHistory] = useState<RevenueDataPoint[]>(mockRevenueHistory);
  const [customerHistory, setCustomerHistory] = useState<CustomerDataPoint[]>(mockCustomerHistory);
  const [recentTransactions, setRecentTransactions] = useState<Transaction[]>(mockTransactions);
  const [stripeConnection, setStripeConnection] = useState<StripeConnection>({ isConnected: false, liveMode: false });
  const [isLoading, setIsLoading] = useState(false);

  const fetchMetrics = async () => {
    setIsLoading(true);
    try {
      const resp = await authedFetch(`${API_BASE_URL}/billing/admin/metrics`);
      if (!resp.ok) return;
      const data = await resp.json() as {
        isConnected: boolean;
        metrics: SalesMetrics;
        transactions: Transaction[];
        revenueHistory?: RevenueDataPoint[];
        customerHistory?: CustomerDataPoint[];
      };
      setStripeConnection({ isConnected: data.isConnected, liveMode: true });
      if (data.metrics) setMetrics(data.metrics);
      if (data.transactions?.length) setRecentTransactions(data.transactions);
      if (data.revenueHistory?.length) setRevenueHistory(data.revenueHistory);
      if (data.customerHistory?.length) setCustomerHistory(data.customerHistory);
    } catch { /* fall back to mock data */ }
    finally { setIsLoading(false); }
  };

  useEffect(() => { fetchMetrics(); }, []);

  const connectStripe = async () => { /* Stripe key is server-side only */ };
  const disconnectStripe = async () => { /* Stripe key is server-side only */ };
  const refreshMetrics = async () => { await fetchMetrics(); };

  return (
    <SalesAnalyticsContext.Provider
      value={{
        metrics,
        revenueHistory,
        customerHistory,
        recentTransactions,
        stripeConnection,
        connectStripe,
        disconnectStripe,
        refreshMetrics,
        isLoading,
      }}
    >
      {children}
    </SalesAnalyticsContext.Provider>
  );
}

export function useSalesAnalytics() {
  const context = useContext(SalesAnalyticsContext);
  if (context === undefined) {
    throw new Error("useSalesAnalytics must be used within a SalesAnalyticsProvider");
  }
  return context;
}
