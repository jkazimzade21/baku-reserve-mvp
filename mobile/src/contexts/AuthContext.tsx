import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import * as SecureStore from 'expo-secure-store';

import { AUTH0_AUDIENCE, AUTH0_CLIENT_ID, AUTH0_DOMAIN, AUTH0_REALM } from '../config/auth';
import { setAuthToken } from '../api';

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

function createAuthClient() {
  if (!AUTH0_DOMAIN || !AUTH0_CLIENT_ID) {
    return null;
  }
  try {
    // dynamic require to avoid crashing Expo Go if native module is unavailable
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Auth0 = require('react-native-auth0').default;
    return new Auth0({ domain: AUTH0_DOMAIN, clientId: AUTH0_CLIENT_ID });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[auth] Auth0 client unavailable, running in offline/demo mode', err);
    return null;
  }
}

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
  const auth0Ref = useRef(createAuthClient());
  const authEnabled = Boolean(auth0Ref.current);

  const hydrateProfile = useCallback(async (accessToken: string) => {
    if (!auth0Ref.current) {
      return;
    }
    const details = await auth0Ref.current.auth.userInfo({ token: accessToken });
    const derivedName = details.name || (details as any)?.user_metadata?.name || undefined;
    setProfile({ name: derivedName, email: details.email });
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!authEnabled) {
        setLoading(false);
        return;
      }
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
    if (!auth0Ref.current) {
      throw new Error('Sign-in unavailable in this build. Use the dev client or set Auth0 env vars.');
    }
      const credentials = await auth0Ref.current.auth.passwordRealm({
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
      if (!auth0Ref.current) {
        throw new Error('Sign-up unavailable in this build. Use the dev client or set Auth0 env vars.');
      }
      try {
        await auth0Ref.current.auth.createUser({
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
    if (!auth0Ref.current) {
      throw new Error('Password reset unavailable in this build.');
    }
    try {
      await auth0Ref.current.auth.resetPassword({
        email: email.trim(),
        connection: AUTH0_REALM,
      });
    } catch (err: any) {
      const description = err?.json?.description || err?.message || 'Unable to send reset instructions';
      throw new Error(description);
    }
  }, []);

  const logout = useCallback(async () => {
    if (auth0Ref.current) {
      try {
        await auth0Ref.current.webAuth.clearSession();
      } catch {
        // ignore
      }
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
