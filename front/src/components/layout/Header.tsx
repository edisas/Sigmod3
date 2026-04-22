import { useState } from 'react';
import { Link } from 'react-router-dom';
import Icon from '@/components/ui/Icon';
import { useTheme } from '@/context/ThemeContext';
import { useAuth } from '@/context/AuthContext';
import { useDebounce } from '@/hooks';
import { sanitizeInput } from '@/utils/security';

interface HeaderProps {
  onToggleSidebar: () => void;
}

export default function Header({ onToggleSidebar }: HeaderProps) {
  const { isDark, toggle } = useTheme();
  const { user } = useAuth();
  const [searchRaw, setSearchRaw] = useState('');
  const searchQuery = useDebounce(sanitizeInput(searchRaw), 300);

  // searchQuery is available for use in search functionality
  void searchQuery;

  return (
    <header className="h-16 flex items-center justify-between px-4 sm:px-8 border-b border-neutral-gray/30 bg-white dark:bg-background-dark shrink-0">
      {/* Left side */}
      <div className="flex items-center gap-3 flex-1 max-w-xl">
        <button
          onClick={onToggleSidebar}
          className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-white/5 transition-colors lg:hidden"
          aria-label="Abrir menú"
        >
          <Icon name="menu" className="text-slate-600 dark:text-slate-300" />
        </button>

        <div className="relative w-full hidden sm:block">
          <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xl" />
          <input
            type="text"
            value={searchRaw}
            onChange={(e) => setSearchRaw(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-slate-100 dark:bg-white/5 border-none rounded-xl text-sm focus:ring-2 focus:ring-primary/20 outline-none transition-shadow"
            placeholder="Buscar predios, cultivos o alertas..."
            aria-label="Buscar"
            maxLength={100}
          />
        </div>
      </div>

      {/* Right side */}
      <div className="flex items-center gap-2 sm:gap-4">
        {/* Theme toggle */}
        <button
          onClick={toggle}
          className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-white/5 transition-colors"
          aria-label={isDark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
        >
          <Icon name={isDark ? 'light_mode' : 'dark_mode'} className="text-slate-600 dark:text-slate-300" />
        </button>

        {/* Notifications */}
        <button className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-white/5 relative transition-colors">
          <Icon name="notifications" className="text-slate-600 dark:text-slate-300" />
          <span className="absolute top-2 right-2 size-2 bg-red-500 rounded-full border-2 border-white dark:border-background-dark" />
        </button>

        {/* Export button - hidden on small screens */}
        <button className="hidden md:flex items-center gap-2 bg-primary/10 text-primary px-4 py-2 rounded-xl text-sm font-semibold hover:bg-primary/20 transition-colors">
          <Icon name="download" className="text-lg" />
          Exportar
        </button>

        {/* Profile link */}
        <Link
          to="/profile"
          className="flex items-center gap-2 pl-2 sm:pl-4 sm:border-l border-neutral-gray/30"
        >
          <div className="size-9 rounded-full bg-secondary flex items-center justify-center text-primary font-bold text-sm">
            {user?.initials ?? 'U'}
          </div>
          <span className="text-sm font-semibold hidden lg:block">{user?.fullName}</span>
        </Link>
      </div>
    </header>
  );
}
