import { createContext, useContext, useState, ReactNode } from 'react';
import type { MultiFactorResolver } from 'firebase/auth';

interface MfaContextType {
  resolver: MultiFactorResolver | null;
  setResolver: (resolver: MultiFactorResolver | null) => void;
  from: string | null;
  setFrom: (from: string | null) => void;
}

const MfaContext = createContext<MfaContextType | undefined>(undefined);

export function MfaProvider({ children }: { children: ReactNode }) {
  const [resolver, setResolver] = useState<MultiFactorResolver | null>(null);
  const [from, setFrom] = useState<string | null>(null);

  return (
    <MfaContext.Provider value={{ resolver, setResolver, from, setFrom }}>
      {children}
    </MfaContext.Provider>
  );
}

export function useMfa() {
  const context = useContext(MfaContext);
  if (!context) {
    throw new Error('useMfa must be used within MfaProvider');
  }
  return context;
}
