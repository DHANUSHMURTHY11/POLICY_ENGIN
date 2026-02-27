'use client';

import React from 'react';
import type { AIValidationIssue } from '@/types/policy';
import Icon from '@/components/ui/Icon';

interface Props {
    issues: AIValidationIssue[];
    suggestions: string[];
    normalizedNames: Record<string, string>;
    onDismiss: () => void;
    onRetry: () => void;
}

export default function AIValidationBanner({ issues, suggestions, normalizedNames, onDismiss, onRetry }: Props) {
    const errors = issues.filter(i => i.severity === 'error');
    const warnings = issues.filter(i => i.severity === 'warning');
    const sug = issues.filter(i => i.severity === 'suggestion');
    const renameEntries = Object.entries(normalizedNames);

    return (
        <div className="animate-slide-down" style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100 }}>
            <div style={{
                background: 'linear-gradient(135deg, rgba(17,24,39,.97) 0%, rgba(30,15,15,.97) 100%)',
                borderBottom: '1px solid rgba(239,68,68,.2)',
                backdropFilter: 'blur(20px)',
                padding: '16px 24px',
                maxHeight: '60vh',
                overflowY: 'auto',
            }}>
                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                    <Icon name="gpp_bad" size={20} color="#ef4444" filled />
                    <span style={{ color: '#f87171', fontWeight: 700, fontSize: 14 }}>
                        AI Validation Failed — Structure Not Saved
                    </span>
                    <span style={{
                        marginLeft: 8, fontSize: 10, fontWeight: 600,
                        padding: '2px 8px', borderRadius: 9999,
                        background: 'rgba(239,68,68,.12)', color: '#f87171',
                        border: '1px solid rgba(239,68,68,.2)',
                    }}>
                        {errors.length} error{errors.length !== 1 ? 's' : ''} · {warnings.length} warning{warnings.length !== 1 ? 's' : ''} · {sug.length} suggestion{sug.length !== 1 ? 's' : ''}
                    </span>
                    <div style={{ flex: 1 }} />
                    <button onClick={onDismiss} className="btn-icon" style={{ width: 28, height: 28 }}>
                        <Icon name="close" size={16} color="var(--text-muted)" />
                    </button>
                </div>

                {/* Errors */}
                {errors.length > 0 && (
                    <div style={{ marginBottom: 12 }}>
                        <p style={{ fontSize: 10, fontWeight: 700, color: '#f87171', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.06em' }}>
                            Errors — Must Fix Before Save
                        </p>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            {errors.map((issue, i) => (
                                <div key={i} style={{
                                    display: 'flex', alignItems: 'flex-start', gap: 8,
                                    padding: '8px 12px', borderRadius: 10,
                                    background: 'rgba(239,68,68,.06)',
                                    border: '1px solid rgba(239,68,68,.1)',
                                }}>
                                    <Icon name="error" size={14} color="#ef4444" />
                                    <div style={{ flex: 1 }}>
                                        <p style={{ fontSize: 12, color: '#fca5a5', fontWeight: 500 }}>{issue.message}</p>
                                        {issue.path && <p style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'monospace', marginTop: 2 }}>{issue.path}</p>}
                                    </div>
                                    <span style={{ fontSize: 9, fontWeight: 600, padding: '2px 6px', borderRadius: 6, background: 'rgba(239,68,68,.15)', color: '#f87171' }}>
                                        {issue.category.replace('_', ' ')}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Warnings */}
                {warnings.length > 0 && (
                    <div style={{ marginBottom: 12 }}>
                        <p style={{ fontSize: 10, fontWeight: 700, color: '#fbbf24', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.06em' }}>
                            Warnings — Should Fix
                        </p>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            {warnings.map((issue, i) => (
                                <div key={i} style={{
                                    display: 'flex', alignItems: 'flex-start', gap: 8,
                                    padding: '8px 12px', borderRadius: 10,
                                    background: 'rgba(245,158,11,.04)',
                                    border: '1px solid rgba(245,158,11,.08)',
                                }}>
                                    <Icon name="warning" size={14} color="#f59e0b" />
                                    <p style={{ fontSize: 12, color: '#fcd34d', fontWeight: 500, flex: 1 }}>{issue.message}</p>
                                    <span style={{ fontSize: 9, fontWeight: 600, padding: '2px 6px', borderRadius: 6, background: 'rgba(245,158,11,.1)', color: '#fbbf24' }}>
                                        {issue.category.replace('_', ' ')}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Suggestions */}
                {(sug.length > 0 || suggestions.length > 0) && (
                    <div style={{ marginBottom: 12 }}>
                        <p style={{ fontSize: 10, fontWeight: 700, color: '#60a5fa', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.06em' }}>
                            Suggestions
                        </p>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            {sug.map((issue, i) => (
                                <div key={`s-${i}`} style={{
                                    display: 'flex', alignItems: 'center', gap: 8,
                                    padding: '6px 12px', borderRadius: 8,
                                    background: 'rgba(59,130,246,.04)',
                                    border: '1px solid rgba(59,130,246,.06)',
                                }}>
                                    <Icon name="lightbulb" size={14} color="#3b82f6" />
                                    <p style={{ fontSize: 11, color: '#93c5fd', flex: 1 }}>{issue.message}</p>
                                </div>
                            ))}
                            {suggestions.map((s, i) => (
                                <div key={`gs-${i}`} style={{
                                    display: 'flex', alignItems: 'center', gap: 8,
                                    padding: '6px 12px', borderRadius: 8,
                                    background: 'rgba(59,130,246,.04)',
                                    border: '1px solid rgba(59,130,246,.06)',
                                }}>
                                    <Icon name="tips_and_updates" size={14} color="#3b82f6" />
                                    <p style={{ fontSize: 11, color: '#93c5fd', flex: 1 }}>{s}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Normalized Field Names */}
                {renameEntries.length > 0 && (
                    <div style={{ marginBottom: 12 }}>
                        <p style={{ fontSize: 10, fontWeight: 700, color: '#a78bfa', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.06em' }}>
                            Field Name Normalization Suggestions
                        </p>
                        <div style={{
                            padding: '8px 12px', borderRadius: 10,
                            background: 'rgba(139,92,246,.04)',
                            border: '1px solid rgba(139,92,246,.08)',
                            display: 'flex', flexWrap: 'wrap', gap: 6,
                        }}>
                            {renameEntries.map(([from, to]) => (
                                <span key={from} style={{
                                    fontSize: 10, fontFamily: 'monospace',
                                    padding: '3px 8px', borderRadius: 6,
                                    background: 'rgba(139,92,246,.08)',
                                    color: '#c4b5fd',
                                }}>
                                    {from} → {to}
                                </span>
                            ))}
                        </div>
                    </div>
                )}

                {/* Actions */}
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
                    <button onClick={onDismiss} className="btn-ghost" style={{ padding: '8px 16px', fontSize: 12 }}>
                        Dismiss
                    </button>
                    <button onClick={onRetry} className="btn-primary" style={{ padding: '8px 16px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Icon name="refresh" size={14} />
                        Fix & Retry Save
                    </button>
                </div>
            </div>
        </div>
    );
}
