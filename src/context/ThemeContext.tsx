import React, { createContext, useContext, useState, useEffect } from 'react';

export type ThemeMode = 'dotgui-dark' | 'dotgui-light' | 'cyberpunk' | 'emerald' | 'sunset' | 'system';
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
    return (localStorage.getItem('fa_theme') as ThemeMode) || 'system';
  });

  const [fontFamily, setFontState] = useState<FontFamily>(() => {
    return (localStorage.getItem('fa_font') as FontFamily) || 'geist';
  });

  useEffect(() => {
    localStorage.setItem('fa_theme', theme);
    const root = document.documentElement;

    const applyTheme = (currentTheme: ThemeMode) => {
      let resolvedTheme = currentTheme;
      if (currentTheme === 'system') {
        const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        resolvedTheme = isDark ? 'dotgui-dark' : 'dotgui-light';
      }

      root.classList.remove('dark', 'theme-cyberpunk', 'theme-emerald', 'theme-sunset');
      if (resolvedTheme === 'dotgui-dark') {
        root.classList.add('dark');
      } else if (resolvedTheme === 'cyberpunk') {
        root.classList.add('dark', 'theme-cyberpunk');
      } else if (resolvedTheme === 'emerald') {
        root.classList.add('dark', 'theme-emerald');
      } else if (resolvedTheme === 'sunset') {
        root.classList.add('dark', 'theme-sunset');
      }
    };

    applyTheme(theme);

    if (theme === 'system') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const listener = () => applyTheme('system');
      mediaQuery.addEventListener('change', listener);
      return () => mediaQuery.removeEventListener('change', listener);
    }
  }, [theme]);

  useEffect(() => {
    localStorage.setItem('fa_font', fontFamily);
    const body = document.body;
    body.classList.remove('font-sans-custom', 'font-mono-custom', 'font-display-custom');

    if (fontFamily === 'mono') body.style.fontFamily = 'var(--font-mono)';
    else if (fontFamily === 'inter') body.style.fontFamily = "'Inter', sans-serif";
    else if (fontFamily === 'outfit') body.style.fontFamily = "'Outfit', sans-serif";
    else if (fontFamily === 'space') body.style.fontFamily = "'Space Grotesk', sans-serif";
    else body.style.fontFamily = 'var(--font-sans)';
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
