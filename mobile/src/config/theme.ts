export const colors = {
  background: '#FFFDF9', // royal white / luxury white
  surface: '#FFF9F3',
  card: '#FFF4EB',
  accent: '#FDE3D2',
  primary: '#E5A27A', // cream/peach accent
  primaryStrong: '#C97845',
  primaryFaint: 'rgba(229, 162, 122, 0.16)',
  secondary: '#F6D7C3',
  text: '#2C1F16',
  muted: '#7A5F4E',
  mutedStrong: '#4D3428',
  border: '#F1DCCD',
  overlay: 'rgba(201, 151, 118, 0.15)',
  success: '#2D8A6E',
  info: '#4D7EA8',
  danger: '#C1493C',
};

export const spacing = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  pill: 999,
};

export const shadow = {
  card: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
    // Ensure Android can compute shadow without complaining about transparent backgrounds
    backgroundColor: '#FFFDF9',
  },
  subtle: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
    backgroundColor: '#FFFDF9',
  },
};
