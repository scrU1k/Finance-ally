import React, { createContext, useContext, useState, useEffect } from 'react';

export type ThemeMode = 'dotgui-dark' | 'dotgui-light' | 'cyberpunk' | 'emerald' | 'sunset' | 'minimal';
export type MinimalSub = 'light' | 'dark' | 'system';
export type FontFamily = 'geist' | 'inter' | 'mono' | 'outfit' | 'space';

interface ThemeContextType {
  theme: ThemeMode;
  minimalSub: MinimalSub;
  fontFamily: FontFamily;
  setTheme: (t: ThemeMode) => void;
  setMinimalSub: (s: MinimalSub) => void;
  setFontFamily: (f: FontFamily) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setThemeState] = useState<ThemeMode>(() => {
    return (localStorage.getItem('fa_theme') as ThemeMode) || 'dotgui-dark';
  });

  const [minimalSub, setMinimalSubState] = useState<MinimalSub>(() => {
    return (localStorage.getItem('fa_minimal_sub') as MinimalSub) || 'dark';
  });

  const [fontFamily, setFontState] = useState<FontFamily>(() => {
    return (localStorage.getItem('fa_font') as FontFamily) || 'geist';
  });

  useEffect(() => {
    localStorage.setItem('fa_theme', theme);
    localStorage.setItem('fa_minimal_sub', minimalSub);
    
    const root = document.documentElement;
    root.classList.remove(
      'dark',
      'theme-cyberpunk',
      'theme-emerald',
      'theme-sunset',
      'theme-minimal-light',
      'theme-minimal-dark'
    );

    const handleSystemTheme = (e: MediaQueryListEvent | MediaQueryList) => {
      if (theme === 'minimal' && minimalSub === 'system') {
        if (e.matches) {
          root.classList.add('dark', 'theme-minimal-dark');
        } else {
          root.classList.add('theme-minimal-light');
        }
      }
    };

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

    if (theme === 'dotgui-dark') {
      root.classList.add('dark');
    } else if (theme === 'cyberpunk') {
      root.classList.add('dark', 'theme-cyberpunk');
    } else if (theme === 'emerald') {
      root.classList.add('dark', 'theme-emerald');
    } else if (theme === 'sunset') {
      root.classList.add('dark', 'theme-sunset');
    } else if (theme === 'minimal') {
      if (minimalSub === 'light') {
        root.classList.add('theme-minimal-light');
      } else if (minimalSub === 'dark') {
        root.classList.add('dark', 'theme-minimal-dark');
      } else if (minimalSub === 'system') {
        // Initial setup
        if (mediaQuery.matches) {
          root.classList.add('dark', 'theme-minimal-dark');
        } else {
          root.classList.add('theme-minimal-light');
        }
        // Listen for system preference changes
        mediaQuery.addEventListener('change', handleSystemTheme);
      }
    }

    return () => {
      mediaQuery.removeEventListener('change', handleSystemTheme);
    };
  }, [theme, minimalSub]);

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
  const setMinimalSub = (s: MinimalSub) => setMinimalSubState(s);
  const setFontFamily = (f: FontFamily) => setFontState(f);

  return (
    <ThemeContext.Provider value={{ theme, minimalSub, fontFamily, setTheme, setMinimalSub, setFontFamily }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
};
