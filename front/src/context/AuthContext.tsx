import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import type { User, AuthState } from '@/types';

interface LoginResult {
  success: boolean;
  redirectTo: string;
  error?: string;
  requires_state_selection?: boolean;
}

interface AuthContextType extends AuthState {
  login: (nombreUsuario: string, password: string) => Promise<LoginResult>;
  logout: () => void;
  register: (data: {
    fullName: string;
    email: string;
    password: string;
    estadosIds: number[];
    rolId: number;
    figuraCooperadoraId?: number | null;
  }) => Promise<LoginResult>;
  completeStateSelection: (estadoId: number) => Promise<LoginResult>;
}

const STATE_SELECT_TOKEN_KEY = 'sigmod_state_select_token';
const STATE_SELECT_STATES_KEY = 'sigmod_state_select_states';
const STATE_SELECT_USER_KEY = 'sigmod_state_select_user';

const AuthContext = createContext<AuthContextType | null>(null);
const TOKEN_KEY = 'sigmod_token';
const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api/v1';

interface ApiUser {
  id: string;
  full_name?: string;
  fullName?: string;
  email: string;
  role: 'admin' | 'agronomist' | 'viewer';
  initials?: string;
  facility?: string;
  phone?: string;
  bio?: string;
  sector?: string;
}

interface MeApiResponse {
  user: ApiUser;
}

interface AuthApiResponse {
  access_token: string | null;
  token_type: string | null;
  requires_state_selection?: boolean;
  state_selection_token?: string | null;
  available_states?: Array<{ id: number; clave: string; nombre: string }>;
  user: ApiUser;
}

function toUser(raw: ApiUser): User {
  const fullName = raw.fullName ?? raw.full_name ?? 'Usuario';
  const names = fullName
    .split(' ')
    .map((n) => n.trim())
    .filter(Boolean);
  const initials = raw.initials ?? (names[0]?.[0] ?? 'U') + (names[1]?.[0] ?? '');
  return {
    id: raw.id,
    fullName,
    email: raw.email,
    role: raw.role,
    initials: initials.toUpperCase(),
    facility: raw.facility,
    phone: raw.phone,
    bio: raw.bio,
    sector: raw.sector,
  };
}

class ApiError extends Error {
  status: number;
  retryAfter?: number;
  constructor(message: string, status: number, retryAfter?: number) {
    super(message);
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

function describeAuthError(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    if (err.status === 429) {
      return err.message || 'Demasiados intentos. Espera unos minutos antes de volver a intentarlo.';
    }
    if (err.status === 401 || err.status === 403) {
      return err.message || fallback;
    }
    if (err.status >= 500) {
      return 'El servidor no está respondiendo. Intenta en unos momentos.';
    }
    return err.message || fallback;
  }
  return fallback;
}

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
    const retryAfter = Number(response.headers.get('Retry-After')) || undefined;
    throw new ApiError(detail, response.status, retryAfter);
  }

  return (await response.json()) as T;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    isAuthenticated: false,
    isLoading: true,
  });

  // setState en early-return y bootstrap es patrón legítimo de "cargar sesión
  // al montar"; la regla v6 sobre-marca setState síncronos en useEffect.
  useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setState((prev) => ({ ...prev, isLoading: false }));
      return;
    }

    const bootstrap = async () => {
      setState((prev) => ({ ...prev, isLoading: true }));
      try {
        const me = await apiRequest<ApiUser | MeApiResponse>('/auth/me', {
          headers: { Authorization: `Bearer ${token}` },
        });
        const user = 'user' in me ? me.user : me;
        setState({ user: toUser(user), isAuthenticated: true, isLoading: false });
      } catch {
        localStorage.removeItem(TOKEN_KEY);
        setState({ user: null, isAuthenticated: false, isLoading: false });
      }
    };

    void bootstrap();
  }, []);

  const login = useCallback(async (nombreUsuario: string, password: string): Promise<LoginResult> => {
    setState((prev) => ({ ...prev, isLoading: true }));
    try {
      const data = await apiRequest<AuthApiResponse>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          nombre_usuario: nombreUsuario,
          password,
        }),
      });

      let accessToken = data.access_token;
      const availableStates = data.available_states ?? [];

      // Si solo hay 1 estado, auto-seleccionarlo para no molestar al usuario.
      // Si hay >1 estado, derivar a la pantalla de selección /select-state.
      if (!accessToken && data.requires_state_selection && data.state_selection_token && availableStates.length === 1) {
        const selected = await apiRequest<AuthApiResponse>('/auth/select-state', {
          method: 'POST',
          body: JSON.stringify({
            state_selection_token: data.state_selection_token,
            estado_id: availableStates[0].id,
          }),
        });
        accessToken = selected.access_token;
      } else if (!accessToken && data.requires_state_selection && data.state_selection_token && availableStates.length > 1) {
        sessionStorage.setItem(STATE_SELECT_TOKEN_KEY, data.state_selection_token);
        sessionStorage.setItem(STATE_SELECT_STATES_KEY, JSON.stringify(availableStates));
        sessionStorage.setItem(STATE_SELECT_USER_KEY, JSON.stringify(data.user));
        setState((prev) => ({ ...prev, isLoading: false }));
        return { success: true, redirectTo: '/select-state', requires_state_selection: true };
      }

      if (!accessToken) {
        setState((prev) => ({ ...prev, isLoading: false }));
        return { success: false, redirectTo: '/login' };
      }

      localStorage.setItem(TOKEN_KEY, accessToken);
      setState({ user: toUser(data.user), isAuthenticated: true, isLoading: false });
      let redirectTo = '/';
      try {
        const hint = await apiRequest<{ redirect_to?: string }>('/solicitudes/routing-hint', {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (hint.redirect_to) redirectTo = hint.redirect_to;
      } catch {
        redirectTo = '/';
      }
      return { success: true, redirectTo };
    } catch (err) {
      setState((prev) => ({ ...prev, isLoading: false }));
      const error = describeAuthError(err, 'Credenciales incorrectas.');
      return { success: false, redirectTo: '/login', error };
    }
  }, []);

  const completeStateSelection = useCallback(async (estadoId: number): Promise<LoginResult> => {
    const token = sessionStorage.getItem(STATE_SELECT_TOKEN_KEY);
    const userRaw = sessionStorage.getItem(STATE_SELECT_USER_KEY);
    if (!token || !userRaw) {
      return { success: false, redirectTo: '/login', error: 'Sesión de selección expirada. Vuelve a iniciar sesión.' };
    }
    setState((prev) => ({ ...prev, isLoading: true }));
    try {
      const selected = await apiRequest<AuthApiResponse>('/auth/select-state', {
        method: 'POST',
        body: JSON.stringify({ state_selection_token: token, estado_id: estadoId }),
      });
      if (!selected.access_token) {
        setState((prev) => ({ ...prev, isLoading: false }));
        return { success: false, redirectTo: '/select-state', error: 'No se pudo completar el inicio de sesión.' };
      }
      localStorage.setItem(TOKEN_KEY, selected.access_token);
      sessionStorage.removeItem(STATE_SELECT_TOKEN_KEY);
      sessionStorage.removeItem(STATE_SELECT_STATES_KEY);
      sessionStorage.removeItem(STATE_SELECT_USER_KEY);
      const userData = selected.user ?? (JSON.parse(userRaw) as ApiUser);
      setState({ user: toUser(userData), isAuthenticated: true, isLoading: false });
      let redirectTo = '/';
      try {
        const hint = await apiRequest<{ redirect_to?: string }>('/solicitudes/routing-hint', {
          headers: { Authorization: `Bearer ${selected.access_token}` },
        });
        if (hint.redirect_to) redirectTo = hint.redirect_to;
      } catch {
        redirectTo = '/';
      }
      return { success: true, redirectTo };
    } catch (err) {
      setState((prev) => ({ ...prev, isLoading: false }));
      const error = describeAuthError(err, 'No se pudo completar el inicio de sesión.');
      return { success: false, redirectTo: '/select-state', error };
    }
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    setState({ user: null, isAuthenticated: false, isLoading: false });
  }, []);

  const register = useCallback(async (data: {
    fullName: string;
    email: string;
    password: string;
    estadosIds: number[];
    rolId: number;
    figuraCooperadoraId?: number | null;
  }): Promise<LoginResult> => {
    setState((prev) => ({ ...prev, isLoading: true }));
    try {
      const response = await apiRequest<AuthApiResponse>('/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          full_name: data.fullName,
          email: data.email,
          password: data.password,
          estados_ids: data.estadosIds,
          rol_id: data.rolId,
          figura_cooperadora_id: data.figuraCooperadoraId ?? null,
        }),
      });

      let accessToken = response.access_token;
      if (!accessToken && response.requires_state_selection && response.state_selection_token && response.available_states?.length) {
        const selected = await apiRequest<AuthApiResponse>('/auth/select-state', {
          method: 'POST',
          body: JSON.stringify({
            state_selection_token: response.state_selection_token,
            estado_id: response.available_states[0].id,
          }),
        });
        accessToken = selected.access_token;
      }

      if (!accessToken) {
        setState((prev) => ({ ...prev, isLoading: false }));
        return { success: false, redirectTo: '/register' };
      }

      localStorage.setItem(TOKEN_KEY, accessToken);
      setState({ user: toUser(response.user), isAuthenticated: true, isLoading: false });
      return { success: true, redirectTo: '/solicitud-acceso?new=1' };
    } catch (err) {
      setState((prev) => ({ ...prev, isLoading: false }));
      const error = describeAuthError(err, 'No se pudo completar el registro.');
      return { success: false, redirectTo: '/register', error };
    }
  }, []);

  return (
    <AuthContext.Provider value={{ ...state, login, logout, register, completeStateSelection }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
