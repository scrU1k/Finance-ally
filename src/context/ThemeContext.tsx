import React, { createContext, useContext, useState, useEffect } from 'react';

export type ThemeMode = 'dotgui-dark' | 'dotgui-light' | 'nordic-slate' | 'nordic-slate-light' | 'nordic-slate-dark' | 'emerald' | 'sunset' | 'system' | 'cyberpunk';
export type FontFamily = 'geist' | 'inter' | 'mono' | 'outfit' | 'space';

interface ThemeContextType {
  theme: ThemeMode;
  fontFamily: FontFamily;
  setTheme: (t: ThemeMode) => void;
  setFontFamily: (f: FontFamily) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setThemeState] = useState<ThemeMode>(() => {
    const saved = localStorage.getItem('fa_theme') as ThemeMode;
    if (saved === 'cyberpunk') return 'nordic-slate';
    return saved || 'system';
  });

  const [fontFamily, setFontState] = useState<FontFamily>(() => {
    return (localStorage.getItem('fa_font') as FontFamily) || 'geist';
  });

  useEffect(() => {
    localStorage.setItem('fa_theme', theme);
    const root = document.documentElement;

    const applyTheme = (currentTheme: ThemeMode) => {
      let resolvedDark = false;
      const isSystemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

      root.classList.remove('dark', 'theme-nordic-slate', 'theme-cyberpunk', 'theme-emerald', 'theme-sunset');

      if (currentTheme === 'dotgui-dark') {
        resolvedDark = true;
      } else if (currentTheme === 'dotgui-light') {
        resolvedDark = false;
      } else if (currentTheme === 'system') {
        resolvedDark = isSystemDark;
      } else if (currentTheme === 'nordic-slate-dark') {
        root.classList.add('theme-nordic-slate');
        resolvedDark = true;
      } else if (currentTheme === 'nordic-slate-light') {
        root.classList.add('theme-nordic-slate');
        resolvedDark = false;
      } else if (currentTheme === 'nordic-slate' || currentTheme === 'cyberpunk') {
        root.classList.add('theme-nordic-slate');
        resolvedDark = isSystemDark;
      } else if (currentTheme === 'emerald') {
        root.classList.add('theme-emerald');
        resolvedDark = true;
      } else if (currentTheme === 'sunset') {
        root.classList.add('theme-sunset');
        resolvedDark = true;
      }

      if (resolvedDark) {
        root.classList.add('dark');
      } else {
        root.classList.remove('dark');
      }
    };

    applyTheme(theme);

    if (theme === 'system' || theme === 'nordic-slate' || theme === 'cyberpunk') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const listener = () => applyTheme(theme);
      mediaQuery.addEventListener('change', listener);
      return () => mediaQuery.removeEventListener('change', listener);
    }
  }, [theme]);

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

    // Dynamically update root CSS variables so all elements with font-sans or inheriting body style reflect the selected font immediately
    root.style.setProperty('--font-sans', activeFont);
    root.style.setProperty('--font-active', activeFont);
    body.style.fontFamily = activeFont;
  }, [fontFamily]);

  const setTheme = (t: ThemeMode) => setThemeState(t);
  const setFontFamily = (f: FontFamily) => setFontState(f);

  return (
    <ThemeContext.Provider value={{ theme, fontFamily, setTheme, setFontFamily }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
};
