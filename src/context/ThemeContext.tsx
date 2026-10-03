import React, { createContext, useContext, useState, useEffect } from 'react';

export type AppearanceMode = 'adaptive' | 'light' | 'dark';
export type ColorPalette = 'default' | 'serene' | 'emerald' | 'sunset';

export type ThemeMode =
  | 'dotgui-dark'
  | 'dotgui-light'
  | 'nordic-slate'
  | 'nordic-slate-light'
  | 'nordic-slate-dark'
  | 'emerald'
  | 'emerald-light'
  | 'emerald-dark'
  | 'emerald-adaptive'
  | 'sunset'
  | 'sunset-light'
  | 'sunset-dark'
  | 'sunset-adaptive'
  | 'system'
  | 'cyberpunk';

export type FontFamily = 'geist' | 'inter' | 'mono' | 'outfit' | 'space';

export function parseTheme(rawTheme: string | null): { appearance: AppearanceMode; palette: ColorPalette } {
  if (!rawTheme) return { appearance: 'adaptive', palette: 'default' };
  switch (rawTheme) {
    case 'dotgui-light':
      return { appearance: 'light', palette: 'default' };
    case 'dotgui-dark':
      return { appearance: 'dark', palette: 'default' };
    case 'system':
      return { appearance: 'adaptive', palette: 'default' };

    case 'nordic-slate-light':
      return { appearance: 'light', palette: 'serene' };
    case 'nordic-slate-dark':
      return { appearance: 'dark', palette: 'serene' };
    case 'nordic-slate':
    case 'cyberpunk':
      return { appearance: 'adaptive', palette: 'serene' };

    case 'emerald-light':
      return { appearance: 'light', palette: 'emerald' };
    case 'emerald-dark':
    case 'emerald':
      return { appearance: 'dark', palette: 'emerald' };
    case 'emerald-adaptive':
      return { appearance: 'adaptive', palette: 'emerald' };

    case 'sunset-light':
      return { appearance: 'light', palette: 'sunset' };
    case 'sunset-dark':
    case 'sunset':
      return { appearance: 'dark', palette: 'sunset' };
    case 'sunset-adaptive':
      return { appearance: 'adaptive', palette: 'sunset' };

    default:
      return { appearance: 'adaptive', palette: 'default' };
  }
}

export function buildTheme(appearance: AppearanceMode, palette: ColorPalette): ThemeMode {
  if (palette === 'default') {
    return appearance === 'light' ? 'dotgui-light' : appearance === 'dark' ? 'dotgui-dark' : 'system';
  }
  if (palette === 'serene') {
    return appearance === 'light' ? 'nordic-slate-light' : appearance === 'dark' ? 'nordic-slate-dark' : 'nordic-slate';
  }
  if (palette === 'emerald') {
    return appearance === 'light' ? 'emerald-light' : appearance === 'dark' ? 'emerald-dark' : 'emerald-adaptive';
  }
  if (palette === 'sunset') {
    return appearance === 'light' ? 'sunset-light' : appearance === 'dark' ? 'sunset-dark' : 'sunset-adaptive';
  }
  return 'system';
}

interface ThemeContextType {
  theme: ThemeMode;
  appearanceMode: AppearanceMode;
  colorPalette: ColorPalette;
  fontFamily: FontFamily;
  setTheme: (t: ThemeMode) => void;
  setAppearanceMode: (m: AppearanceMode) => void;
  setColorPalette: (p: ColorPalette) => void;
  setFontFamily: (f: FontFamily) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [appearanceMode, setAppearanceModeState] = useState<AppearanceMode>(() => {
    const saved = localStorage.getItem('fa_theme');
    return parseTheme(saved).appearance;
  });

  const [colorPalette, setColorPaletteState] = useState<ColorPalette>(() => {
    const saved = localStorage.getItem('fa_theme');
    return parseTheme(saved).palette;
  });

  const [fontFamily, setFontState] = useState<FontFamily>(() => {
    return (localStorage.getItem('fa_font') as FontFamily) || 'geist';
  });

  const theme = buildTheme(appearanceMode, colorPalette);

  const setAppearanceMode = (mode: AppearanceMode) => {
    setAppearanceModeState(mode);
    const newTheme = buildTheme(mode, colorPalette);
    localStorage.setItem('fa_theme', newTheme);
  };

  const setColorPalette = (palette: ColorPalette) => {
    setColorPaletteState(palette);
    const newTheme = buildTheme(appearanceMode, palette);
    localStorage.setItem('fa_theme', newTheme);
  };

  const setTheme = (t: ThemeMode) => {
    const parsed = parseTheme(t);
    setAppearanceModeState(parsed.appearance);
    setColorPaletteState(parsed.palette);
    localStorage.setItem('fa_theme', t);
  };

  useEffect(() => {
    const root = document.documentElement;

    const apply = () => {
      const isSystemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      const isDark = appearanceMode === 'dark' ? true : appearanceMode === 'light' ? false : isSystemDark;

      root.classList.remove('dark', 'theme-nordic-slate', 'theme-cyberpunk', 'theme-emerald', 'theme-sunset');

      if (colorPalette === 'serene') {
        root.classList.add('theme-nordic-slate');
      } else if (colorPalette === 'emerald') {
        root.classList.add('theme-emerald');
      } else if (colorPalette === 'sunset') {
        root.classList.add('theme-sunset');
      }

      if (isDark) {
        root.classList.add('dark');
      }
    };

    apply();

    if (appearanceMode === 'adaptive') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const listener = () => apply();
      mediaQuery.addEventListener('change', listener);
      return () => mediaQuery.removeEventListener('change', listener);
    }
  }, [appearanceMode, colorPalette]);

  useEffect(() => {
    localStorage.setItem('fa_font', fontFamily);
    const body = document.body;
    const root = document.documentElement;

    const fontValueMap: Record<FontFamily, string> = {
      geist: "'Geist', 'Inter', -apple-system, sans-serif",
      inter: "'Inter', -apple-system, sans-serif",
      mono: "var(--font-mono)",
      outfit: "'Outfit', -apple-system, sans-serif",
      space: "'Space Grotesk', -apple-system, sans-serif",
    };

    const activeFont = fontValueMap[fontFamily] || fontValueMap.geist;

    root.style.setProperty('--font-sans', activeFont);
    root.style.setProperty('--font-active', activeFont);
    body.style.fontFamily = activeFont;
  }, [fontFamily]);

  const setFontFamily = (f: FontFamily) => setFontState(f);

  return (
    <ThemeContext.Provider
      value={{
        theme,
        appearanceMode,
        colorPalette,
        fontFamily,
        setTheme,
        setAppearanceMode,
        setColorPalette,
        setFontFamily,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
};
