export const colors = {
  background: '#FFF3E6', // creamy peach base
  surface: '#FFEAD9',
  card: '#FFE1CC',
  accent: '#FAD5BD',
  primary: '#E49A6A', // cream/peach accent
  primaryStrong: '#C46C3D',
  primaryFaint: 'rgba(228, 154, 106, 0.18)',
  secondary: '#F5C8A6',
  text: '#2A1A13',
  muted: '#7B5A47',
  mutedStrong: '#4C342A',
  border: '#F0D3BE',
  overlay: 'rgba(196, 108, 61, 0.14)',
  rose: '#FF9BBF',
  roseStrong: '#FF6FA8',
  roseGlow: '#FFD2E4',
  royalDeep: '#2A150F',
  royalMid: '#3A1D14',
  royalHighlight: '#F6C99E',
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
    backgroundColor: '#FFF3E6',
  },
  subtle: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
    backgroundColor: '#FFF3E6',
  },
  deep3d: {
    shadowColor: '#C46C3D',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 10,
    backgroundColor: '#FFEAD9',
  },
};

export const gradients = {
  royal3D: ['#FFF0E0', '#FFE0CC'] as const,
  glass: ['rgba(255,255,255,0.8)', 'rgba(255,243,230,0.6)'] as const,
  primary3D: ['#E49A6A', '#C46C3D'] as const,
};
