import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type ThemeMode = 'light' | 'dark' | 'system';

export interface ThemeColors {
  isDark: boolean;
  bg: string;
  headerBg: string;
  cardBg: string;
  cardMutedBg: string;
  border: string;
  borderBrand: string;
  brand: string;
  brandSecondary: string;
  text: string;
  subText: string;
  tertiaryText: string;
  bubbleMe: string;
  bubbleOther: string;
  bubbleOtherBorder: string;
  tabBarBg: string;
  tabBarBorder: string;
  statusBarStyle: 'light' | 'dark';
}

export const darkThemeColors: ThemeColors = {
  isDark: true,
  bg: '#0B0713',
  headerBg: '#13101E',
  cardBg: '#161024',
  cardMutedBg: '#1B132D',
  border: '#261E38',
  borderBrand: '#3B1866',
  brand: '#8B5CF6',
  brandSecondary: '#C084FC',
  text: '#FFFFFF',
  subText: '#A1A1AA',
  tertiaryText: '#71717A',
  bubbleMe: '#8B5CF6',
  bubbleOther: '#161024',
  bubbleOtherBorder: '#261E38',
  tabBarBg: '#13101E',
  tabBarBorder: '#261E38',
  statusBarStyle: 'light',
};

export const lightThemeColors: ThemeColors = {
  isDark: false,
  bg: '#F8FAF9',
  headerBg: '#FFFFFF',
  cardBg: '#FFFFFF',
  cardMutedBg: '#F0FDF4',
  border: '#E2E8F0',
  borderBrand: '#A7F3D0',
  brand: '#10B981',
  brandSecondary: '#059669',
  text: '#0F172A',
  subText: '#64748B',
  tertiaryText: '#94A3B8',
  bubbleMe: '#10B981',
  bubbleOther: '#F0FDF4',
  bubbleOtherBorder: '#D1FAE5',
  tabBarBg: '#FFFFFF',
  tabBarBorder: '#E2E8F0',
  statusBarStyle: 'dark',
};

interface ThemeContextType {
  themeMode: ThemeMode;
  setThemeMode: (mode: ThemeMode) => void;
  colors: ThemeColors;
  isDark: boolean;
}

const THEME_STORAGE_KEY = '@zzup_theme_mode';

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  // Default theme is 'light' (Light Cyber Mint Green) per user requirement
  const [themeMode, setThemeModeState] = useState<ThemeMode>('light');
  const systemColorScheme = useColorScheme();

  useEffect(() => {
    AsyncStorage.getItem(THEME_STORAGE_KEY).then(saved => {
      if (saved === 'dark' || saved === 'light' || saved === 'system') {
        setThemeModeState(saved as ThemeMode);
      }
    }).catch(() => {});
  }, []);

  const setThemeMode = (mode: ThemeMode) => {
    setThemeModeState(mode);
    AsyncStorage.setItem(THEME_STORAGE_KEY, mode).catch(() => {});
  };

  const activeIsDark =
    themeMode === 'system'
      ? systemColorScheme === 'dark'
      : themeMode === 'dark';

  const colors = activeIsDark ? darkThemeColors : lightThemeColors;

  return (
    <ThemeContext.Provider value={{ themeMode, setThemeMode, colors, isDark: activeIsDark }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
