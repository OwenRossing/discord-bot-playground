import type { Theme } from '../types.js';
import { classicTheme } from './classic.js';
import { pixelTheme } from './pixel.js';

export const THEMES: Record<string, Theme> = {
  classic: classicTheme,
  pixel: pixelTheme,
};

export const DEFAULT_THEME = 'classic';
export const themeList = () => Object.values(THEMES);
