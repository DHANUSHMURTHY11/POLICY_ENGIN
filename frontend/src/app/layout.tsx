import type { Metadata } from 'next';
import './globals.css';
import { AuthProvider } from '@/contexts/auth-context';
import { AIProvider } from '@/contexts/AIContext';
import { ThemeProvider, ThemeScript } from '@/contexts/ThemeContext';

export const metadata: Metadata = {
    title: 'BaikalSphere Policy Engine',
    description: 'AI-Powered Dynamic Policy Authoring Platform',
};

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html lang="en" className="dark" suppressHydrationWarning>
            <head>
                <ThemeScript />
            </head>
            <body>
                <ThemeProvider>
                    <AuthProvider>
                        <AIProvider>{children}</AIProvider>
                    </AuthProvider>
                </ThemeProvider>
            </body>
        </html>
    );
}
