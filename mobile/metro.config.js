const path = require('path');
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

module.exports = config;
