// ============================================================
// Types & Interfaces for AgroTech Admin
// ============================================================

export interface User {
  id: string;
  fullName: string;
  email: string;
  role: 'admin' | 'agronomist' | 'viewer';
  avatar?: string;
  initials: string;
  phone?: string;
  bio?: string;
  facility?: string;
  sector?: string;
}

export interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

export interface NavItem {
  icon: string;
  label: string;
  path?: string;
  children?: NavItem[];
  badge?: number;
}

export interface MetricCard {
  label: string;
  value: string;
  icon: string;
  trend: 'up' | 'down' | 'flat';
  trendLabel: string;
  colorClass: string;
}

export interface Alert {
  id: string;
  type: 'critical' | 'warning' | 'info';
  title: string;
  message: string;
  icon: string;
}

export interface FieldData {
  id: string;
  name: string;
  crop: string;
  hectares: number;
  moisture: number;
  status: 'healthy' | 'attention' | 'critical';
  image?: string;
}

export interface WeatherData {
  temperature: number;
  condition: string;
  humidity: number;
  wind: string;
  precipitation: string;
  uvIndex: string;
}

export interface LoginCredentials {
  email: string;
  password: string;
  rememberMe: boolean;
}

export interface RegisterData {
  fullName: string;
  email: string;
  facility: string;
  password: string;
  confirmPassword: string;
  acceptTerms: boolean;
}

export interface ThemeMode {
  isDark: boolean;
  toggle: () => void;
}
