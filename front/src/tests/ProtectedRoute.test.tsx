import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import type { ReactNode } from 'react';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import { useAuth } from '@/context/AuthContext';

// Stub del AuthContext para evitar cargar el real (que hace fetch al mount).
// Usamos vi.doMock? No: más simple → wrapper que inyecta distintos valores en
// el contexto compartido, exponiéndolo con el mismo nombre via un Provider puente.

import { createContext, useContext } from 'react';

const StubAuthContext = createContext<ReturnType<typeof useAuth> | null>(null);

interface StubOpts {
  isAuthenticated: boolean;
  isLoading?: boolean;
}

function StubProvider({ children, value }: { children: ReactNode; value: StubOpts }) {
  const full = {
    user: value.isAuthenticated ? { id: '1', fullName: 'Test', email: 't@t.t', role: 'admin' as const, initials: 'T' } : null,
    isAuthenticated: value.isAuthenticated,
    isLoading: value.isLoading ?? false,
    login: async () => ({ success: true, redirectTo: '/' }),
    logout: () => undefined,
    register: async () => ({ success: true, redirectTo: '/' }),
  };
  // Reemplazamos useAuth en ProtectedRoute via module mock? Usemos vi.mock del módulo.
  return <StubAuthContext.Provider value={full as unknown as ReturnType<typeof useAuth>}>{children}</StubAuthContext.Provider>;
}

// Re-exportamos useAuth del stub para el test
const _useAuthOrig = useAuth;
void _useAuthOrig;

import { vi } from 'vitest';
vi.mock('@/context/AuthContext', async () => {
  const actual = await vi.importActual<typeof import('@/context/AuthContext')>('@/context/AuthContext');
  return {
    ...actual,
    useAuth: () => {
      const v = useContext(StubAuthContext);
      if (!v) throw new Error('StubAuthContext missing');
      return v;
    },
  };
});

describe('ProtectedRoute', () => {
  it('renders children when authenticated', () => {
    render(
      <StubProvider value={{ isAuthenticated: true }}>
        <MemoryRouter initialEntries={['/private']}>
          <Routes>
            <Route path="/login" element={<div>public-login</div>} />
            <Route
              path="/private"
              element={
                <ProtectedRoute>
                  <div>secret-content</div>
                </ProtectedRoute>
              }
            />
          </Routes>
        </MemoryRouter>
      </StubProvider>,
    );
    expect(screen.getByText('secret-content')).toBeInTheDocument();
    expect(screen.queryByText('public-login')).toBeNull();
  });

  it('redirects to /login when not authenticated', () => {
    render(
      <StubProvider value={{ isAuthenticated: false }}>
        <MemoryRouter initialEntries={['/private']}>
          <Routes>
            <Route path="/login" element={<div>public-login</div>} />
            <Route
              path="/private"
              element={
                <ProtectedRoute>
                  <div>secret-content</div>
                </ProtectedRoute>
              }
            />
          </Routes>
        </MemoryRouter>
      </StubProvider>,
    );
    expect(screen.getByText('public-login')).toBeInTheDocument();
    expect(screen.queryByText('secret-content')).toBeNull();
  });

  it('shows spinner while loading', () => {
    const { container } = render(
      <StubProvider value={{ isAuthenticated: false, isLoading: true }}>
        <MemoryRouter initialEntries={['/private']}>
          <Routes>
            <Route path="/login" element={<div>public-login</div>} />
            <Route
              path="/private"
              element={
                <ProtectedRoute>
                  <div>secret-content</div>
                </ProtectedRoute>
              }
            />
          </Routes>
        </MemoryRouter>
      </StubProvider>,
    );
    // Ni secreto ni login — pantalla de spinner
    expect(screen.queryByText('secret-content')).toBeNull();
    expect(screen.queryByText('public-login')).toBeNull();
    expect(container.querySelector('.animate-spin')).not.toBeNull();
  });
});
