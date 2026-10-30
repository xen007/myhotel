import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { loginRequest, logoutRequest, meRequest, registerRequest, updatePasswordRequest, updateProfileRequest, type ApiUser, type AuthPayload } from '@/lib/api';
import { getItem, removeItem, setItem } from '@/lib/storage';

const TOKEN_KEY = 'myhotel.auth.token';
const USER_KEY = 'myhotel.auth.user';

type AuthContextValue = {
  user: ApiUser | null;
  token: string | null;
  ready: boolean;
  login: (email: string, password: string) => Promise<AuthPayload>;
  register: (payload: {
    full_name: string;
    email: string;
    phone?: string;
    password: string;
  }) => Promise<AuthPayload>;
  logout: () => Promise<void>;
  updateProfile: (payload: { full_name?: string; photo?: string | null }) => Promise<void>;
  updatePassword: (payload: { current_password: string; new_password: string }) => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

async function persistSession(token: string, user: ApiUser) {
  await setItem(TOKEN_KEY, token);
  await setItem(USER_KEY, JSON.stringify(user));
}

async function clearSession() {
  await removeItem(TOKEN_KEY);
  await removeItem(USER_KEY);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<ApiUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const savedToken = await getItem(TOKEN_KEY);
        const savedUser = await getItem(USER_KEY);
        if (!savedToken) return;

        if (savedUser) {
          try {
            const parsed = JSON.parse(savedUser) as ApiUser;
            if (!cancelled) {
              setToken(savedToken);
              setUser(parsed);
            }
          } catch {
            /* ignore malformed cache */
          }
        }

        const { user: freshUser } = await meRequest(savedToken);
        if (!cancelled) {
          setToken(savedToken);
          setUser(freshUser);
          await persistSession(savedToken, freshUser);
        }
      } catch {
        await clearSession();
        if (!cancelled) {
          setToken(null);
          setUser(null);
        }
      } finally {
        if (!cancelled) setReady(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      token,
      ready,
      async login(email, password) {
        const payload = await loginRequest(email, password);
        await persistSession(payload.token, payload.user);
        setToken(payload.token);
        setUser(payload.user);
        return payload;
      },
      async register(input) {
        const payload = await registerRequest(input);
        await persistSession(payload.token, payload.user);
        setToken(payload.token);
        setUser(payload.user);
        return payload;
      },
      async logout() {
        const current = token;
        await clearSession();
        setToken(null);
        setUser(null);
        if (current) {
          void logoutRequest(current).catch(() => undefined);
        }
      },
      async updateProfile(payload) {
        if (!token) throw new Error('Session expirée.');
        const { user: next } = await updateProfileRequest(token, payload);
        await persistSession(token, next);
        setUser(next);
      },
      async updatePassword(payload) {
        if (!token) throw new Error('Session expirée.');
        await updatePasswordRequest(token, payload);
      },
    }),
    [ready, token, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
