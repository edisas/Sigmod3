import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import {
  applySystemIdentity,
  fetchPublicConfig,
  getStoredPublicConfig,
  type PublicSystemConfig,
} from '@/utils/systemBranding';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api/v1';
const ACTIVITY_EVENTS: Array<keyof WindowEventMap> = [
  'mousemove',
  'mousedown',
  'keydown',
  'scroll',
  'touchstart',
  'click',
];

export default function SessionInactivityGuard() {
  const navigate = useNavigate();
  const { isAuthenticated, logout } = useAuth();
  const [publicConfig, setPublicConfig] = useState<PublicSystemConfig>(getStoredPublicConfig());
  const [warningOpen, setWarningOpen] = useState(false);
  const warningTimerRef = useRef<number | null>(null);
  const logoutTimerRef = useRef<number | null>(null);

  useEffect(() => {
    void fetchPublicConfig(API_BASE)
      .then((data) => setPublicConfig(data))
      .catch(() => undefined);

    const onPublicConfigUpdated = () => {
      setPublicConfig(getStoredPublicConfig());
    };
    window.addEventListener('sigmod-public-config-updated', onPublicConfigUpdated);
    return () => {
      window.removeEventListener('sigmod-public-config-updated', onPublicConfigUpdated);
    };
  }, []);

  useEffect(() => {
    applySystemIdentity(publicConfig.system);
  }, [publicConfig.system]);

  const timeoutMs = useMemo(
    () => Math.max(1, publicConfig.security.session_timeout_minutes) * 60 * 1000,
    [publicConfig.security.session_timeout_minutes],
  );

  const warningMs = useMemo(
    () => Math.max(10, publicConfig.security.session_warning_seconds) * 1000,
    [publicConfig.security.session_warning_seconds],
  );

  const clearTimers = useCallback(() => {
    if (warningTimerRef.current !== null) {
      window.clearTimeout(warningTimerRef.current);
      warningTimerRef.current = null;
    }
    if (logoutTimerRef.current !== null) {
      window.clearTimeout(logoutTimerRef.current);
      logoutTimerRef.current = null;
    }
  }, []);

  const performLogout = useCallback(() => {
    clearTimers();
    setWarningOpen(false);
    logout();
    navigate('/login');
  }, [clearTimers, logout, navigate]);

  const resetTimers = useCallback(() => {
    if (!isAuthenticated) return;
    clearTimers();
    warningTimerRef.current = window.setTimeout(() => {
      setWarningOpen(true);
    }, timeoutMs);
    logoutTimerRef.current = window.setTimeout(() => {
      performLogout();
    }, timeoutMs + warningMs);
  }, [clearTimers, isAuthenticated, timeoutMs, warningMs, performLogout]);

  useEffect(() => {
    if (!isAuthenticated) {
      clearTimers();
      setWarningOpen(false);
      return;
    }

    const onActivity = () => {
      if (!isAuthenticated) return;
      if (warningOpen) setWarningOpen(false);
      resetTimers();
    };

    ACTIVITY_EVENTS.forEach((eventName) => {
      window.addEventListener(eventName, onActivity, { passive: true });
    });
    resetTimers();

    return () => {
      ACTIVITY_EVENTS.forEach((eventName) => {
        window.removeEventListener(eventName, onActivity as EventListener);
      });
      clearTimers();
    };
  }, [isAuthenticated, warningOpen, clearTimers, resetTimers]);

  if (!isAuthenticated || !warningOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-slate-200 space-y-4">
        <h3 className="text-lg font-bold text-slate-900">Sesion inactiva</h3>
        <p className="text-sm text-slate-700">
          Tu sesion esta por expirar por inactividad. Si deseas continuar, confirma antes de que termine el tiempo.
        </p>
        <div className="flex justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={performLogout}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700"
          >
            Cerrar sesion
          </button>
          <button
            type="button"
            onClick={() => {
              setWarningOpen(false);
              resetTimers();
            }}
            className="rounded-lg bg-primary text-white px-4 py-2 text-sm"
          >
            Continuar sesion
          </button>
        </div>
      </div>
    </div>
  );
}
