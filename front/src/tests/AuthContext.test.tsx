import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import { AuthProvider, useAuth } from '@/context/AuthContext';

const TOKEN_KEY = 'sigmod_token';

// Helper: componente mínimo que consume el contexto y refleja su estado.
function Probe() {
  const { user, isAuthenticated, isLoading, login, logout } = useAuth();
  return (
    <div>
      <span data-testid="state">
        {isLoading ? 'loading' : isAuthenticated ? 'auth' : 'anon'}
      </span>
      {user && <span data-testid="user-email">{user.email}</span>}
      <button
        type="button"
        onClick={() => {
          void login('user', 'pw');
        }}
      >
        Login
      </button>
      <button type="button" onClick={() => logout()}>
        Logout
      </button>
    </div>
  );
}

function mockFetchResponse(body: unknown, init: Partial<Response> = {}): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'content-type': 'application/json' },
    ...init,
  });
}

describe('AuthContext', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('starts unauthenticated when there is no stored token', async () => {
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    await waitFor(() => {
      expect(screen.getByTestId('state').textContent).toBe('anon');
    });
  });

  it('bootstraps user from /auth/me when a token is already stored', async () => {
    localStorage.setItem(TOKEN_KEY, 'stored-token');
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation((async () =>
      mockFetchResponse({
        user: { id: '7', full_name: 'Ada Lovelace', email: 'ada@example.com', role: 'admin' },
      })) as unknown as typeof fetch);

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('state').textContent).toBe('auth');
    });
    expect(screen.getByTestId('user-email').textContent).toBe('ada@example.com');
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringMatching(/\/auth\/me$/),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer stored-token' }),
      }),
    );
  });

  it('clears the token if /auth/me fails on bootstrap', async () => {
    localStorage.setItem(TOKEN_KEY, 'expired');
    vi.spyOn(globalThis, 'fetch').mockImplementation((async () =>
      mockFetchResponse({ detail: 'expired' }, { status: 401 })) as unknown as typeof fetch);

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('state').textContent).toBe('anon');
    });
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
  });

  it('logout clears localStorage and flips to anon', async () => {
    localStorage.setItem(TOKEN_KEY, 'valid');
    vi.spyOn(globalThis, 'fetch').mockImplementation((async () =>
      mockFetchResponse({ user: { id: '1', email: 'x@y.z', role: 'viewer' } })) as unknown as typeof fetch);

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('state').textContent).toBe('auth'));

    act(() => {
      screen.getByText('Logout').click();
    });

    await waitFor(() => expect(screen.getByTestId('state').textContent).toBe('anon'));
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
  });

  it('login persists access_token and sets authenticated state', async () => {
    let callIndex = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation((async (url: string) => {
      callIndex += 1;
      if (String(url).endsWith('/auth/login')) {
        return mockFetchResponse({
          access_token: 'new-token',
          token_type: 'bearer',
          user: { id: '1', email: 'op@test.mx', role: 'admin' },
        });
      }
      if (String(url).endsWith('/solicitudes/routing-hint')) {
        return mockFetchResponse({ redirect_to: '/dashboard' });
      }
      throw new Error(`unexpected fetch call #${callIndex}: ${url}`);
    }) as unknown as typeof fetch);

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('state').textContent).toBe('anon'));

    await act(async () => {
      screen.getByText('Login').click();
    });

    await waitFor(() => expect(screen.getByTestId('state').textContent).toBe('auth'));
    expect(localStorage.getItem(TOKEN_KEY)).toBe('new-token');
    expect(screen.getByTestId('user-email').textContent).toBe('op@test.mx');
  });

  it('login failure keeps user anonymous and does not persist token', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((async () =>
      mockFetchResponse({ detail: 'bad creds' }, { status: 401 })) as unknown as typeof fetch);

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('state').textContent).toBe('anon'));

    await act(async () => {
      screen.getByText('Login').click();
    });

    await waitFor(() => expect(screen.getByTestId('state').textContent).toBe('anon'));
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
  });
});
