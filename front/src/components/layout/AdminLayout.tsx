import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Header from './Header';
import { useSidebar } from '@/hooks';
import SessionInactivityGuard from '@/components/auth/SessionInactivityGuard';

export default function AdminLayout() {
  const { isOpen, toggle, close, isMobile } = useSidebar();

  return (
    <div className="flex h-screen overflow-hidden">
      <SessionInactivityGuard />
      <Sidebar isOpen={isOpen} onClose={close} isMobile={isMobile} />
      <main className="flex-1 flex flex-col overflow-hidden bg-background-light dark:bg-background-dark">
        <Header onToggleSidebar={toggle} />
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
