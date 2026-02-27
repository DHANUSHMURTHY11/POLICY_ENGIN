'use client';

import React, { useState, useEffect } from 'react';
import Icon from '@/components/ui/Icon';

interface Props {
    message: string;
    subMessage?: string;
    visible: boolean;
    providerName?: string;
    modelName?: string;
}

export default function AILoadingOverlay({ message, subMessage, visible, providerName, modelName }: Props) {
    const [elapsed, setElapsed] = useState(0);

    useEffect(() => {
        if (!visible) { setElapsed(0); return; }
        const t = setInterval(() => setElapsed(prev => prev + 100), 100);
        return () => clearInterval(t);
    }, [visible]);

    if (!visible) return null;

    const seconds = (elapsed / 1000).toFixed(1);

    return (
        <div
            className="animate-fade-in"
            style={{
                position: 'fixed', inset: 0, zIndex: 200,
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center',
                background: 'rgba(6,10,20,.85)',
                backdropFilter: 'blur(12px)',
            }}
        >
            {/* Animated orb */}
            <div style={{
                position: 'relative',
                width: 96, height: 96,
                marginBottom: 24,
            }}>
                {/* Outer ring */}
                <div style={{
                    position: 'absolute', inset: 0,
                    borderRadius: '50%',
                    border: '2px solid rgba(139,92,246,.15)',
                    animation: 'spin 3s linear infinite',
                }} />
                {/* Middle ring */}
                <div style={{
                    position: 'absolute', inset: 8,
                    borderRadius: '50%',
                    border: '2px solid rgba(59,130,246,.2)',
                    borderTopColor: '#3b82f6',
                    animation: 'spin 1.5s linear infinite',
                }} />
                {/* Inner glow */}
                <div style={{
                    position: 'absolute', inset: 20,
                    borderRadius: '50%',
                    background: 'radial-gradient(circle, rgba(139,92,246,.2) 0%, transparent 70%)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                    <Icon name="auto_awesome" size={32} color="#a78bfa" filled />
                </div>
            </div>

            {/* Text */}
            <p style={{ fontSize: 16, fontWeight: 700, color: '#f1f5f9', marginBottom: 6 }}>
                {message}
            </p>
            {subMessage && (
                <p style={{ fontSize: 12, color: '#64748b', marginBottom: 12 }}>
                    {subMessage}
                </p>
            )}
            <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                paddingTop: 8,
            }}>
                <span style={{
                    fontSize: 11, fontFamily: 'monospace',
                    color: '#60a5fa', fontWeight: 500,
                    padding: '3px 10px', borderRadius: 8,
                    background: 'rgba(59,130,246,.08)',
                    border: '1px solid rgba(59,130,246,.12)',
                }}>
                    {providerName && modelName
                        ? `${providerName.toUpperCase()} · ${modelName} · ${seconds}s`
                        : `${seconds}s elapsed`}
                </span>
            </div>

            {/* CSS animations */}
            <style>{`
                @keyframes spin { to { transform: rotate(360deg); } }
                @keyframes pulse { 0%,100% { opacity: .7; transform: scale(1); } 50% { opacity: 1; transform: scale(1.1); } }
            `}</style>
        </div>
    );
}
