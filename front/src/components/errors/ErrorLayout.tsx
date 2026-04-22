import { Link } from 'react-router-dom';
import Icon from '@/components/ui/Icon';
import type { ReactNode } from 'react';

interface ErrorLayoutProps {
  children: ReactNode;
  showNav?: boolean;
}

export function ErrorHeader() {
  return (
    <header className="w-full border-b border-neutral-gray/30 dark:border-primary/20 bg-white/80 dark:bg-background-dark/80 backdrop-blur-md sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2">
          <div className="bg-primary p-1.5 rounded-lg flex items-center justify-center text-white">
            <Icon name="precision_manufacturing" className="text-2xl" />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-primary dark:text-accent">
            AgroPrecision
          </h1>
        </Link>
        <div className="flex items-center gap-4">
          <div className="size-10 rounded-full bg-neutral-gray flex items-center justify-center text-primary font-bold text-sm">
            JD
          </div>
        </div>
      </div>
    </header>
  );
}

export function ErrorFooter() {
  return (
    <footer className="w-full py-8 border-t border-neutral-gray/20 dark:border-primary/10">
      <div className="max-w-7xl mx-auto px-4 text-center">
        <div className="flex flex-wrap justify-center gap-x-8 gap-y-2 mb-4">
          <a href="#" className="text-sm text-slate-500 hover:text-primary dark:hover:text-accent transition-colors">
            Política de Privacidad
          </a>
          <a href="#" className="text-sm text-slate-500 hover:text-primary dark:hover:text-accent transition-colors">
            Términos de Servicio
          </a>
          <a href="#" className="text-sm text-slate-500 hover:text-primary dark:hover:text-accent transition-colors">
            Diagnóstico del Sistema
          </a>
        </div>
        <p className="text-xs text-neutral-gray dark:text-slate-500 font-medium">
          © 2024 AgroTech Sustainability Solutions. Todos los datos ambientales asegurados.
        </p>
      </div>
    </footer>
  );
}

export default function ErrorLayout({ children, showNav = true }: ErrorLayoutProps) {
  return (
    <div className="min-h-screen flex flex-col bg-background-light dark:bg-background-dark font-display text-slate-900 dark:text-slate-100">
      {showNav && <ErrorHeader />}
      <main className="flex-grow flex items-center justify-center px-6 py-12">
        {children}
      </main>
      <ErrorFooter />
    </div>
  );
}
