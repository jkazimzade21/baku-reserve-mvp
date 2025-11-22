const expoPreset = require('jest-expo/jest-preset');

module.exports = {
  ...expoPreset,
  preset: 'jest-expo',
  testEnvironment: 'jsdom',
  setupFiles: ['<rootDir>/jest/setup-env.js', ...expoPreset.setupFiles, '<rootDir>/jest/setup.js'],
  setupFilesAfterEnv: ['@testing-library/jest-native/extend-expect'],
  transform: {
    ...expoPreset.transform,
    'node_modules/react-native/.+\\.js$': [
      'babel-jest',
      {
        presets: ['babel-preset-expo', '@babel/preset-flow'],
      },
    ],
    '\\.[jt]sx?$': [
      'babel-jest',
      {
        presets: ['babel-preset-expo', '@babel/preset-flow'],
        plugins: ['@babel/plugin-transform-flow-strip-types'],
      },
    ],
  },
  transformIgnorePatterns: [
    ...expoPreset.transformIgnorePatterns,
    'node_modules/(?!(?:react-native|@react-native|expo(nent)?|@expo(nent)?|expo-modules-core|expo-font|expo-asset|expo-constants|react-clone-referenced-element|@react-navigation|@testing-library)/)',
  ],
  moduleNameMapper: {
    '^react-native/jest/(mock|setup)(\\.js)?$': '<rootDir>/jest/mocks/$1.js',
  },
};
