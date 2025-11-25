const fs = require('fs');
const path = require('path');
const { resolve } = require('metro-resolver');
const { getDefaultConfig } = require('expo/metro-config');

const projectRoot = __dirname;
const config = getDefaultConfig(projectRoot);
const reactPath = path.join(projectRoot, 'node_modules', 'react');

config.resolver = config.resolver || {};
config.resolver.unstable_enablePackageExports = true;
const extraNodeModules = {
  ...(config.resolver.extraNodeModules || {}),
  'sentry-expo': path.join(projectRoot, 'sentryShim.js'),
  'react/jsx-runtime': path.join(reactPath, 'jsx-runtime.js'),
  'react/jsx-dev-runtime': path.join(reactPath, 'jsx-dev-runtime.js'),
};

config.resolver.extraNodeModules = extraNodeModules;

// Work around Metro failing to resolve the relative import used by color-convert
// (dependency of chalk/ansi-styles). The file exists as conversions.js, so if
// Metro can't find it we point directly to the correct path.
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const origin = context.originModulePath || '';

  // Work around Metro missing relative imports inside some deps -----------------

  // color-convert (dependency of chalk/ansi-styles)
  if (
    /node_modules[\\/]+color-convert[\\/]+route\.js$/.test(origin) &&
    moduleName === './conversions'
  ) {
    return {
      type: 'sourceFile',
      filePath: path.join(path.dirname(origin), 'conversions.js'),
    };
  }

  // Force color-convert to local shim to avoid resolution/SHA-1 errors
  if (moduleName === 'color-convert') {
    const shim = path.join(projectRoot, 'metro-shims', 'color-convert.js');
    if (fs.existsSync(shim)) {
      return { type: 'sourceFile', filePath: shim };
    }
  }

  // Force es-object-atoms to local shim to avoid resolution/SHA-1 errors
  if (moduleName === 'es-object-atoms' || moduleName.startsWith('es-object-atoms/')) {
    const subpath =
      moduleName === 'es-object-atoms' ? 'index.js' : moduleName.slice('es-object-atoms/'.length);
    const filename = path.extname(subpath) ? subpath : `${subpath}.js`;
    const shim = path.join(projectRoot, 'metro-shims', 'es-object-atoms', filename);
    if (fs.existsSync(shim)) {
      return { type: 'sourceFile', filePath: shim };
    }
  }

  // react-native-gesture-handler GestureDetector on web
  // The path in the error is: .../node_modules/react-native-gesture-handler/lib/module/handlers/gestures/GestureDetector/index.js
  const isRnghGestureDetector =
    origin.includes('react-native-gesture-handler') &&
    origin.includes('GestureDetector') &&
    origin.endsWith('index.js');

  if (isRnghGestureDetector && moduleName === './useDetectorUpdater') {
    const shim = path.join(projectRoot, 'metro-shims', 'rngh-useDetectorUpdater.js');
    if (fs.existsSync(shim)) {
      return { type: 'sourceFile', filePath: shim };
    }
  }

  // expo-haptics has no web implementation; provide a minimal noop shim
  if (platform === 'web' && moduleName === 'expo-haptics') {
    const shim = path.join(projectRoot, 'metro-shims', 'expo-haptics-web.js');
    return { type: 'sourceFile', filePath: shim };
  }

  return resolve(context, moduleName, platform);
};

module.exports = config;
