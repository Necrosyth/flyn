import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from "react";
import { walletApi, WalletBalance } from "@/services/walletApi";
import { useAuth } from "@/contexts/AuthContext";
import { isDemoModeEnabled } from "@/lib/demo-mode";

interface WalletContextType {
  balance: WalletBalance | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

const WalletContext = createContext<WalletContextType | undefined>(undefined);

export function WalletProvider({ children }: { children: ReactNode }) {
  const demoMode = isDemoModeEnabled();
  const [balance, setBalance] = useState<WalletBalance | null>(null);
  const [loading, setLoading] = useState(demoMode);
  const [error, setError] = useState<string | null>(null);
  const { user, isAuthInitializing } = useAuth();

  const refresh = useCallback(async () => {
    if (demoMode) {
      setBalance({
        tenantId: "demo-org",
        balance: 10000,
        totalPurchased: 10000,
        totalUsed: 0,
        updatedAt: new Date().toISOString(),
      });
      setError(null);
      setLoading(false);
      return;
    }
    if (!user) {
      console.debug("[WalletContext] Skipping refresh: no user");
      return;
    }
    console.debug("[WalletContext] Refreshing wallet for user:", {
      userId: user.id,
      organizationId: user.organizationId,
      email: user.email,
    });
    setLoading(true);
    setError(null);
    try {
      const data = await walletApi.getBalance();
      console.debug("[WalletContext] Wallet balance loaded:", data);
      setBalance(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load wallet balance";
      console.error("[WalletContext] Error loading balance:", {
        message,
        error: err instanceof Error ? err.stack : err,
      });
      setError(message);
      // Don't block rendering - continue with null balance
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (user && !isAuthInitializing) {
      refresh();
    }
  }, [user?.id, isAuthInitializing, refresh, demoMode]);

  return (
    <WalletContext.Provider value={{ balance, loading, error, refresh }}>
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet() {
  const context = useContext(WalletContext);
  if (!context) {
    throw new Error("useWallet must be used within WalletProvider");
  }
  return context;
}
