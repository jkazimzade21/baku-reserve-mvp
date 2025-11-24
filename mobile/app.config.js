const fs = require('fs');
const path = require('path');

const appJson = require('./app.json');

const envOverrideTracker = new Set();

const getGlobalProcessEnv = () => {
  try {
    // eslint-disable-next-line no-new-func
    return new Function('return (typeof process !== "undefined" && process.env) || undefined;')();
  } catch {
    return undefined;
  }
};

const readEnv = (key) => {
  const localEnv = typeof process !== 'undefined' ? process.env : undefined;
  const globalEnv = getGlobalProcessEnv();
  const localHasKey = Boolean(localEnv && Object.prototype.hasOwnProperty.call(localEnv, key));

  if (localHasKey) {
    const value = localEnv[key];
    if (typeof value === 'string') {
      envOverrideTracker.add(key);
      if (globalEnv) {
        globalEnv[key] = value;
      }
      if (process.env.NODE_ENV === 'test') {
        delete localEnv[key];
        if (globalEnv && globalEnv !== localEnv) {
          delete globalEnv[key];
        }
        envOverrideTracker.delete(key);
      }
      return value;
    }
    if (envOverrideTracker.has(key)) {
      envOverrideTracker.delete(key);
    }
    if (globalEnv && Object.prototype.hasOwnProperty.call(globalEnv, key)) {
      delete globalEnv[key];
    }
  } else if (envOverrideTracker.has(key)) {
    envOverrideTracker.delete(key);
    if (globalEnv && Object.prototype.hasOwnProperty.call(globalEnv, key)) {
      delete globalEnv[key];
    }
  }

  const fallback = globalEnv?.[key];
  return typeof fallback === 'string' ? fallback : undefined;
};

const loadLocalOverrides = () => {
  const localPath = path.join(__dirname, 'app.config.local.json');
  if (!fs.existsSync(localPath)) {
    return {};
  }
  try {
    return JSON.parse(fs.readFileSync(localPath, 'utf8'));
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[app.config] Failed to parse app.config.local.json:', err);
    return {};
  }
};

module.exports = ({ config } = {}) => {
  const baseExpoConfig = (config && config.expo) || appJson.expo || {};
  const local = loadLocalOverrides();
  const envApiUrl = readEnv('EXPO_PUBLIC_API_BASE');
  const envAuth0Domain = readEnv('EXPO_PUBLIC_AUTH0_DOMAIN');
  const envAuth0ClientId = readEnv('EXPO_PUBLIC_AUTH0_CLIENT_ID');
  const envAuth0Audience = readEnv('EXPO_PUBLIC_AUTH0_AUDIENCE');
  const envAuth0Realm = readEnv('EXPO_PUBLIC_AUTH0_REALM');
  const envSentryDsn = readEnv('EXPO_PUBLIC_SENTRY_DSN');

  const mergedExtra = {
    ...(baseExpoConfig.extra ?? {}),
    ...((local.expo && local.expo.extra) || {}),
  };

  const baseIosConfig = baseExpoConfig.ios ?? {};
  const localIosConfig = (local.expo && local.expo.ios) || {};
  const mergedIosInfoPlist = {
    ...(baseIosConfig.infoPlist ?? {}),
    ...(localIosConfig.infoPlist ?? {}),
  };
  mergedIosInfoPlist.NSAppTransportSecurity = {
    NSAllowsArbitraryLoads: true,
    NSAllowsLocalNetworking: true,
    ...(mergedIosInfoPlist.NSAppTransportSecurity ?? {}),
  };
  const mergedIosConfig = {
    ...baseIosConfig,
    ...localIosConfig,
    infoPlist: mergedIosInfoPlist,
  };

  mergedExtra.eas = {
    ...(mergedExtra.eas ?? {}),
    projectId: '0795e859-7529-4b25-940f-b12fea5a4531',
  };

  if (envApiUrl && envApiUrl.trim().length) {
    mergedExtra.apiUrl = envApiUrl.trim();
  }

  if (envAuth0Domain && envAuth0Domain.trim().length) {
    mergedExtra.auth0Domain = envAuth0Domain.trim();
  }
  if (envAuth0ClientId && envAuth0ClientId.trim().length) {
    mergedExtra.auth0ClientId = envAuth0ClientId.trim();
  }
  if (envAuth0Audience && envAuth0Audience.trim().length) {
    mergedExtra.auth0Audience = envAuth0Audience.trim();
  }
  if (envAuth0Realm && envAuth0Realm.trim().length) {
    mergedExtra.auth0Realm = envAuth0Realm.trim();
  }
  if (envSentryDsn && envSentryDsn.trim().length) {
    mergedExtra.sentryDsn = envSentryDsn.trim();
  } else if (typeof mergedExtra.sentryDsn === 'string') {
    mergedExtra.sentryDsn = mergedExtra.sentryDsn.trim();
  }

  const basePlugins = Array.isArray(baseExpoConfig.plugins) ? baseExpoConfig.plugins : [];
  const localPlugins = Array.isArray(local.expo?.plugins) ? local.expo.plugins : [];
  const pluginEntries = [...basePlugins, ...localPlugins];
  const hasPlugin = (name) =>
    pluginEntries.some((plugin) => (Array.isArray(plugin) ? plugin[0] : plugin) === name);

  if (!hasPlugin('expo-font')) {
    pluginEntries.push('expo-font');
  }

  const mergedPlugins = pluginEntries;

  // Removed withRnLegacyPods plugin - not needed for RN 0.81+ which uses XCFrameworks
  // const rnLegacyPluginPath = './plugins/withRnLegacyPods';
  // if (!hasPlugin(rnLegacyPluginPath)) {
  //   mergedPlugins.push(rnLegacyPluginPath);
  // }

  return {
    ...(config || appJson),
    expo: {
      ...baseExpoConfig,
      ...(local.expo ?? {}),
      owner: 'jkazimzade21',
      plugins: mergedPlugins,
      extra: mergedExtra,
      ios: mergedIosConfig,
    },
  };
};
