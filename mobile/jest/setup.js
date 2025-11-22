if (typeof global.__DEV__ === 'undefined') {
  global.__DEV__ = true;
}

if (!process.env.EXPO_OS) {
  process.env.EXPO_OS = 'ios';
}

if (typeof global.setImmediate === 'undefined') {
  global.setImmediate = (fn, ...args) => setTimeout(fn, 0, ...args);
}

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Light: 'light' },
}));

jest.mock('expo-secure-store', () => ({
  setItemAsync: jest.fn(() => Promise.resolve()),
  getItemAsync: jest.fn(() => Promise.resolve(null)),
  deleteItemAsync: jest.fn(() => Promise.resolve()),
}));

jest.mock('@expo/vector-icons', () => {
  const React = require('react');
  const { Text } = require('react-native');

  const createIconStub = (defaultName) =>
    function Icon({ name = defaultName, ...props }) {
      return React.createElement(Text, { accessibilityRole: 'image', ...props }, name);
    };

  return {
    Feather: createIconStub('Feather'),
    Ionicons: createIconStub('Ionicons'),
    MaterialCommunityIcons: createIconStub('MaterialCommunityIcons'),
    MaterialIcons: createIconStub('MaterialIcons'),
    default: createIconStub('Icon'),
  };
});

jest.mock('react-native-auth0', () => {
  return function MockAuth0() {
    return {
      webAuth: {
        authorize: jest.fn(async () => ({ accessToken: 'test-token' })),
        clearSession: jest.fn(async () => undefined),
      },
      auth: {
        userInfo: jest.fn(async () => ({ name: 'Test User', email: 'test@example.com' })),
        passwordRealm: jest.fn(async () => ({ accessToken: 'test-token' })),
      },
    };
  };
});

const originalWarn = console.warn;
const expoOsWarning = /process\.env\.EXPO_OS is not defined/i;
console.warn = (...args) => {
  if (typeof args[0] === 'string' && expoOsWarning.test(args[0])) {
    return;
  }
  originalWarn(...args);
};
