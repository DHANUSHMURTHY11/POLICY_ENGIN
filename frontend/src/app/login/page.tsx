'use client';

import React, { useState } from 'react';
import { useAuth } from '@/contexts/auth-context';
import Icon from '@/components/ui/Icon';

export default function LoginPage() {
    const { login } = useAuth();
    const [email, setEmail] = useState('admin@baikalsphere.com');
    const [password, setPassword] = useState('Admin@123');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);
        try {
            await login({ email, password });
        } catch (err: unknown) {
            const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
            setError(detail || 'Login failed. Please check your credentials.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex">
            {/* Left — Branding Panel */}
            <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden items-center justify-center"
                style={{ background: 'linear-gradient(135deg, #0f1424 0%, #1a2035 50%, #0d1225 100%)' }}>
                {/* Decorative orbs */}
                <div className="absolute w-[500px] h-[500px] rounded-full opacity-20"
                    style={{ background: 'radial-gradient(circle, #3b82f6, transparent)', top: '-10%', left: '-10%' }} />
                <div className="absolute w-[400px] h-[400px] rounded-full opacity-15"
                    style={{ background: 'radial-gradient(circle, #8b5cf6, transparent)', bottom: '-5%', right: '-5%' }} />
                <div className="absolute w-[300px] h-[300px] rounded-full opacity-10"
                    style={{ background: 'radial-gradient(circle, #06b6d4, transparent)', top: '40%', right: '20%' }} />

                <div className="relative z-10 text-center px-12">
                    {/* Logo */}
                    <div className="inline-flex items-center gap-3 mb-8">
                        <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
                            style={{ background: 'var(--gradient-blue)', boxShadow: '0 4px 24px rgba(59,130,246,0.4)' }}>
                            <Icon name="shield" size={30} color="#fff" filled />
                        </div>
                        <div className="text-left">
                            <h1 className="text-2xl font-bold text-white tracking-tight">BaikalSphere</h1>
                            <p className="text-xs text-blue-400 font-medium tracking-wider uppercase">Policy Engine</p>
                        </div>
                    </div>
                    <h2 className="text-3xl font-bold text-white mb-4 leading-tight">
                        AI-Powered Dynamic<br />Policy Authoring
                    </h2>
                    <p className="text-sm text-slate-400 max-w-sm mx-auto leading-relaxed">
                        Build, validate, and manage enterprise policies with an intelligent structure builder.
                        Create any policy type with dynamic sections, fields, and conditional logic.
                    </p>

                    {/* Feature pills */}
                    <div className="flex flex-wrap justify-center gap-2 mt-8">
                        {['Dynamic Builder', 'AI Generator', 'Version Control', 'Workflow Engine'].map((f) => (
                            <span key={f} className="px-3 py-1.5 rounded-full text-[11px] font-medium"
                                style={{ background: 'rgba(59,130,246,0.1)', color: '#60a5fa', border: '1px solid rgba(59,130,246,0.2)' }}>
                                {f}
                            </span>
                        ))}
                    </div>
                </div>
            </div>

            {/* Right — Login Form */}
            <div className="w-full lg:w-1/2 flex items-center justify-center px-6"
                style={{ background: 'var(--bg-primary)' }}>
                <div className="w-full max-w-md">
                    {/* Mobile logo */}
                    <div className="lg:hidden flex items-center gap-3 mb-8 justify-center">
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'var(--gradient-blue)' }}>
                            <Icon name="shield" size={20} color="#fff" filled />
                        </div>
                        <span className="text-xl font-bold text-white">BaikalSphere</span>
                    </div>

                    <div className="glass-card p-8">
                        <div className="mb-6">
                            <h2 className="text-xl font-bold text-white">Welcome back</h2>
                            <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>Sign in to your account</p>
                        </div>

                        {error && (
                            <div className="mb-4 px-4 py-3 rounded-xl text-sm" style={{
                                background: 'rgba(244,63,94,0.1)', color: '#fb7185', border: '1px solid rgba(244,63,94,0.2)',
                            }}>
                                {error}
                            </div>
                        )}

                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div>
                                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                                    Email
                                </label>
                                <input
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    className="w-full rounded-xl px-4 py-3 text-sm theme-input"
                                    placeholder="admin@baikalsphere.com"
                                    required
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                                    Password
                                </label>
                                <input
                                    type="password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="w-full rounded-xl px-4 py-3 text-sm theme-input"
                                    placeholder="••••••••"
                                    required
                                />
                            </div>
                            <button
                                type="submit"
                                disabled={loading}
                                className="w-full btn-primary py-3 text-sm flex items-center justify-center gap-2"
                            >
                                {loading ? (
                                    <Icon name="progress_activity" size={18} color="#fff" className="animate-spin" />
                                ) : (
                                    <>
                                        <Icon name="login" size={18} color="#fff" />
                                        Sign In
                                    </>
                                )}
                            </button>
                        </form>

                        <p className="text-center text-xs mt-5" style={{ color: 'var(--text-muted)' }}>
                            Default: admin@baikalsphere.com / Admin@123
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
