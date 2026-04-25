import { useEffect, useState } from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import Icon from '@/components/ui/Icon';
import { useLegacyAuth } from '@/context/LegacyAuthContext';
import { useTheme } from '@/context/ThemeContext';

interface NavLeaf {
  to: string;
  icon: string;
  label: string;
}

interface NavGroup {
  id: string;
  icon: string;
  label: string;
  children: NavLeaf[];
}

type NavNode = NavLeaf | NavGroup;

const isGroup = (node: NavNode): node is NavGroup => 'children' in node;

const navTree: NavNode[] = [
  { to: '/legacy', icon: 'dashboard', label: 'Dashboard' },
  { to: '/legacy/dashboard-trampeos', icon: 'bug_report', label: 'Dashboard trampeos' },
  { to: '/legacy/dashboard-muestreo', icon: 'science',    label: 'Dashboard muestreo' },
  {
    id: 'catalogos',
    icon: 'folder_managed',
    label: 'Catálogos',
    children: [
      { to: '/legacy/catalogos/rutas', icon: 'alt_route', label: 'Rutas' },
    ],
  },
  {
    id: 'correcciones',
    icon: 'build',
    label: 'Correcciones',
    children: [
      { to: '/legacy/correcciones/revisiones-trampas', icon: 'track_changes', label: 'Revisiones de trampas' },
      { to: '/legacy/correcciones/trampas',            icon: 'bug_report',    label: 'Trampas' },
      { to: '/legacy/correcciones/muestreos',          icon: 'science',       label: 'Muestreos' },
      { to: '/legacy/correcciones/tmimf-o-faltantes',  icon: 'report_problem',label: 'TMIMFs O faltantes' },
    ],
  },
  {
    id: 'reportes',
    icon: 'summarize',
    label: 'Reportes',
    children: [
      { to: '/legacy/reportes/concentrado-en-linea', icon: 'insights', label: 'Movilización en línea' },
      { to: '/legacy/reportes/concentrado-en-linea-semanal', icon: 'date_range', label: 'Movilización semanal' },
      { to: '/legacy/reportes/huertos-por-pfa', icon: 'badge', label: 'Huertos por PFA' },
      { to: '/legacy/reportes/informe-general-pfa', icon: 'assessment', label: 'Informe general por PFA' },
      { to: '/legacy/reportes/tmimfs-emitidas', icon: 'receipt_long', label: 'TMIMFs emitidas por fecha' },
      { to: '/legacy/reportes/inventario-por-pfa', icon: 'assignment', label: 'Inventario por PFA' },
      { to: '/legacy/reportes/informe-semanal-trampeo', icon: 'description', label: 'Informe semanal trampeo' },
      { to: '/legacy/reportes/informes-semanales-estado', icon: 'summarize', label: 'Informes semanales SAGARPA' },
      { to: '/legacy/reportes/resumen-diario-modulos', icon: 'today', label: 'Resumen diario por módulo' },
      { to: '/legacy/reportes/estimado-cosecha-pfa', icon: 'eco', label: 'Estimado de cosecha por PFA' },
      { to: '/legacy/reportes/documentos-por-fecha', icon: 'description', label: 'Documentos por fecha (COPREF/recibos)' },
      { to: '/legacy/reportes/detallado-movilizacion', icon: 'search', label: 'Buscar TMIMF (detallado)' },
    ],
  },
];

export default function LegacyLayout() {
  const { user, logout } = useLegacyAuth();
  const { isDark, toggle } = useTheme();
  const location = useLocation();

  const initialOpen = () => {
    const open: Record<string, boolean> = {};
    for (const node of navTree) {
      if (isGroup(node) && node.children.some((c) => location.pathname === c.to)) {
        open[node.id] = true;
      }
    }
    return open;
  };
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(initialOpen);

  // setOpenGroups al cambiar ruta es patrón legítimo de sincronizar apertura
  // del menú con la URL; la regla v6 sobre-marca setState síncronos en useEffect.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOpenGroups((prev) => {
      const next = { ...prev };
      for (const node of navTree) {
        if (isGroup(node) && node.children.some((c) => location.pathname === c.to)) {
          next[node.id] = true;
        }
      }
      return next;
    });
  }, [location.pathname]);

  const leafClasses = (path: string, indent: boolean) => `
    flex items-center gap-3 ${indent ? 'pl-9' : 'px-3'} pr-3 py-2 border-l-2 transition-colors rounded-r
    ${location.pathname === path
      ? 'border-amber-400 text-amber-200 bg-white/5'
      : 'border-transparent text-amber-100/80 hover:text-white hover:border-white/40'}
  `;

  return (
    <div className="flex h-screen overflow-hidden">
      <aside className="w-72 bg-amber-900 text-white flex flex-col shrink-0">
        <div className="p-6 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="size-12 rounded-xl bg-amber-500 flex items-center justify-center font-bold text-amber-950 text-xl">
              2
            </div>
            <div className="min-w-0">
              <p className="text-lg font-bold tracking-wide">SIGMOD 2</p>
              <p className="text-xs text-amber-200 uppercase tracking-widest">Modo Legacy</p>
            </div>
          </div>
        </div>

        <div className="px-6 py-4 border-b border-white/10 text-xs">
          <p className="text-amber-200 uppercase tracking-wider mb-1">Base activa</p>
          <p className="font-semibold text-white">{user?.nombre_estado ?? '—'}</p>
          <p className="text-amber-300">{user?.legacy_db ?? ''}</p>
        </div>

        <nav className="flex-1 overflow-y-auto py-4 px-4 space-y-0.5 custom-scrollbar">
          {navTree.map((node) => {
            if (!isGroup(node)) {
              return (
                <Link key={node.to} to={node.to} className={leafClasses(node.to, false)}>
                  <Icon name={node.icon} className="text-[20px]" />
                  <span className="font-medium">{node.label}</span>
                </Link>
              );
            }
            const expanded = openGroups[node.id] ?? false;
            const someActive = node.children.some((c) => location.pathname === c.to);
            return (
              <div key={node.id}>
                <button
                  type="button"
                  onClick={() =>
                    setOpenGroups((prev) => ({ ...prev, [node.id]: !prev[node.id] }))
                  }
                  className={`
                    w-full flex items-center justify-between gap-3 px-3 py-2 border-l-2 transition-colors rounded-r
                    ${someActive
                      ? 'border-amber-400 text-amber-200'
                      : 'border-transparent text-amber-100/80 hover:text-white hover:border-white/40'}
                  `}
                  aria-expanded={expanded}
                >
                  <span className="flex items-center gap-3">
                    <Icon name={node.icon} className="text-[20px]" />
                    <span className="font-medium">{node.label}</span>
                  </span>
                  <Icon name={expanded ? 'expand_less' : 'expand_more'} className="text-base" />
                </button>
                {expanded && (
                  <div className="mt-0.5 space-y-0.5">
                    {node.children.map((leaf) => (
                      <Link key={leaf.to} to={leaf.to} className={leafClasses(leaf.to, true)}>
                        <Icon name={leaf.icon} className="text-[18px]" />
                        <span className="text-sm font-medium">{leaf.label}</span>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        <div className="p-4 border-t border-white/10">
          <div className="flex items-center gap-3 p-2 bg-white/5 rounded-xl">
            <div className="size-10 rounded-full bg-amber-500 flex items-center justify-center text-amber-950 font-bold">
              {(user?.nombre ?? user?.usuario ?? 'L').slice(0, 1).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold truncate">{user?.nombre ?? user?.usuario}</p>
              <p className="text-xs text-amber-200">Nivel {user?.nivel}</p>
            </div>
            <button
              onClick={logout}
              className="text-amber-200 hover:text-white transition-colors"
              aria-label="Cerrar sesión legacy"
              title="Cerrar sesión"
            >
              <Icon name="logout" className="text-xl" />
            </button>
          </div>
        </div>
      </aside>

      <main className="flex-1 flex flex-col overflow-hidden bg-background-light dark:bg-background-dark">
        <header className="h-16 flex items-center justify-between px-4 sm:px-8 border-b border-neutral-gray/30 bg-white dark:bg-background-dark shrink-0">
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-100 text-amber-900 text-xs font-bold uppercase tracking-wider">
              <Icon name="history" className="text-sm" />
              SIGMOD 2 · Legacy
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={toggle}
              className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-white/5 transition-colors"
              aria-label={isDark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
            >
              <Icon name={isDark ? 'light_mode' : 'dark_mode'} className="text-slate-600 dark:text-slate-300" />
            </button>
            <Link
              to="/login"
              className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5"
              title="Volver a SIGMOD 3"
            >
              <Icon name="arrow_back" className="text-lg" />
              SIGMOD 3
            </Link>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto custom-scrollbar">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
