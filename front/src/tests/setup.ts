import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// Limpieza automática del DOM después de cada test para evitar leaks.
afterEach(() => {
  cleanup();
  // Reset localStorage entre tests para que el flujo de auth no contamine.
  if (typeof window !== 'undefined') {
    window.localStorage.clear();
    window.sessionStorage.clear();
  }
});
