import type { Config } from 'tailwindcss';

const config: Config = {
    content: [
        './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
        './src/components/**/*.{js,ts,jsx,tsx,mdx}',
        './src/app/**/*.{js,ts,jsx,tsx,mdx}',
    ],
    darkMode: 'class',
    theme: {
        extend: {
            colors: {
                midnight: {
                    50: '#e8eaf0',
                    100: '#c5c9d6',
                    200: '#9fa5bb',
                    300: '#7881a0',
                    400: '#5b668b',
                    500: '#3e4b77',
                    600: '#37446f',
                    700: '#2d3964',
                    800: '#252f59',
                    900: '#171e45',
                    950: '#0d1225',
                },
                accent: {
                    blue: '#3b82f6',
                    cyan: '#06b6d4',
                    emerald: '#10b981',
                    amber: '#f59e0b',
                    rose: '#f43f5e',
                    violet: '#8b5cf6',
                },
            },
            fontFamily: {
                sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
            },
            animation: {
                'fade-in': 'fadeIn 0.3s ease-out',
                'slide-up': 'slideUp 0.3s ease-out',
                'slide-in-right': 'slideInRight 0.3s ease-out',
                'pulse-glow': 'pulseGlow 2s ease-in-out infinite',
                'pulse-glow-purple': 'pulseGlowPurple 2s ease-in-out infinite',
            },
            keyframes: {
                fadeIn: {
                    '0%': { opacity: '0' },
                    '100%': { opacity: '1' },
                },
                slideUp: {
                    '0%': { opacity: '0', transform: 'translateY(10px)' },
                    '100%': { opacity: '1', transform: 'translateY(0)' },
                },
                slideInRight: {
                    '0%': { opacity: '0', transform: 'translateX(20px)' },
                    '100%': { opacity: '1', transform: 'translateX(0)' },
                },
                pulseGlow: {
                    '0%, 100%': { boxShadow: '0 0 5px rgba(59,130,246,0.3)' },
                    '50%': { boxShadow: '0 0 20px rgba(59,130,246,0.6)' },
                },
                pulseGlowPurple: {
                    '0%, 100%': { boxShadow: '0 0 5px rgba(167,139,250,0.4)', borderColor: 'rgba(167,139,250,0.3)' },
                    '50%': { boxShadow: '0 0 20px rgba(167,139,250,0.8)', borderColor: 'rgba(167,139,250,0.8)' },
                },
            },
        },
    },
    plugins: [],
};
export default config;
