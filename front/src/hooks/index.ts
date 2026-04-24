import { useState, useEffect, useCallback } from 'react';

/**
 * Hook to detect mobile viewport.
 */
export function useIsMobile(breakpoint = 768): boolean {
  const [isMobile, setIsMobile] = useState(
    typeof window !== 'undefined' ? window.innerWidth < breakpoint : false
  );

  // setIsMobile(mq.matches) sincroniza estado con matchMedia al montar/cambiar
  // breakpoint; la regla v6 sobre-marca setState síncronos en useEffect.
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsMobile(mq.matches);
    return () => mq.removeEventListener('change', handler);
  }, [breakpoint]);

  return isMobile;
}

/**
 * Hook to manage sidebar state.
 */
export function useSidebar() {
  const isMobile = useIsMobile(1024);
  const [isOpen, setIsOpen] = useState(!isMobile);

  // setIsOpen(!isMobile) sincroniza estado con breakpoint; la regla v6
  // sobre-marca setState síncronos en useEffect.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsOpen(!isMobile);
  }, [isMobile]);

  const toggle = useCallback(() => setIsOpen((p) => !p), []);
  const close = useCallback(() => setIsOpen(false), []);

  return { isOpen, toggle, close, isMobile };
}

/**
 * Debounced value hook.
 */
export function useDebounce<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}
