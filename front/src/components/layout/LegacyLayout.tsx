import { Outlet, Link, useLocation } from 'react-router-dom';
import Icon from '@/components/ui/Icon';
import { useLegacyAuth } from '@/context/LegacyAuthContext';
import { useTheme } from '@/context/ThemeContext';

export default function LegacyLayout() {
  const { user, logout } = useLegacyAuth();
  const { isDark, toggle } = useTheme();
  const location = useLocation();

  const navItems = [
    { to: '/legacy', icon: 'dashboard', label: 'Dashboard' },
    { to: '/legacy/reportes/concentrado-en-linea', icon: 'summarize', label: 'Movilización en línea' },
    { to: '/legacy/reportes/concentrado-en-linea-semanal', icon: 'date_range', label: 'Movilización semanal' },
  ];

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
          {navItems.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className={`
                flex items-center gap-3 px-3 py-2 border-l-2 transition-colors rounded-r
                ${location.pathname === item.to
                  ? 'border-amber-400 text-amber-200 bg-white/5'
                  : 'border-transparent text-amber-100/80 hover:text-white hover:border-white/40'}
              `}
            >
              <Icon name={item.icon} className="text-[20px]" />
              <span className="font-medium">{item.label}</span>
            </Link>
          ))}
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
