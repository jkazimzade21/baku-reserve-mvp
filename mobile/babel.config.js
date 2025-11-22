module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    // Keep this array minimal; the Reanimated plugin MUST be last.
    plugins: [
      'react-native-reanimated/plugin',
    ],
  };
};
