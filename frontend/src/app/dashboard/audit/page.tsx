'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { auditAPI } from '@/lib/api';
import Icon from '@/components/ui/Icon';

interface AuditLog {
    id: string;
    user_id: string | null;
    action: string;
    entity_type: string;
    entity_id: string | null;
    details: Record<string, unknown> | null;
    ip_address: string | null;
    created_at: string | null;
}

const ACTION_STYLES: Record<string, { bg: string; text: string; icon: string }> = {
    submit_for_approval: { bg: 'rgba(59,130,246,0.08)', text: '#60a5fa', icon: 'send' },
    approve_workflow: { bg: 'rgba(16,185,129,0.08)', text: '#34d399', icon: 'check_circle' },
    reject_workflow: { bg: 'rgba(244,63,94,0.08)', text: '#fb7185', icon: 'cancel' },
    create_policy: { bg: 'rgba(139,92,246,0.08)', text: '#a78bfa', icon: 'add_circle' },
    update_policy: { bg: 'rgba(245,158,11,0.08)', text: '#fbbf24', icon: 'edit' },
    delete_policy: { bg: 'rgba(244,63,94,0.08)', text: '#fb7185', icon: 'delete' },
};

const DEFAULT_STYLE = { bg: 'rgba(148,163,184,0.08)', text: '#94a3b8', icon: 'info' };

export default function AuditPage() {
    const [logs, setLogs] = useState<AuditLog[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const loadLogs = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const res = await auditAPI.list({ limit: '100' });
            setLogs(res.data);
        } catch (err: unknown) {
            console.error('Failed to load audit logs', err);
            setError('Failed to load audit logs. The audit module may not be available.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { loadLogs(); }, [loadLogs]);

    const formatAction = (action: string) =>
        action.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

    const formatTime = (iso: string | null) => {
        if (!iso) return '—';
        const d = new Date(iso);
        return d.toLocaleString('en-US', {
            month: 'short', day: 'numeric', year: 'numeric',
            hour: '2-digit', minute: '2-digit', second: '2-digit',
        });
    };

    const getStyle = (action: string) => ACTION_STYLES[action] || DEFAULT_STYLE;

    return (
        <div className="p-6 animate-fade-in">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-xl font-bold text-white">Audit</h1>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                        Policy change history and workflow actions
                    </p>
                </div>
                <button
                    onClick={loadLogs}
                    className="btn-ghost px-4 py-2 text-xs flex items-center gap-2"
                    disabled={loading}
                >
                    <Icon name="refresh" size={14} className={loading ? 'animate-spin' : ''} />
                    Refresh
                </button>
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-3 gap-4 mb-6">
                <div className="theme-card px-4 py-3">
                    <p className="text-[10px] font-semibold uppercase tracking-widest mb-1" style={{ color: 'var(--text-muted)' }}>Total Events</p>
                    <p className="text-2xl font-bold" style={{ color: '#60a5fa' }}>{loading ? '–' : logs.length}</p>
                </div>
                <div className="theme-card px-4 py-3">
                    <p className="text-[10px] font-semibold uppercase tracking-widest mb-1" style={{ color: 'var(--text-muted)' }}>Approvals</p>
                    <p className="text-2xl font-bold" style={{ color: '#34d399' }}>
                        {loading ? '–' : logs.filter(l => l.action === 'approve_workflow').length}
                    </p>
                </div>
                <div className="theme-card px-4 py-3">
                    <p className="text-[10px] font-semibold uppercase tracking-widest mb-1" style={{ color: 'var(--text-muted)' }}>Submissions</p>
                    <p className="text-2xl font-bold" style={{ color: '#a78bfa' }}>
                        {loading ? '–' : logs.filter(l => l.action === 'submit_for_approval').length}
                    </p>
                </div>
            </div>

            {/* Content */}
            <div className="theme-card overflow-hidden">
                {error ? (
                    <div className="p-8 text-center">
                        <Icon name="warning" size={30} color="var(--text-muted)" className="mb-2" />
                        <p className="text-sm text-white mb-1">Audit Module Unavailable</p>
                        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{error}</p>
                    </div>
                ) : loading ? (
                    <div className="p-8 space-y-3">
                        {[...Array(6)].map((_, i) => (
                            <div key={i} className="skeleton h-12 w-full" />
                        ))}
                    </div>
                ) : logs.length === 0 ? (
                    <div className="empty-state py-16">
                        <div className="empty-state-icon">
                            <Icon name="history" size={30} color="var(--accent-blue)" />
                        </div>
                        <p className="text-sm font-semibold text-white mb-1">No audit events yet</p>
                        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                            Actions like policy submissions, approvals, and rejections will appear here.
                        </p>
                    </div>
                ) : (
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>Action</th>
                                <th>Entity</th>
                                <th>User</th>
                                <th>Timestamp</th>
                            </tr>
                        </thead>
                        <tbody>
                            {logs.map((log) => {
                                const style = getStyle(log.action);
                                return (
                                    <tr key={log.id} className="group">
                                        <td>
                                            <div className="flex items-center gap-2.5">
                                                <div
                                                    className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                                                    style={{ background: style.bg }}
                                                >
                                                    <Icon name={style.icon} size={14} color={style.text} filled />
                                                </div>
                                                <span className="text-xs font-semibold text-white">
                                                    {formatAction(log.action)}
                                                </span>
                                            </div>
                                        </td>
                                        <td>
                                            <div>
                                                <p className="text-xs font-medium text-white capitalize">{log.entity_type?.replace(/_/g, ' ') || '—'}</p>
                                                {log.entity_id && (
                                                    <p className="text-[10px] font-mono truncate max-w-[180px]"
                                                        style={{ color: 'var(--text-muted)' }}>
                                                        {log.entity_id}
                                                    </p>
                                                )}
                                            </div>
                                        </td>
                                        <td>
                                            <span className="text-[10px] font-mono truncate max-w-[140px] block"
                                                style={{ color: 'var(--text-muted)' }}>
                                                {log.user_id ? log.user_id.slice(0, 8) + '...' : '—'}
                                            </span>
                                        </td>
                                        <td>
                                            <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                                                {formatTime(log.created_at)}
                                            </span>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                )}
            </div>

            <style>{`
                @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
            `}</style>
        </div>
    );
}
