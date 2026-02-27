'use client';

import React from 'react';
import type { AICallMetadata } from '@/types/policy';
import Icon from '@/components/ui/Icon';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    log: AICallMetadata[];
    onClear: () => void;
}

export default function AIExecutionLogDrawer({ isOpen, onClose, log, onClear }: Props) {
    if (!isOpen) return null;

    return (
        <>
            {/* Backdrop */}
            <div
                onClick={onClose}
                className="animate-fade-in"
                style={{ position: 'fixed', inset: 0, zIndex: 150, background: 'rgba(0,0,0,.4)' }}
            />

            {/* Drawer */}
            <aside
                style={{
                    position: 'fixed', top: 0, right: 0, bottom: 0,
                    width: 420, zIndex: 151,
                    background: 'var(--bg-secondary)',
                    borderLeft: '1px solid var(--border-default)',
                    display: 'flex', flexDirection: 'column',
                    animation: 'slideInFromRight .25s ease-out',
                    boxShadow: '-8px 0 40px rgba(0,0,0,.3)',
                }}
            >
                {/* Header */}
                <div style={{
                    padding: '16px 20px',
                    borderBottom: '1px solid var(--border-default)',
                    display: 'flex', alignItems: 'center', gap: 10,
                }}>
                    <Icon name="terminal" size={18} color="#a78bfa" filled />
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#f1f5f9', flex: 1 }}>AI Execution Log</span>
                    <span style={{
                        fontSize: 10, fontWeight: 600, fontFamily: 'monospace',
                        padding: '2px 8px', borderRadius: 9999,
                        background: 'rgba(139,92,246,.08)', color: '#a78bfa',
                    }}>
                        {log.length} call{log.length !== 1 ? 's' : ''}
                    </span>
                    {log.length > 0 && (
                        <button onClick={onClear} className="btn-icon" title="Clear log" style={{ width: 28, height: 28 }}>
                            <Icon name="delete_sweep" size={14} color="var(--text-muted)" />
                        </button>
                    )}
                    <button onClick={onClose} className="btn-icon" style={{ width: 28, height: 28 }}>
                        <Icon name="close" size={16} color="var(--text-muted)" />
                    </button>
                </div>

                {/* Log entries */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
                    {log.length === 0 ? (
                        <div className="empty-state" style={{ padding: '48px 24px' }}>
                            <div className="empty-state-icon" style={{ width: 56, height: 56, marginBottom: 12 }}>
                                <Icon name="history" size={24} color="#a78bfa" />
                            </div>
                            <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>No AI calls yet</p>
                            <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                                AI call records will appear here as you interact with the builder
                            </p>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {log.map((entry, i) => {
                                const isSuccess = entry.success;
                                const time = new Date(entry.timestamp);
                                const timeStr = time.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });

                                return (
                                    <div key={i} style={{
                                        padding: '12px 14px', borderRadius: 12,
                                        background: isSuccess ? 'rgba(16,185,129,.03)' : 'rgba(239,68,68,.03)',
                                        border: `1px solid ${isSuccess ? 'rgba(16,185,129,.08)' : 'rgba(239,68,68,.08)'}`,
                                    }}>
                                        {/* Row 1: Operation + status */}
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                                            <Icon name={isSuccess ? 'check_circle' : 'cancel'} size={14} filled />
                                            <span style={{
                                                fontSize: 12, fontWeight: 600,
                                                color: isSuccess ? '#34d399' : '#f87171',
                                            }}>
                                                {entry.operation.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                                            </span>
                                            <span style={{ flex: 1 }} />
                                            <span style={{ fontSize: 10, fontFamily: 'monospace', color: 'var(--text-muted)' }}>{timeStr}</span>
                                        </div>

                                        {/* Row 2: Metadata grid */}
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
                                            <MetaChip icon="smart_toy" label={entry.provider.toUpperCase()} color="#60a5fa" />
                                            <MetaChip icon="timer" label={`${entry.duration_ms}ms`} color="#fbbf24" />
                                            <MetaChip icon="token" label={`${entry.tokens} tok`} color="#a78bfa" />
                                        </div>

                                        {/* Model name */}
                                        <div style={{ marginTop: 6 }}>
                                            <span style={{
                                                fontSize: 10, fontFamily: 'monospace',
                                                padding: '2px 6px', borderRadius: 4,
                                                background: 'rgba(255,255,255,.03)', color: 'var(--text-muted)',
                                            }}>
                                                {entry.model}
                                            </span>
                                        </div>

                                        {/* Error */}
                                        {entry.error && (
                                            <div style={{
                                                marginTop: 8, padding: '6px 10px', borderRadius: 8,
                                                background: 'rgba(239,68,68,.06)', border: '1px solid rgba(239,68,68,.1)',
                                            }}>
                                                <p style={{ fontSize: 10, color: '#fca5a5', fontFamily: 'monospace', wordBreak: 'break-all' }}>
                                                    {entry.error}
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </aside>

            <style>{`
                @keyframes slideInFromRight {
                    from { transform: translateX(100%); opacity: 0; }
                    to { transform: translateX(0); opacity: 1; }
                }
            `}</style>
        </>
    );
}

function MetaChip({ icon, label, color }: { icon: string; label: string; color: string }) {
    return (
        <div style={{
            display: 'flex', alignItems: 'center', gap: 4,
            padding: '3px 6px', borderRadius: 6,
            background: `${color}08`, fontSize: 10,
        }}>
            <Icon name={icon} size={11} />
            <span style={{ fontWeight: 600, color, fontFamily: 'monospace' }}>{label}</span>
        </div>
    );
}
