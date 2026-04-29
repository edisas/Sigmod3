import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import SistemaVersionEditor from '@/components/admin/SistemaVersionEditor';
import { applyPalette, type SystemPalette } from '@/utils/palette';
import {
  PUBLIC_ASSETS_STORAGE_KEY,
  PUBLIC_CONFIG_STORAGE_KEY,
  applySystemIdentity,
  normalizePublicAssets,
  normalizePublicSecurity,
  normalizePublicSystemInfo,
} from '@/utils/systemBranding';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api/v1';
const TOKEN_KEY = 'sigmod_token';
const PALETTE_STORAGE_KEY = 'sigmod_palette';

interface SystemConfig {
  navigation: {
    main_menus: MenuNode[];
  };
  system: {
    full_name: string;
    short_name: string;
  };
  assets: {
    favicon_url: string;
    login_logo_url: string;
    dashboard_logo_url: string;
    report_logo_url: string;
  };
  keys: {
    google_maps_key: string;
    captcha_site_key: string;
    captcha_secret_key: string;
  };
  security: {
    two_factor_enabled: boolean;
    session_timeout_minutes: number;
    session_warning_seconds: number;
  };
  palette: {
    active_key: string;
    presets: Record<string, SystemPalette>;
    custom: SystemPalette;
  };
}

type MenuNodeType = 'group' | 'link' | 'separator';

interface MenuNode {
  id: string;
  type: MenuNodeType;
  label: string;
  icon?: string;
  path?: string;
  children: MenuNode[];
}

function menuNodeId(): string {
  return `menu_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function createNode(type: MenuNodeType = 'group'): MenuNode {
  return {
    id: menuNodeId(),
    type,
    label: type === 'separator' ? 'Separador' : 'Nuevo menu',
    icon: type === 'separator' ? '' : 'menu',
    path: type === 'link' ? '/' : '',
    children: [],
  };
}

function deepCloneMenus(items: MenuNode[]): MenuNode[] {
  return JSON.parse(JSON.stringify(items)) as MenuNode[];
}

function normalizeMenuNodes(input: unknown): MenuNode[] {
  if (!Array.isArray(input)) return [];
  return input.map((raw, index) => {
    const node = (raw ?? {}) as Partial<MenuNode>;
    const type: MenuNodeType = node.type === 'link' || node.type === 'separator' ? node.type : 'group';
    const label =
      typeof node.label === 'string' && node.label.trim()
        ? node.label
        : type === 'separator'
          ? `Separador ${index + 1}`
          : `Menu ${index + 1}`;
    return {
      id: typeof node.id === 'string' && node.id.trim() ? node.id : menuNodeId(),
      type,
      label,
      icon: typeof node.icon === 'string' ? node.icon : '',
      path: typeof node.path === 'string' ? node.path : '',
      children: normalizeMenuNodes(node.children),
    };
  });
}

function withUpdatedNode(items: MenuNode[], nodeId: string, updater: (node: MenuNode) => MenuNode): MenuNode[] {
  return items.map((node) => {
    if (node.id === nodeId) return updater(node);
    if (!node.children.length) return node;
    return { ...node, children: withUpdatedNode(node.children, nodeId, updater) };
  });
}

interface FoundNode {
  parent: MenuNode | null;
  index: number;
  siblings: MenuNode[];
}

function findNodeContext(items: MenuNode[], nodeId: string, parent: MenuNode | null = null): FoundNode | null {
  for (let i = 0; i < items.length; i += 1) {
    const node = items[i];
    if (node.id === nodeId) {
      return { parent, index: i, siblings: items };
    }
    const nested = findNodeContext(node.children, nodeId, node);
    if (nested) return nested;
  }
  return null;
}

function removeNode(items: MenuNode[], nodeId: string): { tree: MenuNode[]; removed: MenuNode | null } {
  const cloned = deepCloneMenus(items);
  const context = findNodeContext(cloned, nodeId);
  if (!context) return { tree: cloned, removed: null };
  const [removed] = context.siblings.splice(context.index, 1);
  return { tree: cloned, removed: removed ?? null };
}

function _moveNodeBefore(items: MenuNode[], movingId: string, targetId: string): MenuNode[] {
  if (movingId === targetId) return items;
  const { tree: treeWithoutNode, removed } = removeNode(items, movingId);
  if (!removed) return items;
  const context = findNodeContext(treeWithoutNode, targetId);
  if (!context) return items;
  context.siblings.splice(context.index, 0, removed);
  return treeWithoutNode;
}

function _moveNodeUpDown(items: MenuNode[], nodeId: string, direction: -1 | 1): MenuNode[] {
  const cloned = deepCloneMenus(items);
  const context = findNodeContext(cloned, nodeId);
  if (!context) return items;
  const nextIndex = context.index + direction;
  if (nextIndex < 0 || nextIndex >= context.siblings.length) return items;
  const [node] = context.siblings.splice(context.index, 1);
  context.siblings.splice(nextIndex, 0, node);
  return cloned;
}

function _indentNode(items: MenuNode[], nodeId: string): MenuNode[] {
  const cloned = deepCloneMenus(items);
  const context = findNodeContext(cloned, nodeId);
  if (!context || context.index === 0) return items;
  const previousSibling = context.siblings[context.index - 1];
  if (!previousSibling || previousSibling.type === 'separator') return items;
  const [node] = context.siblings.splice(context.index, 1);
  previousSibling.children = [...previousSibling.children, node];
  return cloned;
}

function _outdentNode(items: MenuNode[], nodeId: string): MenuNode[] {
  const cloned = deepCloneMenus(items);
  const context = findNodeContext(cloned, nodeId);
  if (!context || !context.parent) return items;
  const parentContext = findNodeContext(cloned, context.parent.id);
  if (!parentContext) return items;
  const [node] = context.siblings.splice(context.index, 1);
  parentContext.siblings.splice(parentContext.index + 1, 0, node);
  return cloned;
}

function _addChildNode(items: MenuNode[], parentId: string, type: MenuNodeType): MenuNode[] {
  return withUpdatedNode(items, parentId, (node) => ({
    ...node,
    type: node.type === 'separator' ? 'group' : node.type,
    children: [...node.children, createNode(type)],
  }));
}

function buildDefaultMenus(): MenuNode[] {
  return [
    { id: 'main-operaciones', type: 'group', label: 'Operaciones de Campo', icon: 'dashboard', path: '', children: [] },
    {
      id: 'main-procesos',
      type: 'group',
      label: 'Procesos',
      icon: 'assignment',
      path: '',
      children: [
        {
          id: 'proc-solicitudes',
          type: 'group',
          label: 'Solicitudes de Acceso',
          icon: 'assignment',
          path: '',
          children: [{ id: 'proc-solicitudes-list', type: 'link', label: 'Solicitudes', icon: 'list_alt', path: '/solicitudes', children: [] }],
        },
        { id: 'proc-autorizaciones', type: 'link', label: 'Autorizaciones FCOOP', icon: 'verified_user', path: '/autorizaciones/figura-cooperadora/listado', children: [] },
        {
          id: 'proc-catalogos',
          type: 'group',
          label: 'Catalogos',
          icon: 'inventory_2',
          path: '',
          children: [
            { id: 'proc-catalogos-tipos', type: 'link', label: 'Tipos de FCOOP', icon: 'badge', path: '/catalogos/tipos-fcoop', children: [] },
            { id: 'proc-catalogos-figuras', type: 'link', label: 'Figura Cooperadora', icon: 'group', path: '/catalogos/figuras-cooperadoras', children: [] },
          ],
        },
      ],
    },
    {
      id: 'main-admin',
      type: 'group',
      label: 'Administración',
      icon: 'settings',
      path: '',
      children: [
        {
          id: 'admin-config-general',
          type: 'group',
          label: 'Configuración General',
          icon: 'settings',
          path: '',
          children: [
            {
              id: 'admin-catalogos',
              type: 'group',
              label: 'Catalogos',
              icon: 'inventory_2',
              path: '',
              children: [
                { id: 'admin-estados', type: 'link', label: 'Estados', icon: 'public', path: '/catalogos/estados', children: [] },
                { id: 'admin-municipios', type: 'link', label: 'Municipios', icon: 'location_city', path: '/catalogos/municipios', children: [] },
                { id: 'admin-localidades', type: 'link', label: 'Localidades', icon: 'place', path: '/catalogos/localidades', children: [] },
              ],
            },
            { id: 'admin-config-sistema', type: 'link', label: 'Configuracion del Sistema', icon: 'tune', path: '/configuracion/sistema', children: [] },
          ],
        },
      ],
    },
  ];
}

const EMPTY_CONFIG: SystemConfig = {
  navigation: {
    main_menus: buildDefaultMenus(),
  },
  system: {
    full_name: 'Sistema para la Gestion de Moscas de la Fruta y Operaciones de Campo',
    short_name: 'SIGMOD 3',
  },
  assets: {
    favicon_url: '',
    login_logo_url: '',
    dashboard_logo_url: '',
    report_logo_url: '',
  },
  keys: {
    google_maps_key: '',
    captcha_site_key: '',
    captcha_secret_key: '',
  },
  security: {
    two_factor_enabled: false,
    session_timeout_minutes: 30,
    session_warning_seconds: 60,
  },
  palette: {
    active_key: 'sigmod_actual',
    presets: {},
    custom: {
      name: 'Personalizada',
      colors: {
        primary: '#014421',
        secondary: '#87CEEB',
        accent: '#98FF98',
        neutral_gray: '#D3D3D3',
        background_light: '#F8FDFA',
        background_dark: '#011A0D',
        soft_gray: '#D3D3D3',
        mint: '#98FF98',
        sky_blue: '#87CEEB',
      },
    },
  },
};

function sanitizeColor(value: string): string {
  const hex = value.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(hex)) return hex;
  return '#000000';
}

export default function SystemConfigPage() {
  const token = useMemo(() => localStorage.getItem(TOKEN_KEY), []);
  const [config, setConfig] = useState<SystemConfig>(EMPTY_CONFIG);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [files, setFiles] = useState<{
    favicon: File | null;
    login_logo: File | null;
    dashboard_logo: File | null;
    report_logo: File | null;
  }>({
    favicon: null,
    login_logo: null,
    dashboard_logo: null,
    report_logo: null,
  });

  const syncRuntimeConfig = (value: SystemConfig) => {
    const system = normalizePublicSystemInfo(value.system);
    const security = normalizePublicSecurity(value.security);
    const assets = normalizePublicAssets(value.assets);
    localStorage.setItem(PUBLIC_ASSETS_STORAGE_KEY, JSON.stringify(assets));
    localStorage.setItem(PUBLIC_CONFIG_STORAGE_KEY, JSON.stringify({ assets, system, security }));
    window.dispatchEvent(new Event('sigmod-public-config-updated'));
    applySystemIdentity(system);
    const favicon = document.querySelector("link[rel='icon']") as HTMLLinkElement | null;
    if (favicon && assets.favicon_url) favicon.href = assets.favicon_url;
  };

  const load = useCallback(async () => {
    if (!token) return;
    setIsLoading(true);
    setError('');
    try {
      const response = await fetch(`${API_BASE}/configuracion-sistema`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = (await response.json()) as Partial<SystemConfig>;
      const normalizedData: SystemConfig = {
        ...EMPTY_CONFIG,
        ...data,
        navigation: {
          ...EMPTY_CONFIG.navigation,
          ...(data.navigation ?? {}),
          main_menus: Array.isArray(data.navigation?.main_menus) && data.navigation.main_menus.length
            ? normalizeMenuNodes(data.navigation.main_menus)
            : EMPTY_CONFIG.navigation.main_menus,
        },
        system: { ...EMPTY_CONFIG.system, ...(data.system ?? {}) },
        assets: { ...EMPTY_CONFIG.assets, ...(data.assets ?? {}) },
        keys: { ...EMPTY_CONFIG.keys, ...(data.keys ?? {}) },
        security: { ...EMPTY_CONFIG.security, ...(data.security ?? {}) },
        palette: {
          ...EMPTY_CONFIG.palette,
          ...(data.palette ?? {}),
          presets: {
            ...EMPTY_CONFIG.palette.presets,
            ...((data.palette?.presets ?? {}) as Record<string, SystemPalette>),
          },
          custom: {
            ...EMPTY_CONFIG.palette.custom,
            ...((data.palette?.custom ?? {}) as SystemPalette),
            colors: {
              ...EMPTY_CONFIG.palette.custom.colors,
              ...((data.palette?.custom?.colors ?? {}) as SystemPalette['colors']),
            },
          },
        },
      };
      setConfig(normalizedData);
      syncRuntimeConfig(normalizedData);

      const active =
        normalizedData.palette.active_key === 'custom'
          ? normalizedData.palette.custom
          : normalizedData.palette.presets[normalizedData.palette.active_key] ?? normalizedData.palette.custom;
      applyPalette(active);
      localStorage.setItem(PALETTE_STORAGE_KEY, JSON.stringify(active));
    } catch (errorValue) {
      const message = errorValue instanceof Error ? errorValue.message : 'Error desconocido';
      setError(`No se pudo cargar la configuración del sistema. (${message})`);
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  // setIsLoading(true) al inicio de load dispara set-state-in-effect — patrón
  // legítimo de "cargar en mount/cambio de token" que la regla v6 sobre-marca.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    const palette =
      config.palette.active_key === 'custom'
        ? config.palette.custom
        : config.palette.presets[config.palette.active_key] ?? config.palette.custom;
    applyPalette(palette);
    localStorage.setItem(PALETTE_STORAGE_KEY, JSON.stringify(palette));
  }, [config.palette]);

  const saveSettings = async (event: FormEvent) => {
    event.preventDefault();
    if (!token) return;
    setError('');
    setSuccess('');
    setIsSaving(true);
    try {
      const normalizedCustom: SystemPalette = {
        ...config.palette.custom,
        colors: {
          primary: sanitizeColor(config.palette.custom.colors.primary),
          secondary: sanitizeColor(config.palette.custom.colors.secondary),
          accent: sanitizeColor(config.palette.custom.colors.accent),
          neutral_gray: sanitizeColor(config.palette.custom.colors.neutral_gray),
          background_light: sanitizeColor(config.palette.custom.colors.background_light),
          background_dark: sanitizeColor(config.palette.custom.colors.background_dark),
          soft_gray: sanitizeColor(config.palette.custom.colors.soft_gray),
          mint: sanitizeColor(config.palette.custom.colors.mint),
          sky_blue: sanitizeColor(config.palette.custom.colors.sky_blue),
        },
      };

      const payload: SystemConfig = {
        ...config,
        system: {
          full_name: config.system.full_name.trim(),
          short_name: config.system.short_name.trim(),
        },
        security: {
          ...config.security,
          session_timeout_minutes: Math.min(Math.max(Number(config.security.session_timeout_minutes) || 30, 1), 24 * 60),
          session_warning_seconds: Math.min(Math.max(Number(config.security.session_warning_seconds) || 60, 10), 10 * 60),
        },
        palette: {
          ...config.palette,
          custom: normalizedCustom,
        },
      };

      const response = await fetch(`${API_BASE}/configuracion-sistema`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = (await response.json()) as SystemConfig;
      setConfig(data);
      syncRuntimeConfig(data);

      const active =
        data.palette.active_key === 'custom'
          ? data.palette.custom
          : data.palette.presets[data.palette.active_key] ?? data.palette.custom;
      applyPalette(active);
      localStorage.setItem(PALETTE_STORAGE_KEY, JSON.stringify(active));
      setSuccess('Configuración guardada correctamente.');
    } catch (errorValue) {
      const message = errorValue instanceof Error ? errorValue.message : 'Error desconocido';
      setError(`No se pudo guardar la configuración. (${message})`);
    } finally {
      setIsSaving(false);
    }
  };

  const uploadAssets = async () => {
    if (!token) return;
    if (!files.favicon && !files.login_logo && !files.dashboard_logo && !files.report_logo) {
      setError('Selecciona al menos un archivo para subir.');
      return;
    }
    setError('');
    setSuccess('');
    setIsSaving(true);
    try {
      const formData = new FormData();
      if (files.favicon) formData.append('favicon', files.favicon);
      if (files.login_logo) formData.append('login_logo', files.login_logo);
      if (files.dashboard_logo) formData.append('dashboard_logo', files.dashboard_logo);
      if (files.report_logo) formData.append('report_logo', files.report_logo);

      const response = await fetch(`${API_BASE}/configuracion-sistema/assets`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = (await response.json()) as SystemConfig;
      setConfig(data);
      syncRuntimeConfig(data);
      setFiles({ favicon: null, login_logo: null, dashboard_logo: null, report_logo: null });
      setSuccess('Assets subidos y configuración actualizada.');
    } catch (errorValue) {
      const message = errorValue instanceof Error ? errorValue.message : 'Error desconocido';
      setError(`No se pudieron subir los assets. (${message})`);
    } finally {
      setIsSaving(false);
    }
  };

  const activePalettePreview =
    config.palette.active_key === 'custom'
      ? config.palette.custom
      : config.palette.presets[config.palette.active_key] ?? config.palette.custom;
  const activePaletteColors = activePalettePreview.colors;


  return (
    <div className="p-4 md:p-8 max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Configuración del Sistema</h1>
        <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
          Administra logos, llaves de servicios, 2FA y paletas de colores.
        </p>
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      {success && <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{success}</div>}

      <SistemaVersionEditor />

      <form onSubmit={saveSettings} className="space-y-6">
        <section className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
          <h2 className="font-semibold text-slate-900">Identidad del sistema</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="block text-sm mb-1 text-slate-700">Nombre completo del sistema</label>
              <input
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                value={config.system.full_name}
                maxLength={200}
                onChange={(e) => setConfig((prev) => ({ ...prev, system: { ...prev.system, full_name: e.target.value } }))}
              />
            </div>
            <div>
              <label className="block text-sm mb-1 text-slate-700">Nombre corto (titulo de pestaña)</label>
              <input
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                value={config.system.short_name}
                maxLength={60}
                onChange={(e) => setConfig((prev) => ({ ...prev, system: { ...prev.system, short_name: e.target.value } }))}
              />
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
          <h2 className="font-semibold text-slate-900">Llaves y seguridad</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm mb-1 text-slate-700">Google Maps Key</label>
              <input
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                value={config.keys.google_maps_key}
                onChange={(e) => setConfig((prev) => ({ ...prev, keys: { ...prev.keys, google_maps_key: e.target.value } }))}
              />
            </div>
            <div>
              <label className="block text-sm mb-1 text-slate-700">Captcha Site Key</label>
              <input
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                value={config.keys.captcha_site_key}
                onChange={(e) => setConfig((prev) => ({ ...prev, keys: { ...prev.keys, captcha_site_key: e.target.value } }))}
              />
            </div>
            <div>
              <label className="block text-sm mb-1 text-slate-700">Captcha Secret Key</label>
              <input
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                value={config.keys.captcha_secret_key}
                onChange={(e) => setConfig((prev) => ({ ...prev, keys: { ...prev.keys, captcha_secret_key: e.target.value } }))}
              />
            </div>
            <label className="inline-flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={config.security.two_factor_enabled}
                onChange={(e) => setConfig((prev) => ({ ...prev, security: { ...prev.security, two_factor_enabled: e.target.checked } }))}
              />
              Activar doble factor (2FA)
            </label>
            <div>
              <label className="block text-sm mb-1 text-slate-700">Minutos de inactividad antes de alerta</label>
              <input
                type="number"
                min={1}
                max={1440}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                value={config.security.session_timeout_minutes}
                onChange={(e) => setConfig((prev) => ({ ...prev, security: { ...prev.security, session_timeout_minutes: Number(e.target.value) } }))}
              />
            </div>
            <div>
              <label className="block text-sm mb-1 text-slate-700">Segundos para atender alerta antes de cerrar sesion</label>
              <input
                type="number"
                min={10}
                max={600}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                value={config.security.session_warning_seconds}
                onChange={(e) => setConfig((prev) => ({ ...prev, security: { ...prev.security, session_warning_seconds: Number(e.target.value) } }))}
              />
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
          <h2 className="font-semibold text-slate-900">Assets del sistema</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <label className="space-y-1">
              <span className="block text-slate-700">Favicon (.ico)</span>
              <input type="file" accept=".ico,.png" onChange={(e) => setFiles((prev) => ({ ...prev, favicon: e.target.files?.[0] ?? null }))} />
            </label>
            <label className="space-y-1">
              <span className="block text-slate-700">Logo Login</span>
              <input type="file" accept=".png,.jpg,.jpeg,.svg" onChange={(e) => setFiles((prev) => ({ ...prev, login_logo: e.target.files?.[0] ?? null }))} />
            </label>
            <label className="space-y-1">
              <span className="block text-slate-700">Logo Dashboard</span>
              <input type="file" accept=".png,.jpg,.jpeg,.svg" onChange={(e) => setFiles((prev) => ({ ...prev, dashboard_logo: e.target.files?.[0] ?? null }))} />
            </label>
            <label className="space-y-1">
              <span className="block text-slate-700">Logo Reportes</span>
              <input type="file" accept=".png,.jpg,.jpeg,.svg" onChange={(e) => setFiles((prev) => ({ ...prev, report_logo: e.target.files?.[0] ?? null }))} />
            </label>
          </div>
          <button type="button" onClick={uploadAssets} className="rounded-lg border border-slate-300 px-4 py-2 text-sm" disabled={isSaving || isLoading}>
            Subir assets
          </button>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-5 space-y-3">
          <h2 className="font-semibold text-slate-900">Configuración de Menus</h2>
          <p className="text-sm text-slate-600">
            El constructor de menus ahora se administra en una pantalla dedicada para simplificar su uso.
          </p>
          <Link to="/configuracion/menus" className="inline-flex items-center rounded-lg bg-primary text-white px-4 py-2 text-sm">
            Abrir Configuración de Menus
          </Link>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
          <h2 className="font-semibold text-slate-900">Paleta de colores</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm mb-1 text-slate-700">Paleta activa</label>
                <select
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  value={config.palette.active_key}
                  onChange={(e) => setConfig((prev) => ({ ...prev, palette: { ...prev.palette, active_key: e.target.value } }))}
                >
                {Object.entries(config.palette.presets).map(([key, palette]) => (
                  <option key={key} value={key}>
                    {palette.name}
                  </option>
                ))}
                <option value="custom">Personalizada</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {(Object.entries(activePaletteColors) as Array<[keyof SystemPalette['colors'], string]>).map(([key, value]) => (
              <label key={key} className="space-y-1 text-sm text-slate-700">
                <span className="capitalize">{key.replace('_', ' ')}</span>
                <input
                  type="color"
                  value={value}
                  onChange={(e) =>
                    setConfig((prev) => ({
                      ...prev,
                      palette: {
                        ...prev.palette,
                        active_key: 'custom',
                        custom: {
                          ...prev.palette.custom,
                          colors: {
                            ...prev.palette.custom.colors,
                            [key]: e.target.value,
                          },
                        },
                      },
                    }))
                  }
                  className="h-10 w-full rounded border border-slate-300"
                />
              </label>
            ))}
          </div>

          <div className="rounded-lg border border-slate-200 p-3 text-sm">
            <p className="mb-2 text-slate-700">Vista previa paleta activa: {activePalettePreview.name}</p>
            <div className="flex gap-2">
              {(Object.entries(activePalettePreview.colors) as Array<[string, string]>).slice(0, 5).map(([colorKey, colorValue]) => (
                <span
                  key={colorKey}
                  className="inline-block size-8 rounded-md border border-slate-300"
                  style={{ backgroundColor: colorValue }}
                  title={colorKey}
                />
              ))}
            </div>
          </div>
        </section>

        <button type="submit" disabled={isSaving || isLoading} className="rounded-lg bg-primary text-white px-4 py-2 text-sm disabled:opacity-60">
          {isSaving ? 'Guardando...' : 'Guardar configuración'}
        </button>
      </form>
    </div>
  );
}
