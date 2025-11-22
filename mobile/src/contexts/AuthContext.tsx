import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import Auth0 from 'react-native-auth0';
import * as SecureStore from 'expo-secure-store';

import { AUTH0_AUDIENCE, AUTH0_CLIENT_ID, AUTH0_DOMAIN, AUTH0_REALM } from '../config/auth';
import { setAuthToken } from '../api';

const auth0 = new Auth0({ domain: AUTH0_DOMAIN, clientId: AUTH0_CLIENT_ID });
const TOKEN_KEY = 'baku_reserve_token';
const REFRESH_KEY = 'baku_reserve_refresh';
const NORMALISED_DOMAIN = AUTH0_DOMAIN.replace(/^https?:\/\//, '').replace(/\/$/, '');

export type AuthContextValue = {
  loading: boolean;
  isAuthenticated: boolean;
  profile: { name?: string; email?: string } | null;
  loginWithPassword: (email: string, password: string) => Promise<void>;
  signupWithPassword: (payload: { email: string; password: string; name?: string }) => Promise<void>;
  requestPasswordReset: (email: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

async function loadStoredToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(TOKEN_KEY);
  } catch {
    return null;
  }
}

async function persistTokens(accessToken: string, refreshToken?: string | null) {
  await SecureStore.setItemAsync(TOKEN_KEY, accessToken);
  if (refreshToken) {
    await SecureStore.setItemAsync(REFRESH_KEY, refreshToken);
  }
}

async function clearStoredTokens() {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
  await SecureStore.deleteItemAsync(REFRESH_KEY);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState<string | null>(null);
  const [profile, setProfile] = useState<{ name?: string; email?: string } | null>(null);

  const hydrateProfile = useCallback(async (accessToken: string) => {
    const details = await auth0.auth.userInfo({ token: accessToken });
    const derivedName = details.name || (details as any)?.user_metadata?.name || undefined;
    setProfile({ name: derivedName, email: details.email });
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const stored = await loadStoredToken();
        if (mounted && stored) {
          setToken(stored);
          setAuthToken(stored);
          try {
            await hydrateProfile(stored);
          } catch (err) {
            // eslint-disable-next-line no-console
            console.warn('[auth] Failed to hydrate stored session, clearing token', err);
            await clearStoredTokens();
            if (mounted) {
              setToken(null);
              setProfile(null);
              setAuthToken(null);
            }
          }
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    })();
    return () => {
      mounted = false;
    };
  }, [hydrateProfile]);

  const authenticate = useCallback(
    async (email: string, password: string) => {
      const credentials = await auth0.auth.passwordRealm({
        username: email.trim(),
        password,
        realm: AUTH0_REALM,
        scope: 'openid profile email offline_access',
        audience: AUTH0_AUDIENCE || undefined,
      });
      if (!credentials.accessToken) {
        throw new Error('Missing access token from Auth0 response');
      }
      setToken(credentials.accessToken);
      setAuthToken(credentials.accessToken);
      await persistTokens(credentials.accessToken, credentials.refreshToken);
      try {
        await hydrateProfile(credentials.accessToken);
      } catch {
        setProfile({ name: undefined, email: email.trim() });
      }
    },
    [hydrateProfile]
  );

  const loginWithPassword = useCallback(
    async (email: string, password: string) => {
      if (!email || !password) {
        throw new Error('Enter email and password');
      }
      await authenticate(email, password);
    },
    [authenticate]
  );

  const signupWithPassword = useCallback(
    async ({ email, password, name }: { email: string; password: string; name?: string }) => {
      try {
        await auth0.auth.createUser({
          email: email.trim(),
          password,
          connection: AUTH0_REALM,
          metadata: name ? { name } : undefined,
        });
      } catch (err: any) {
        const description = err?.json?.description || err?.message || 'Unable to create account';
        throw new Error(description);
      }
      await authenticate(email, password);
    },
    [authenticate]
  );

  const requestPasswordReset = useCallback(async (email: string) => {
    try {
      await auth0.auth.resetPassword({
        email: email.trim(),
        connection: AUTH0_REALM,
      });
    } catch (err: any) {
      const description = err?.json?.description || err?.message || 'Unable to send reset instructions';
      throw new Error(description);
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await auth0.webAuth.clearSession();
    } catch {
      // ignore
    }
    setToken(null);
    setProfile(null);
    setAuthToken(null);
    await clearStoredTokens();
  }, []);

  const value = useMemo(
    () => ({
      loading,
      isAuthenticated: Boolean(token),
      profile,
      loginWithPassword,
      signupWithPassword,
      requestPasswordReset,
      logout,
    }),
    [loading, token, profile, loginWithPassword, signupWithPassword, requestPasswordReset, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}
