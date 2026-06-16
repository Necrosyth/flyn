import { API_BASE_URL } from "@/lib/api";
import { authedFetch } from "@/services/authApi";

export interface WalletBalance {
  tenantId: string;
  balance: number;
  totalPurchased: number;
  totalUsed: number;
  updatedAt: string;
}

export interface WalletTransaction {
  id: string;
  type: 'topup' | 'usage' | 'refund';
  amount: number;
  description: string;
  feature: 'website_builder' | 'ai_credits' | 'domain' | 'calls' | 'manual';
  paymentId?: string;
  websiteId?: string;
  timestamp: string;
}

const base = `${API_BASE_URL}/wallet`;

async function parseError(resp: Response): Promise<string> {
  const text = await resp.text().catch(() => "");
  return text || resp.statusText;
}

export const walletApi = {
  async getBalance(): Promise<WalletBalance> {
    const url = `${base}/balance`;
    console.debug("[walletApi] Fetching balance from:", url);
    try {
      const resp = await authedFetch(url);
      console.debug("[walletApi] Response status:", resp.status, resp.statusText);
      if (!resp.ok) {
        const errorText = await parseError(resp);
        console.error("[walletApi] Error response:", errorText);
        throw new Error(errorText);
      }
      const data = await resp.json();
      console.debug("[walletApi] Balance data:", data);
      return data;
    } catch (err) {
      console.error("[walletApi] Fetch error:", err instanceof Error ? err.message : err);
      throw err;
    }
  },

  async getTransactions(limit: number = 50): Promise<WalletTransaction[]> {
    const url = `${base}/transactions?limit=${limit}`;
    console.debug("[walletApi] Fetching transactions from:", url);
    try {
      const resp = await authedFetch(url);
      console.debug("[walletApi] Response status:", resp.status, resp.statusText);
      if (!resp.ok) {
        const errorText = await parseError(resp);
        console.error("[walletApi] Error response:", errorText);
        throw new Error(errorText);
      }
      const data = await resp.json();
      console.debug("[walletApi] Transactions data:", data);
      return data;
    } catch (err) {
      console.error("[walletApi] Fetch error:", err instanceof Error ? err.message : err);
      throw err;
    }
  },
};
