/**
 * zZuP! Design System — single source of truth for the visual language.
 *
 * Brand: expressive violet→fuchsia gradient on true black (see app logo — the
 * hand-painted "Z"). The accent is used sparingly for focus/action; the canvas
 * stays near-black with a clean neutral text hierarchy. No purple-on-purple,
 * no glowing borders — modern, content-first, like Linear / Instagram / X.
 */

export const colors = {
  // Canvas — true-black family (OLED-friendly, matches the logo)
  bg: '#0A0A0C',
  bgElevated: '#111114',
  surface: '#16161B',
  surfaceHi: '#1E1E25',
  surfacePressed: '#26262E',

  // Hairlines — neutral, subtle (NOT purple)
  border: '#26262E',
  borderStrong: '#33333D',

  // Text hierarchy — neutral, high-contrast
  textPrimary: '#F5F5F7',
  textSecondary: '#9B9BA6',
  textTertiary: '#67676F',
  textInverse: '#0A0A0C',

  // Brand accent (violet → fuchsia, from the logo)
  brand: '#A855F7',
  brandStrong: '#9333EA',
  brandSoft: 'rgba(168,85,247,0.14)',
  accentPink: '#EC4899',

  // Semantic
  success: '#34D399',
  danger: '#F87171',
  dangerSoft: 'rgba(248,113,113,0.12)',
  warning: '#FBBF24',
  online: '#34D399',

  white: '#FFFFFF',
  black: '#000000',
} as const;

/** The signature brand gradient — use for the mark, key CTAs, focus rings. */
export const gradients = {
  brand: ['#8B5CF6', '#C026D3', '#EC4899'] as const,      // violet → fuchsia → pink
  brandDiagonal: { start: { x: 0, y: 0 }, end: { x: 1, y: 1 } },
  brandHorizontal: { start: { x: 0, y: 0 }, end: { x: 1, y: 0 } },
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  base: 16,
  lg: 20,
  xl: 24,
  '2xl': 32,
  '3xl': 40,
  '4xl': 56,
} as const;

export const radius = {
  sm: 10,
  md: 14,
  lg: 18,
  xl: 24,
  '2xl': 30,
  full: 999,
} as const;

export const typography = {
  // Display / hero
  display: { fontSize: 34, fontWeight: '800' as const, letterSpacing: -0.5, lineHeight: 40 },
  h1: { fontSize: 28, fontWeight: '800' as const, letterSpacing: -0.4, lineHeight: 34 },
  h2: { fontSize: 22, fontWeight: '700' as const, letterSpacing: -0.3, lineHeight: 28 },
  h3: { fontSize: 18, fontWeight: '700' as const, letterSpacing: -0.2, lineHeight: 24 },
  bodyLg: { fontSize: 16, fontWeight: '500' as const, lineHeight: 22 },
  body: { fontSize: 15, fontWeight: '500' as const, lineHeight: 21 },
  subtle: { fontSize: 14, fontWeight: '500' as const, lineHeight: 20 },
  caption: { fontSize: 13, fontWeight: '500' as const, lineHeight: 18 },
  micro: { fontSize: 11, fontWeight: '600' as const, letterSpacing: 0.3, lineHeight: 14 },
  // Label used on chips / eyebrow text
  eyebrow: { fontSize: 12, fontWeight: '700' as const, letterSpacing: 1.2, lineHeight: 16 },
} as const;

/** Soft ambient shadow for elevated surfaces (use sparingly). */
export const shadow = {
  card: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 20,
    elevation: 6,
  },
  brandGlow: {
    shadowColor: '#A855F7',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 18,
    elevation: 8,
  },
} as const;

/**
 * LIGHT palette — the in-app theme (everything after login). Clean white canvas,
 * near-black text, hairline borders, brand violet→fuchsia as a *sparingly used*
 * accent. Content-first, like Instagram / Airbnb / modern consumer social.
 * Auth screens keep the dark `colors` above; in-app screens import `light`.
 */
export const light = {
  bg: '#FFFFFF',
  bgMuted: '#F6F6F8',       // subtle section / grouped background
  surface: '#FFFFFF',       // cards
  surfaceHi: '#F2F2F5',     // input fills, chips, pressed
  border: '#ECECEF',        // hairline
  borderStrong: '#E1E1E6',

  text: '#0B0B0F',          // near-black primary
  textSecondary: '#6C6C77',
  textTertiary: '#A6A6AF',
  textInverse: '#FFFFFF',

  brand: '#7C3AED',         // violet, tuned for contrast on white
  brandStrong: '#6D28D9',
  brandSoft: '#F3EEFE',     // faint violet tint for chips/active bg
  accentPink: '#EC4899',
  accentPinkSoft: '#FDEBF4',

  success: '#10B981',
  danger: '#EF4444',
  dangerSoft: '#FEECEC',
  online: '#22C55E',
  star: '#F59E0B',

  white: '#FFFFFF',
  black: '#0B0B0F',
} as const;

/** Soft, believable elevation for cards on white. */
export const lightShadow = {
  card: {
    shadowColor: '#0B0B0F',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
  },
  fab: {
    shadowColor: '#7C3AED',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 14,
    elevation: 8,
  },
} as const;

export const theme = { colors, light, gradients, spacing, radius, typography, shadow, lightShadow };
export default theme;
