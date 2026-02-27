'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';

type Theme = 'dark' | 'light';

interface ThemeContextType {
    theme: Theme;
    toggleTheme: () => void;
    isDark: boolean;
}

const ThemeContext = createContext<ThemeContextType>({
    theme: 'dark',
    toggleTheme: () => { },
    isDark: true,
});

/**
 * Inline script to inject into <head> before React hydrates.
 * This prevents the white flash when the user has selected light mode.
 * We read localStorage synchronously and set the class on <html>.
 */
const ANTI_FLASH_SCRIPT = `
(function() {
  try {
    var t = localStorage.getItem('baikal-theme');
    var root = document.documentElement;
    if (t === 'light') {
      root.classList.add('light');
      root.classList.remove('dark');
    } else {
      root.classList.add('dark');
      root.classList.remove('light');
    }
  } catch(e) {}
})();
`;

export function ThemeProvider({ children }: { children: React.ReactNode }) {
    const [theme, setTheme] = useState<Theme>('dark');
    const [mounted, setMounted] = useState(false);

    // Read persisted theme on mount
    useEffect(() => {
        const stored = localStorage.getItem('baikal-theme') as Theme | null;
        const initial = stored === 'light' ? 'light' : 'dark';
        setTheme(initial);
        applyTheme(initial);
        setMounted(true);
    }, []);

    const applyTheme = (t: Theme) => {
        const root = document.documentElement;
        if (t === 'light') {
            root.classList.add('light');
            root.classList.remove('dark');
        } else {
            root.classList.add('dark');
            root.classList.remove('light');
        }
    };

    const toggleTheme = useCallback(() => {
        setTheme(prev => {
            const next = prev === 'dark' ? 'light' : 'dark';
            localStorage.setItem('baikal-theme', next);
            applyTheme(next);
            return next;
        });
    }, []);

    // Prevent flash — render nothing until mounted
    if (!mounted) {
        return <>{children}</>;
    }

    return (
        <ThemeContext.Provider value={{ theme, toggleTheme, isDark: theme === 'dark' }}>
            {children}
        </ThemeContext.Provider>
    );
}

/**
 * Anti-FOUC script component — render this in the root layout's <head>.
 * Uses dangerouslySetInnerHTML to inject a synchronous script that applies
 * the theme class before React paints.
 */
export function ThemeScript() {
    return (
        <script dangerouslySetInnerHTML={{ __html: ANTI_FLASH_SCRIPT }} />
    );
}

export function useTheme() {
    return useContext(ThemeContext);
}
