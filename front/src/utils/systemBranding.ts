export interface PublicSystemAssets {
  favicon_url: string;
  login_logo_url: string;
  dashboard_logo_url: string;
  report_logo_url: string;
}

export interface PublicSystemInfo {
  full_name: string;
  short_name: string;
}

export interface PublicSystemSecurity {
  session_timeout_minutes: number;
  session_warning_seconds: number;
}

export interface PublicSystemConfig {
  assets: PublicSystemAssets;
  system: PublicSystemInfo;
  security: PublicSystemSecurity;
}

export const PUBLIC_ASSETS_STORAGE_KEY = 'sigmod_public_assets';
export const PUBLIC_CONFIG_STORAGE_KEY = 'sigmod_public_config';

export const DEFAULT_SYSTEM_ASSETS: PublicSystemAssets = {
  favicon_url: '/favicon.ico',
  login_logo_url: '/logoSigmod3.png',
  dashboard_logo_url: '/logoSigmod3_large.svg',
  report_logo_url: '/logoSigmod3.png',
};

export const DEFAULT_SYSTEM_INFO: PublicSystemInfo = {
  full_name: 'Sistema para la Gestion de Moscas de la Fruta y Operaciones de Campo',
  short_name: 'SIGMOD 3',
};

export const DEFAULT_SYSTEM_SECURITY: PublicSystemSecurity = {
  session_timeout_minutes: 30,
  session_warning_seconds: 60,
};

export const DEFAULT_INSTITUTIONAL_LOGO = '/logo_Agricultura_Senasica.png';
export const DEFAULT_DASHBOARD_ICON = '/icono.svg';

function getApiOrigin(): string {
  const apiBase = import.meta.env.VITE_API_URL ?? '';
  try {
    return new URL(apiBase).origin;
  } catch {
    return window.location.origin;
  }
}

export function resolveSystemAssetUrl(url: string): string {
  const value = url.trim();
  if (!value) return value;
  if (/^https?:\/\//i.test(value)) return value;
  if (value.startsWith('/api/')) {
    return `${getApiOrigin()}${value}`;
  }
  return value;
}

export function normalizePublicAssets(input: unknown): PublicSystemAssets {
  const obj = (input ?? {}) as Record<string, unknown>;
  return {
    favicon_url: typeof obj.favicon_url === 'string' && obj.favicon_url.trim()
      ? resolveSystemAssetUrl(obj.favicon_url)
      : DEFAULT_SYSTEM_ASSETS.favicon_url,
    login_logo_url: typeof obj.login_logo_url === 'string' && obj.login_logo_url.trim()
      ? resolveSystemAssetUrl(obj.login_logo_url)
      : DEFAULT_SYSTEM_ASSETS.login_logo_url,
    dashboard_logo_url: typeof obj.dashboard_logo_url === 'string' && obj.dashboard_logo_url.trim()
      ? resolveSystemAssetUrl(obj.dashboard_logo_url)
      : DEFAULT_SYSTEM_ASSETS.dashboard_logo_url,
    report_logo_url: typeof obj.report_logo_url === 'string' && obj.report_logo_url.trim()
      ? resolveSystemAssetUrl(obj.report_logo_url)
      : DEFAULT_SYSTEM_ASSETS.report_logo_url,
  };
}

export function normalizePublicSystemInfo(input: unknown): PublicSystemInfo {
  const obj = (input ?? {}) as Record<string, unknown>;
  return {
    full_name: typeof obj.full_name === 'string' && obj.full_name.trim()
      ? obj.full_name
      : DEFAULT_SYSTEM_INFO.full_name,
    short_name: typeof obj.short_name === 'string' && obj.short_name.trim()
      ? obj.short_name
      : DEFAULT_SYSTEM_INFO.short_name,
  };
}

export function normalizePublicSecurity(input: unknown): PublicSystemSecurity {
  const obj = (input ?? {}) as Record<string, unknown>;
  const timeoutRaw = obj.session_timeout_minutes;
  const warningRaw = obj.session_warning_seconds;
  const timeout = typeof timeoutRaw === 'number' ? timeoutRaw : Number(timeoutRaw ?? DEFAULT_SYSTEM_SECURITY.session_timeout_minutes);
  const warning = typeof warningRaw === 'number' ? warningRaw : Number(warningRaw ?? DEFAULT_SYSTEM_SECURITY.session_warning_seconds);
  return {
    session_timeout_minutes: Number.isFinite(timeout)
      ? Math.min(Math.max(Math.trunc(timeout), 1), 24 * 60)
      : DEFAULT_SYSTEM_SECURITY.session_timeout_minutes,
    session_warning_seconds: Number.isFinite(warning)
      ? Math.min(Math.max(Math.trunc(warning), 10), 10 * 60)
      : DEFAULT_SYSTEM_SECURITY.session_warning_seconds,
  };
}

export function normalizePublicConfig(input: unknown): PublicSystemConfig {
  const obj = (input ?? {}) as Record<string, unknown>;
  return {
    assets: normalizePublicAssets(obj.assets),
    system: normalizePublicSystemInfo(obj.system),
    security: normalizePublicSecurity(obj.security),
  };
}

export function getStoredPublicAssets(): PublicSystemAssets {
  const raw = localStorage.getItem(PUBLIC_ASSETS_STORAGE_KEY);
  if (!raw) return DEFAULT_SYSTEM_ASSETS;
  try {
    return normalizePublicAssets(JSON.parse(raw));
  } catch {
    return DEFAULT_SYSTEM_ASSETS;
  }
}

export function getStoredPublicConfig(): PublicSystemConfig {
  const raw = localStorage.getItem(PUBLIC_CONFIG_STORAGE_KEY);
  if (!raw) {
    return {
      assets: DEFAULT_SYSTEM_ASSETS,
      system: DEFAULT_SYSTEM_INFO,
      security: DEFAULT_SYSTEM_SECURITY,
    };
  }
  try {
    return normalizePublicConfig(JSON.parse(raw));
  } catch {
    return {
      assets: DEFAULT_SYSTEM_ASSETS,
      system: DEFAULT_SYSTEM_INFO,
      security: DEFAULT_SYSTEM_SECURITY,
    };
  }
}

function persistPublicConfig(config: PublicSystemConfig): void {
  localStorage.setItem(PUBLIC_ASSETS_STORAGE_KEY, JSON.stringify(config.assets));
  localStorage.setItem(PUBLIC_CONFIG_STORAGE_KEY, JSON.stringify(config));
}

export async function fetchPublicConfig(apiBase: string): Promise<PublicSystemConfig> {
  const response = await fetch(`${apiBase}/configuracion-sistema/publico`);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const normalized = normalizePublicConfig(await response.json());
  persistPublicConfig(normalized);
  return normalized;
}

export async function fetchPublicAssets(apiBase: string): Promise<PublicSystemAssets> {
  const config = await fetchPublicConfig(apiBase);
  return config.assets;
}

export function applySystemIdentity(system: PublicSystemInfo): void {
  const title = system.short_name?.trim() || DEFAULT_SYSTEM_INFO.short_name;
  document.title = title;
}
