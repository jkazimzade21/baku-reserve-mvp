import Constants from 'expo-constants';

const extra = (Constants.expoConfig?.extra ?? {}) as {
  auth0Domain?: string | null;
  auth0ClientId?: string | null;
  auth0Audience?: string | null;
  auth0Realm?: string | null;
};

export const AUTH0_DOMAIN = extra.auth0Domain ?? process.env.EXPO_PUBLIC_AUTH0_DOMAIN ?? '';
export const AUTH0_CLIENT_ID = extra.auth0ClientId ?? process.env.EXPO_PUBLIC_AUTH0_CLIENT_ID ?? '';
export const AUTH0_AUDIENCE = extra.auth0Audience ?? process.env.EXPO_PUBLIC_AUTH0_AUDIENCE ?? '';
export const AUTH0_REALM =
  extra.auth0Realm ?? process.env.EXPO_PUBLIC_AUTH0_REALM ?? 'Username-Password-Authentication';

if (__DEV__) {
  // eslint-disable-next-line no-console
  console.log('[auth] config', {
    domain: AUTH0_DOMAIN,
    clientId: AUTH0_CLIENT_ID,
    audience: AUTH0_AUDIENCE,
    realm: AUTH0_REALM,
  });
  if (!AUTH0_DOMAIN) {
    // eslint-disable-next-line no-console
    console.warn('[auth] Missing Auth0 domain. Set EXPO_PUBLIC_AUTH0_DOMAIN.');
  }
  if (!AUTH0_CLIENT_ID) {
    // eslint-disable-next-line no-console
    console.warn('[auth] Missing Auth0 client id. Set EXPO_PUBLIC_AUTH0_CLIENT_ID.');
  }
}
