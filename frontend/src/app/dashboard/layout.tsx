'use client';

import React, { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/auth-context';
import { useAI } from '@/contexts/AIContext';
import { useTheme } from '@/contexts/ThemeContext';
import { aiAPI } from '@/lib/api';
import AIExecutionLogDrawer from '@/components/ai/AIExecutionLogDrawer';
import { HelpAssistant } from '@/components/ui/HelpAssistant';
import Icon from '@/components/ui/Icon';

const NAV_ITEMS = [
    { href: '/dashboard', icon: 'dashboard', label: 'Dashboard', exact: true },
    { href: '/dashboard/policies', icon: 'policy', label: 'Policies', exact: false },
    { href: '/dashboard/workflow', icon: 'account_tree', label: 'Workflow', exact: false },
    { href: '/dashboard/audit', icon: 'history', label: 'Audit', exact: false },
    { href: '/dashboard/admin/workflows', icon: 'admin_panel_settings', label: 'Admin Panel', exact: false },
];


export default function DashboardLayout({ children }: { children: React.ReactNode }) {
    const { user, isAuthenticated, isLoading, logout } = useAuth();
    const router = useRouter();
    const pathname = usePathname();
    const [collapsed, setCollapsed] = useState(false);

    /* ── AI global state ──────────────────────────────────────── */
    const ai = useAI();
    const { theme, toggleTheme, isDark } = useTheme();
    const [providerInfo, setProviderInfo] = useState<{ provider: string; model: string; strict_mode: boolean } | null>(null);

    useEffect(() => {
        aiAPI.getProviderInfo()
            .then(r => setProviderInfo(r.data))
            .catch(() => setProviderInfo(null));
    }, []);

    useEffect(() => {
        if (!isLoading && !isAuthenticated) {
            router.replace('/login');
        }
    }, [isLoading, isAuthenticated, router]);

    /* ── Auto-collapse sidebar on create pages (split layout needs full width) ── */
    useEffect(() => {
        if (pathname.startsWith('/dashboard/policies/create/')) {
            setCollapsed(true);
        }
    }, [pathname]);

    if (isLoading || !isAuthenticated) {
        return (
            <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg-primary)' }}>
                <div className="flex flex-col items-center gap-3">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                        style={{ background: 'var(--gradient-blue)', boxShadow: 'var(--shadow-blue)' }}>
                        <Icon name="progress_activity" size={20} color="#fff" className="animate-spin" />
                    </div>
                    <p className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Loading...</p>
                </div>
            </div>
        );
    }

    const isAdmin = user?.role_name === 'admin' || user?.role_name === 'superadmin';
    const recentCalls = ai.executionLog.length;

    return (
        <div className="min-h-screen flex" style={{ background: 'var(--bg-primary)' }}>
            {/* ═══ Sidebar ═══ */}
            <aside
                className="flex flex-col flex-shrink-0 border-r transition-all duration-300"
                style={{
                    width: collapsed ? 68 : 250,
                    background: 'var(--bg-secondary)',
                    borderColor: 'var(--border-default)',
                }}
            >
                {/* ── Logo Area ─────────────────────────────────── */}
                <div className="h-16 flex items-center justify-between px-4 border-b" style={{ borderColor: 'var(--border-default)' }}>
                    <div className="flex items-center gap-3">
                        <div
                            className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                            style={{
                                background: 'var(--gradient-blue)',
                                boxShadow: '0 2px 12px rgba(59,130,246,0.3)',
                            }}
                        >
                            <Icon name="shield" size={18} color="#fff" filled />
                        </div>
                        {!collapsed && (
                            <div className="animate-fade-in">
                                <span className="text-sm font-bold text-white tracking-tight leading-tight block">BaikalSphere</span>
                                <span className="text-[9px] font-semibold tracking-widest uppercase leading-tight"
                                    style={{ color: 'var(--accent-blue-light)' }}>
                                    Policy Engine
                                </span>
                            </div>
                        )}
                    </div>
                    {!collapsed && (
                        <button
                            onClick={() => setCollapsed(!collapsed)}
                            className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 transition-all hover:bg-white/[0.06]"
                            title="Collapse sidebar"
                        >
                            <Icon name="chevron_left" size={18} color="var(--text-muted)" />
                        </button>
                    )}
                    {collapsed && (
                        <button
                            onClick={() => setCollapsed(!collapsed)}
                            className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 transition-all hover:bg-white/[0.06] absolute left-[18px]"
                            title="Expand sidebar"
                            style={{ marginTop: 62 }}
                        >
                            <Icon name="chevron_right" size={18} color="var(--text-muted)" />
                        </button>
                    )}
                </div>

                {/* ── Navigation ───────────────────────────────── */}
                <nav className="flex-1 py-4 px-2 space-y-1">
                    {NAV_ITEMS.map((item) => {
                        const isActive = item.exact
                            ? pathname === item.href
                            : pathname.startsWith(item.href);
                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                className="relative flex items-center gap-3 rounded-xl text-[13px] font-medium transition-all group"
                                style={{
                                    padding: collapsed ? '10px 0' : '10px 14px',
                                    justifyContent: collapsed ? 'center' : 'flex-start',
                                    background: isActive ? 'rgba(59,130,246,0.08)' : 'transparent',
                                    color: isActive ? '#60a5fa' : 'var(--text-secondary)',
                                    border: isActive ? '1px solid rgba(59,130,246,0.12)' : '1px solid transparent',
                                    boxShadow: isActive ? '0 0 12px rgba(59,130,246,0.06)' : 'none',
                                }}
                            >
                                <Icon
                                    name={item.icon}
                                    size={20}
                                    color={isActive ? '#60a5fa' : 'var(--text-secondary)'}
                                    filled={isActive}
                                    className="flex-shrink-0"
                                />
                                {!collapsed && <span>{item.label}</span>}
                                {/* Tooltip on hover when collapsed */}
                                {collapsed && (
                                    <span
                                        className="absolute left-full ml-3 px-2.5 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50"
                                        style={{
                                            background: 'var(--bg-elevated)',
                                            color: 'var(--text-primary)',
                                            border: '1px solid var(--border-default)',
                                            boxShadow: 'var(--shadow-card)',
                                        }}
                                    >
                                        {item.label}
                                    </span>
                                )}
                            </Link>
                        );
                    })}
                </nav>

                {/* ── AI Provider Info (sidebar bottom) ─────────── */}
                {!collapsed && providerInfo && (
                    <div className="px-3 pb-2">
                        <div className="px-3 py-3 rounded-xl" style={{ background: 'rgba(139,92,246,.04)', border: '1px solid rgba(139,92,246,.08)' }}>
                            <div className="flex items-center gap-2 mb-1.5">
                                <Icon name="smart_toy" size={14} color="#a78bfa" />
                                <span className="text-[10px] font-bold" style={{ color: '#a78bfa' }}>AI Provider</span>
                                {providerInfo.strict_mode && (
                                    <span className="text-[8px] font-bold px-1.5 py-0.5 rounded" style={{ background: 'rgba(245,158,11,.08)', color: '#fbbf24' }}>STRICT</span>
                                )}
                            </div>
                            <p className="text-[10px] font-mono text-white truncate">{providerInfo.provider.toUpperCase()}</p>
                            <p className="text-[9px] font-mono truncate" style={{ color: 'var(--text-muted)' }}>{providerInfo.model}</p>
                        </div>
                    </div>
                )}

                {/* ── User ─────────────────────────────────────── */}
                <div className="px-3 pb-3 border-t pt-3" style={{ borderColor: 'var(--border-default)' }}>
                    <div
                        className="flex items-center gap-2.5 px-2.5 py-2.5 rounded-xl"
                        style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-default)' }}
                    >
                        <div
                            className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0"
                            style={{ background: 'rgba(139,92,246,0.12)', color: '#a78bfa' }}
                        >
                            {user?.full_name?.charAt(0).toUpperCase() || 'U'}
                        </div>
                        {!collapsed && (
                            <div className="flex-1 min-w-0 animate-fade-in">
                                <p className="text-xs font-semibold text-white truncate">{user?.full_name}</p>
                                <p className="text-[10px] truncate" style={{ color: 'var(--text-muted)' }}>{user?.email}</p>
                            </div>
                        )}
                        <button
                            onClick={logout}
                            className="btn-icon flex-shrink-0"
                            title="Logout"
                        >
                            <Icon name="logout" size={16} color="var(--text-muted)" />
                        </button>
                    </div>
                </div>
            </aside>

            {/* ═══ Main Area ═══ */}
            <div className="flex-1 flex flex-col overflow-hidden">
                {/* ── Top Navbar ─────────────────────────────────── */}
                <header
                    className="h-12 flex items-center justify-between px-6 flex-shrink-0 border-b"
                    style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-default)' }}
                >
                    <div className="flex items-center gap-2">
                        {/* Breadcrumb-style path */}
                        <span className="text-[11px] font-medium flex items-center" style={{ color: 'var(--text-muted)' }}>
                            {pathname.split('/').filter(Boolean).map((seg, i, arr) => {
                                const href = '/' + arr.slice(0, i + 1).join('/');
                                const isLast = i === arr.length - 1;
                                return (
                                    <span key={i} className="flex items-center">
                                        {i > 0 && <span className="mx-1.5 opacity-40">/</span>}
                                        {isLast ? (
                                            <span className="px-2 py-1 rounded-md text-white transition-all duration-200 hover:bg-black/20 hover:-translate-y-0.5 hover:shadow-md cursor-default">
                                                {seg.charAt(0).toUpperCase() + seg.slice(1)}
                                            </span>
                                        ) : (
                                            <Link href={href} className="px-2 py-1 rounded-md transition-all duration-200 hover:bg-black/20 hover:-translate-y-0.5 hover:text-white hover:shadow-md cursor-pointer inline-block">
                                                {seg.charAt(0).toUpperCase() + seg.slice(1)}
                                            </Link>
                                        )}
                                    </span>
                                );
                            })}
                        </span>
                    </div>

                    <div className="flex items-center gap-3">
                        {/* ── Theme Toggle ────────────── */}
                        <button
                            onClick={toggleTheme}
                            className="w-8 h-8 rounded-lg flex items-center justify-center transition-all hover:bg-white/[0.06] theme-toggle-btn"
                            title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
                            style={{
                                background: isDark ? 'rgba(245,158,11,0.06)' : 'rgba(99,102,241,0.06)',
                                border: `1px solid ${isDark ? 'rgba(245,158,11,0.12)' : 'rgba(99,102,241,0.12)'}`,
                            }}
                        >
                            <span className="theme-toggle-icon" style={{ display: 'inline-flex', transition: 'transform 0.4s cubic-bezier(0.34,1.56,0.64,1)' }}>
                                <Icon name={isDark ? 'moon' : 'sun'} size={16} color={isDark ? '#fbbf24' : '#6366f1'} />
                            </span>
                        </button>

                        {/* ── AI Execution Log Button ────────── */}
                        <button
                            onClick={() => ai.setDrawerOpen(true)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-semibold transition-all"
                            style={{
                                background: recentCalls > 0 ? 'rgba(59,130,246,.06)' : 'rgba(255,255,255,.02)',
                                border: '1px solid var(--border-default)',
                                color: recentCalls > 0 ? '#60a5fa' : 'var(--text-muted)',
                            }}
                            title="AI Execution Log"
                        >
                            <Icon name="terminal" size={14} />
                            {recentCalls > 0 && (
                                <span className="px-1 py-0.5 rounded text-[8px] font-bold" style={{ background: 'rgba(59,130,246,.1)' }}>
                                    {recentCalls}
                                </span>
                            )}
                        </button>

                        {/* ── Provider chip (admin) ──────────── */}
                        {isAdmin && providerInfo && (
                            <div
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-mono"
                                style={{
                                    background: 'rgba(16,185,129,.06)',
                                    border: '1px solid rgba(16,185,129,.1)',
                                    color: '#34d399',
                                }}
                            >
                                <Icon name="smart_toy" size={14} color="#34d399" />
                                {providerInfo.provider.toUpperCase()} · {providerInfo.model}
                            </div>
                        )}
                    </div>
                </header>

                {/* ── Page Content ──────────────────────────────── */}
                <main className="flex-1 overflow-auto">
                    {children}
                </main>
            </div>

            {/* ═══ Global AI Execution Log Drawer ═══ */}
            <AIExecutionLogDrawer
                isOpen={ai.isDrawerOpen}
                onClose={() => ai.setDrawerOpen(false)}
                log={ai.executionLog}
                onClear={ai.clearLog}
            />

            {/* ═══ Floating Help Assistant ═══ */}
            <HelpAssistant />

            {/* CSS for pulse animation */}
            <style>{`
                @keyframes pulse { 0%,100% { opacity:.7; transform:scale(1); } 50% { opacity:1; transform:scale(1.15); } }
            `}</style>
        </div>
    );
}
