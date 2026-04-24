import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';

const TOKEN_KEY = 'sigmod_legacy_token';
const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api/v1';

export interface LegacyUser {
  id: number;
  usuario: string;
  nombre: string | null;
  nivel: number;
  legacy_db: string;
  nombre_estado: string;
}

export interface LegacyBaseOption {
  clave: string;
  nombre_estado: string;
}

interface LegacyAuthState {
  user: LegacyUser | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

interface LegacyAuthContextType extends LegacyAuthState {
  login: (legacyDb: string, usuario: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
  fetchBases: () => Promise<LegacyBaseOption[]>;
}

const LegacyAuthContext = createContext<LegacyAuthContextType | null>(null);

async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    ...init,
  });
  if (!response.ok) {
    let detail = `API_ERROR_${response.status}`;
    try {
      const body = (await response.json()) as { detail?: string };
      if (body?.detail) detail = body.detail;
    } catch {
      // keep default
    }
    const error = new Error(detail);
    (error as Error & { status?: number }).status = response.status;
    throw error;
  }
  return (await response.json()) as T;
}

export function LegacyAuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<LegacyAuthState>({
    user: null,
    token: null,
    isAuthenticated: false,
    isLoading: true,
  });

  // setState en early-return y bootstrap es patrón legítimo de "cargar sesión
  // legacy al montar"; la regla v6 sobre-marca setState síncronos en useEffect.
  useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setState((prev) => ({ ...prev, isLoading: false }));
      return;
    }
    const bootstrap = async () => {
      try {
        const me = await apiRequest<LegacyUser>('/legacy/auth/me', {
          headers: { Authorization: `Bearer ${token}` },
        });
        setState({ user: me, token, isAuthenticated: true, isLoading: false });
      } catch {
        localStorage.removeItem(TOKEN_KEY);
        setState({ user: null, token: null, isAuthenticated: false, isLoading: false });
      }
    };
    void bootstrap();
  }, []);

  const login = useCallback(
    async (legacyDb: string, usuario: string, password: string): Promise<{ success: boolean; error?: string }> => {
      setState((prev) => ({ ...prev, isLoading: true }));
      try {
        const data = await apiRequest<{ access_token: string; user: LegacyUser }>('/legacy/auth/login', {
          method: 'POST',
          body: JSON.stringify({ legacy_db: legacyDb, usuario, password }),
        });
        localStorage.setItem(TOKEN_KEY, data.access_token);
        setState({
          user: data.user,
          token: data.access_token,
          isAuthenticated: true,
          isLoading: false,
        });
        return { success: true };
      } catch (err) {
        setState((prev) => ({ ...prev, isLoading: false }));
        const message = err instanceof Error ? err.message : 'Error de conexión';
        return { success: false, error: message };
      }
    },
    [],
  );

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    setState({ user: null, token: null, isAuthenticated: false, isLoading: false });
  }, []);

  const fetchBases = useCallback(async (): Promise<LegacyBaseOption[]> => {
    try {
      return await apiRequest<LegacyBaseOption[]>('/legacy/auth/bases-disponibles');
    } catch {
      return [];
    }
  }, []);

  return (
    <LegacyAuthContext.Provider value={{ ...state, login, logout, fetchBases }}>
      {children}
    </LegacyAuthContext.Provider>
  );
}

export function useLegacyAuth(): LegacyAuthContextType {
  const ctx = useContext(LegacyAuthContext);
  if (!ctx) throw new Error('useLegacyAuth must be used within LegacyAuthProvider');
  return ctx;
}
