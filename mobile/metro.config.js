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
  const isColorConvertRoute = /node_modules[\\/]+color-convert[\\/]+route\.js$/.test(
    context.originModulePath,
  );

  if (isColorConvertRoute && moduleName === './conversions') {
    return {
      type: 'sourceFile',
      filePath: path.join(path.dirname(context.originModulePath), 'conversions.js'),
    };
  }

  return resolve(context, moduleName, platform);
};

module.exports = config;
