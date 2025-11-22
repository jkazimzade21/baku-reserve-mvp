module.exports = {
  root: true,
  extends: [
    '@react-native-community',
    'plugin:react-hooks/recommended',
    'plugin:react-native/all',
    'plugin:@typescript-eslint/recommended',
  ],
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2021,
    sourceType: 'module',
    tsconfigRootDir: __dirname,
  },
  plugins: [
    '@typescript-eslint',
    'react',
    'react-hooks',
    'react-native',
    'import',
  ],
  env: {
    'react-native/react-native': true,
    es2021: true,
    jest: true,
  },
  ignorePatterns: [
    'node_modules/',
    'ios/',
    'android/',
    'dist/',
    'build/',
    'coverage/',
    'code_dump/',
  ],
  settings: {
    react: {
      version: 'detect',
    },
    'import/resolver': {
      typescript: {},
    },
  },
  rules: {
    '@typescript-eslint/no-unused-vars': 'off',
    '@typescript-eslint/no-explicit-any': 'off',
    '@typescript-eslint/no-var-requires': 'off',
    '@typescript-eslint/no-shadow': 'off',
    'react/react-in-jsx-scope': 'off',
    'react-native/no-inline-styles': 'off',
    'react-native/split-platform-components': 'off',
    'import/no-unresolved': 'off',
    'react/no-unstable-nested-components': ['warn', { allowAsProps: true }],
    'react-native/sort-styles': 'off',
    'no-bitwise': 'off',
    'react-hooks/exhaustive-deps': 'off',
    'react-hooks/rules-of-hooks': 'off',
    'react-native/no-unused-styles': 'off',
    'react-native/no-color-literals': 'off',
    'eslint-comments/no-unused-disable': 'off',
    curly: 'off',
    'comma-dangle': 'off',
    quotes: 'off',
    'no-void': 'off',
    'prettier/prettier': 'off',
  },
  overrides: [
    {
      files: ['**/__tests__/**/*.{js,jsx,ts,tsx}'],
      rules: {
        '@typescript-eslint/no-unused-vars': 'off',
      },
    },
    {
      files: ['**/*.{js,cjs}'],
      rules: {
        '@typescript-eslint/no-var-requires': 'off',
        '@typescript-eslint/no-unused-vars': 'off',
      },
    },
  ],
};
