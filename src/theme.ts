import { useColorScheme } from 'react-native';

export type Theme = {
  dark: boolean;
  bg: string;
  surface: string;
  surface2: string;
  line: string;
  ink: string;
  muted: string;
  faint: string;
  accent: string; // anything you can tap
  accent2: string;
  accentInk: string; // text on a solid accent background
  accentSoft: string;
  grad1: string; // the aura gradient, from
  grad2: string; // the aura gradient, to
  onGrad: string; // text on the gradient
  glow: number; // strength of the aura behind screens
  protein: string;
  carbs: string;
  fat: string;
  good: string;
  warn: string;
  warnSoft: string;
  scrim: string;
};

// Pantera "aura" palette: deep violet night, electric cyan, hot magenta.
export const darkTheme: Theme = {
  dark: true,
  bg: '#0B0720',
  surface: '#171038',
  surface2: '#241A53',
  line: '#33266B',
  ink: '#F4F0FF',
  muted: '#B1A5DA',
  faint: '#7D72A8',
  accent: '#3EE7FF',
  accent2: '#8B5CFF',
  accentInk: '#0B0720',
  accentSoft: '#13304F',
  grad1: '#E0338A',
  grad2: '#6E45F5',
  onGrad: '#FFFFFF',
  glow: 0.5,
  protein: '#3EE7FF',
  carbs: '#FFC247',
  fat: '#FF6BB5',
  good: '#45F0B5',
  warn: '#FF7A63',
  warnSoft: '#421D2A',
  scrim: 'rgba(6,3,18,0.74)',
};

// The same family on a pale lavender sky, with deeper tones so text stays readable.
export const lightTheme: Theme = {
  dark: false,
  bg: '#F3F0FF',
  surface: '#FFFFFF',
  surface2: '#E9E3FF',
  line: '#D8CFF7',
  ink: '#150D36',
  muted: '#52487A',
  faint: '#877EAE',
  accent: '#0A6FA8',
  accent2: '#6A3DF0',
  accentInk: '#FFFFFF',
  accentSoft: '#DCEFFA',
  grad1: '#C81E75',
  grad2: '#5B32E0',
  onGrad: '#FFFFFF',
  glow: 0.28,
  protein: '#08709F',
  carbs: '#8A5A00',
  fat: '#C42E80',
  good: '#0F8F65',
  warn: '#C23B22',
  warnSoft: '#FCE3DF',
  scrim: 'rgba(21,13,54,0.45)',
};

export function useTheme(): Theme {
  const scheme = useColorScheme();
  return scheme === 'light' ? lightTheme : darkTheme;
}

export const fonts = {
  display: 'Sora_700Bold',
  displaySemi: 'Sora_600SemiBold',
  displayHeavy: 'Sora_800ExtraBold',
  body: 'Manrope_500Medium',
  bodyRegular: 'Manrope_400Regular',
  bodySemi: 'Manrope_600SemiBold',
  bodyBold: 'Manrope_700Bold',
  bodyHeavy: 'Manrope_800ExtraBold',
};
