import { useEffect, useMemo, useState } from 'react';
import { useLocation, Link } from 'react-router-dom';
import Icon from '@/components/ui/Icon';
import { PROCESS_NAVIGATION, ADMIN_NAVIGATION } from '@/utils/constants';
import { useAuth } from '@/context/AuthContext';
import {
  DEFAULT_DASHBOARD_ICON,
  getStoredPublicAssets,
  normalizePublicAssets,
} from '@/utils/systemBranding';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  isMobile: boolean;
}

type MenuNodeType = 'group' | 'link' | 'separator';

interface MenuNode {
  id: string;
  type: MenuNodeType;
  label: string;
  icon: string;
  path: string;
  children: MenuNode[];
}

function menuNodeId(): string {
  return `menu_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function fromNavItems(items: Array<{ icon: string; label: string; path?: string; children?: any[] }>): MenuNode[] {
  return items.map((item) => ({
    id: menuNodeId(),
    type: item.children?.length ? 'group' : 'link',
    label: item.label,
    icon: item.icon || 'menu',
    path: item.path ?? '',
    children: item.children?.length ? fromNavItems(item.children) : [],
  }));
}

function buildFallbackMenus(): MenuNode[] {
  return [
    { id: 'main-operaciones', type: 'group', label: 'Operaciones de Campo', icon: 'dashboard', path: '', children: [] },
    { id: 'main-procesos', type: 'group', label: 'Procesos', icon: 'assignment', path: '', children: fromNavItems(PROCESS_NAVIGATION) },
    { id: 'main-admin', type: 'group', label: 'Administración', icon: 'settings', path: '', children: fromNavItems(ADMIN_NAVIGATION) },
  ];
}

function normalizeMenuNodes(input: unknown): MenuNode[] {
  if (!Array.isArray(input)) return [];
  return input.map((raw, index) => {
    const node = (raw ?? {}) as Partial<MenuNode>;
    const type: MenuNodeType = node.type === 'link' || node.type === 'separator' ? node.type : 'group';
    return {
      id: typeof node.id === 'string' && node.id.trim() ? node.id : `${type}_${index}_${menuNodeId()}`,
      type,
      label: typeof node.label === 'string' && node.label.trim() ? node.label : (type === 'separator' ? 'Separador' : `Menu ${index + 1}`),
      icon: typeof node.icon === 'string' && node.icon.trim() ? node.icon : 'menu',
      path: typeof node.path === 'string' ? node.path : '',
      children: normalizeMenuNodes(node.children),
    };
  });
}

function hasPath(nodes: MenuNode[], path: string): boolean {
  return nodes.some((node) => node.path === path || hasPath(node.children, path));
}

function ensureCriticalMenuEntries(nodes: MenuNode[]): MenuNode[] {
  const tree = deepClone(nodes);
  if (hasPath(tree, '/configuracion/menus')) return tree;
  const admin = tree.find((node) => node.type === 'group' && node.label.toLowerCase().includes('administr'));
  if (!admin) {
    tree.push({
      id: menuNodeId(),
      type: 'group',
      label: 'Administración',
      icon: 'settings',
      path: '',
      children: [{ id: menuNodeId(), type: 'link', label: 'Configuración de Menus', icon: 'menu_open', path: '/configuracion/menus', children: [] }],
    });
    return tree;
  }
  const configGroup = admin.children.find((node) => node.type === 'group' && node.label.toLowerCase().includes('config'));
  if (configGroup) {
    configGroup.children.push({
      id: menuNodeId(),
      type: 'link',
      label: 'Configuración de Menus',
      icon: 'menu_open',
      path: '/configuracion/menus',
      children: [],
    });
  } else {
    admin.children.push({
      id: menuNodeId(),
      type: 'link',
      label: 'Configuración de Menus',
      icon: 'menu_open',
      path: '/configuracion/menus',
      children: [],
    });
  }
  return tree;
}

function deepClone(items: MenuNode[]): MenuNode[] {
  return JSON.parse(JSON.stringify(items)) as MenuNode[];
}

function hasActivePath(node: MenuNode, pathname: string): boolean {
  return (Boolean(node.path) && pathname === node.path) || node.children.some((child) => hasActivePath(child, pathname));
}

export default function Sidebar({ isOpen, onClose, isMobile }: SidebarProps) {
  const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api/v1';
  const location = useLocation();
  const { user, logout } = useAuth();
  const [assets, setAssets] = useState(getStoredPublicAssets());
  const [menus, setMenus] = useState<MenuNode[]>(buildFallbackMenus());
  const [openMain, setOpenMain] = useState<Record<string, boolean>>({});
  const [openNodes, setOpenNodes] = useState<Record<string, boolean>>({});

  const topLevelIds = useMemo(() => menus.map((item) => item.id), [menus]);

  useEffect(() => {
    setOpenMain({});
    setOpenNodes({});
  }, [location.pathname]);

  useEffect(() => {
    const load = async () => {
      try {
        const response = await fetch(`${API_BASE}/configuracion-sistema/publico`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = (await response.json()) as { assets?: unknown; navigation?: { main_menus?: unknown } };
        setAssets(normalizePublicAssets(data.assets));
        const configuredMenus = normalizeMenuNodes(data.navigation?.main_menus);
        setMenus(ensureCriticalMenuEntries(configuredMenus.length ? configuredMenus : buildFallbackMenus()));
      } catch {
        setMenus(ensureCriticalMenuEntries(buildFallbackMenus()));
      }
    };
    const onPublicConfigUpdated = () => {
      void load();
    };
    window.addEventListener('sigmod-public-config-updated', onPublicConfigUpdated);
    void load();
    return () => {
      window.removeEventListener('sigmod-public-config-updated', onPublicConfigUpdated);
    };
  }, [API_BASE]);

  const renderNode = (node: MenuNode, level: number, parentId: string) => {
    const key = `${parentId}>${node.id}`;
    const paddingLeft = `${level * 16 + 12}px`;

    if (node.type === 'separator') {
      return <div key={key} className="mx-2 border-t border-white/20 my-1" />;
    }

    if (node.type === 'group') {
      const expanded = level === 0 ? (openMain[node.id] ?? false) : (openNodes[node.id] ?? false);
      return (
        <div key={key} className="space-y-0.5">
          <button
            type="button"
            onClick={() => {
              if (level === 0) {
                setOpenMain((prev) => {
                  const next: Record<string, boolean> = {};
                  topLevelIds.forEach((id) => {
                    next[id] = false;
                  });
                  next[node.id] = !(prev[node.id] ?? false);
                  return next;
                });
              } else {
                setOpenNodes((prev) => ({
                  ...prev,
                  [node.id]: !(prev[node.id] ?? false),
                }));
              }
            }}
            className={`
              w-full flex items-center justify-between gap-3 py-1.5 border-l-2 transition-colors
              ${hasActivePath(node, location.pathname)
                ? 'border-accent text-accent'
                : 'border-transparent text-slate-300 hover:text-white hover:border-white/40'
              }
            `}
            style={{ paddingLeft }}
          >
            <span className="flex items-center gap-3">
              <Icon name={node.icon} className={level >= 2 ? 'text-[16px]' : 'text-[20px]'} />
              <span className={level === 0 ? 'text-xs font-semibold text-secondary uppercase tracking-widest' : (level >= 2 ? 'text-sm font-medium' : 'font-medium')}>
                {node.label}
              </span>
            </span>
            <Icon name={expanded ? 'expand_less' : 'expand_more'} className="text-base" />
          </button>
          {expanded && (
            <div className="space-y-0.5">
              {node.children.map((child) => renderNode(child, level + 1, key))}
            </div>
          )}
        </div>
      );
    }

    if (!node.path) return null;

    return (
      <Link
        key={key}
        to={node.path}
        onClick={isMobile ? onClose : undefined}
        className={`
          flex items-center gap-3 py-2 border-l-2 transition-colors
          ${location.pathname === node.path
            ? 'border-accent text-accent'
            : 'border-transparent text-slate-300 hover:text-white hover:border-white/40'
          }
        `}
        style={{ paddingLeft }}
      >
        <Icon name={node.icon} className={level >= 2 ? 'text-[16px]' : 'text-[20px]'} />
        <span className={level >= 2 ? 'text-sm font-medium' : 'font-medium'}>{node.label}</span>
      </Link>
    );
  };

  return (
    <>
      {isMobile && isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden animate-fade-in"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <aside
        className={`
          ${isMobile ? 'fixed inset-y-0 left-0 z-50' : 'relative'}
          w-72 bg-primary text-white flex flex-col shrink-0
          transform transition-transform duration-300 ease-in-out
          ${isOpen ? 'translate-x-0' : '-translate-x-full'}
          ${!isMobile && !isOpen ? 'hidden' : ''}
        `}
      >
        <div className="p-6 flex items-center gap-3 border-b border-white/10">
          <div className="bg-white/95 rounded-xl px-2 py-1 shadow-sm flex-1 flex items-center justify-center lg:justify-start min-h-[96px] overflow-hidden">
            <img
              src={DEFAULT_DASHBOARD_ICON}
              alt="SIGMOD 3"
              className="h-20 w-auto object-contain lg:hidden"
            />
            <img
              src={assets.dashboard_logo_url}
              alt="SIGMOD 3"
              className="hidden lg:block h-20 xl:h-24 w-full object-contain scale-[1.8] origin-center"
            />
          </div>
          {isMobile && (
            <button
              onClick={onClose}
              className="p-1 rounded-lg hover:bg-white/10 transition-colors"
              aria-label="Cerrar menú"
            >
              <Icon name="close" />
            </button>
          )}
        </div>

        <nav className="flex-1 overflow-y-auto py-2 px-4 space-y-0 custom-scrollbar">
          <div className="space-y-0.5">
            <Link
              to="/"
              onClick={isMobile ? onClose : undefined}
              className={`
                flex items-center gap-3 px-3 py-2 border-l-2 transition-colors
                ${location.pathname === '/'
                  ? 'border-accent text-accent'
                  : 'border-transparent text-slate-300 hover:text-white hover:border-white/40'
                }
              `}
            >
              <Icon name="home" className="text-[20px]" />
              <span className="font-bold uppercase tracking-wide">INICIO</span>
            </Link>
          </div>

          <div className="space-y-0.5">
            {menus.map((node) => renderNode(node, 0, 'root'))}
          </div>
        </nav>

        <div className="p-4 border-t border-white/10">
          <div className="flex items-center gap-3 p-2 bg-white/5 rounded-xl">
            <div className="size-10 rounded-full bg-secondary flex items-center justify-center text-primary font-bold">
              {user?.initials ?? 'U'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold truncate">{user?.fullName ?? 'Usuario'}</p>
              <p className="text-xs text-secondary truncate capitalize">{user?.role ?? 'viewer'}</p>
            </div>
            <button
              onClick={logout}
              className="text-slate-400 hover:text-white transition-colors"
              aria-label="Cerrar sesión"
              title="Cerrar sesión"
            >
              <Icon name="logout" className="text-xl" />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
