'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { workflowAPI, aiAPI } from '@/lib/api';
import { useAI } from '@/contexts/AIContext';
import AILoadingOverlay from '@/components/ai/AILoadingOverlay';
import Icon from '@/components/ui/Icon';

/* ─── types ────────────────────────────────────────────────────── */
interface QueueItem {
    instance_id: string;
    policy_id: string;
    policy_title: string;
    status: string;
    submitted_at: string;
    submitted_by: string;
    current_level: number;
    template_name: string;
    comments?: string;
}

interface ApprovalSummary {
    risk_impact: string;
    risk_severity: string;
    risk_direction: string;
    critical_changes: string[];
    compliance_flags: string[];
    summary: string;
    ai_provider?: string;
    ai_model?: string;
    ai_duration_ms?: number;
}

/* ─── badge helper ─────────────────────────────────────────────── */
function directionBadge(d: string) {
    const map: Record<string, { bg: string; text: string; icon: string }> = {
        stricter: { bg: 'rgba(239,68,68,.1)', text: '#f87171', icon: 'trending_up' },
        looser: { bg: 'rgba(34,197,94,.1)', text: '#4ade80', icon: 'trending_down' },
        neutral: { bg: 'rgba(245,158,11,.1)', text: '#fbbf24', icon: 'trending_flat' },
    };
    const s = map[d?.toLowerCase()] ?? map.neutral;
    return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold" style={{ background: s.bg, color: s.text }}>
            <Icon name={s.icon} size={14} />
            {(d || 'Neutral').toUpperCase()}
        </span>
    );
}

function severityBadge(s: string) {
    const map: Record<string, { bg: string; text: string }> = {
        high: { bg: 'rgba(239,68,68,.1)', text: '#f87171' },
        medium: { bg: 'rgba(245,158,11,.1)', text: '#fbbf24' },
        low: { bg: 'rgba(34,197,94,.1)', text: '#4ade80' },
    };
    const c = map[s?.toLowerCase()] ?? map.medium;
    return (
        <span className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase" style={{ background: c.bg, color: c.text }}>
            {s || 'Unknown'}
        </span>
    );
}

/* ═════════════════════════════════════════════════════════════════ */
/*  MAIN PAGE                                                       */
/* ═════════════════════════════════════════════════════════════════ */
export default function WorkflowPage() {
    const router = useRouter();
    const aiCtx = useAI();

    /* ── queue state ─────────────────────────────────────────────── */
    const [queue, setQueue] = useState<QueueItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    /* ── detail / approval ───────────────────────────────────────── */
    const [selected, setSelected] = useState<QueueItem | null>(null);
    const [actionModal, setActionModal] = useState<'approve' | 'reject' | null>(null);
    const [actionComments, setActionComments] = useState('');
    const [actionLoading, setActionLoading] = useState(false);

    /* ── AI state ────────────────────────────────────────────────── */
    const [aiSummary, setAiSummary] = useState<ApprovalSummary | null>(null);
    const [aiAnalyzing, setAiAnalyzing] = useState(false);
    const [aiError, setAiError] = useState('');
    const [aiOverlayVisible, setAiOverlayVisible] = useState(false);
    const [aiOverlayMessage, setAiOverlayMessage] = useState('');
    const [aiProvider, setAiProvider] = useState<{ provider: string; model: string } | null>(null);

    /* ── toast ────────────────────────────────────────────────────── */
    const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

    /* ── fetch queue ─────────────────────────────────────────────── */
    const fetchQueue = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const res = await workflowAPI.getQueue();
            setQueue(Array.isArray(res.data) ? res.data : res.data?.items || []);
        } catch (err: unknown) {
            const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail || 'Failed to load queue';
            setError(msg);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchQueue(); }, [fetchQueue]);

    /* ── fetch AI provider ───────────────────────────────────────── */
    useEffect(() => {
        aiAPI.getProviderInfo().then(r => setAiProvider(r.data)).catch(() => { });
    }, []);

    /* ── AI impact analysis ──────────────────────────────────────── */
    const analyzeImpact = useCallback(async (policyId: string) => {
        setAiAnalyzing(true);
        setAiError('');
        setAiSummary(null);
        setAiOverlayMessage('Running AI impact analysis…');
        setAiOverlayVisible(true);
        const start = Date.now();
        try {
            await aiCtx.trackAICall('workflow_impact_analysis', async () => {
                const res = await workflowAPI.getApprovalSummary(policyId);
                const data = res.data as ApprovalSummary;
                data.ai_duration_ms = Date.now() - start;
                data.ai_provider = aiProvider?.provider;
                data.ai_model = aiProvider?.model;
                setAiSummary(data);
            });
        } catch (err: unknown) {
            const resp = (err as { response?: { status?: number; data?: { detail?: string } } })?.response;
            if (resp?.status === 503) {
                setAiError('AI service unavailable. Please try again later.');
            } else {
                setAiError(resp?.data?.detail || 'AI analysis failed');
            }
        } finally {
            setAiAnalyzing(false);
            setAiOverlayVisible(false);
        }
    }, [aiProvider, aiCtx]);

    /* ── select item ─────────────────────────────────────────────── */
    const selectItem = useCallback((item: QueueItem) => {
        setSelected(item);
        setAiSummary(null);
        setAiError('');
        // Auto-trigger AI analysis when selecting
        analyzeImpact(item.policy_id);
    }, [analyzeImpact]);

    /* ── approve / reject ────────────────────────────────────────── */
    const handleAction = async () => {
        if (!selected || !actionModal) return;
        setActionLoading(true);
        try {
            if (actionModal === 'approve') {
                await workflowAPI.approve(selected.instance_id, actionComments || undefined);
            } else {
                await workflowAPI.reject(selected.instance_id, actionComments || undefined);
            }
            setToast({ msg: `Policy ${actionModal}d successfully`, type: 'success' });
            setActionModal(null);
            setActionComments('');
            setSelected(null);
            setAiSummary(null);
            fetchQueue();
        } catch (err: unknown) {
            const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail || `Failed to ${actionModal}`;
            setToast({ msg, type: 'error' });
        } finally {
            setActionLoading(false);
        }
    };

    /* ── approval allowed only after AI analysis ─────────────────── */
    const canAct = Boolean(aiSummary) && !aiAnalyzing && !aiError;

    /* ═══════════════════════════════════════════════════════════════ */
    /*  RENDER                                                       */
    /* ═══════════════════════════════════════════════════════════════ */
    return (
        <div className="flex flex-col h-full" style={{ background: 'var(--bg-primary)' }}>
            {/* Overlay */}
            <AILoadingOverlay visible={aiOverlayVisible} message={aiOverlayMessage} />

            {/* Toast */}
            {toast && (
                <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 px-5 py-3 rounded-2xl shadow-lg animate-fade-in"
                    style={{
                        background: toast.type === 'success' ? 'rgba(34,197,94,.08)' : 'rgba(239,68,68,.08)',
                        border: `1px solid ${toast.type === 'success' ? 'rgba(34,197,94,.2)' : 'rgba(239,68,68,.2)'}`,
                    }}>
                    <Icon name={toast.type === 'success' ? 'check_circle' : 'error'} size={16} />
                    <span className="text-xs font-medium" style={{ color: toast.type === 'success' ? '#4ade80' : '#f87171' }}>{toast.msg}</span>
                </div>
            )}

            {/* ── top bar ────────────────────────────────────────────── */}
            <div className="panel-header" style={{ borderBottom: '1px solid var(--border-default)' }}>
                <button onClick={() => router.push('/dashboard')} className="btn-icon" title="Back">
                    <Icon name="arrow_back" size={16} color="var(--text-muted)" />
                </button>
                <Icon name="approval" size={14} color="var(--accent-blue)" />
                <h1 className="text-sm font-bold text-white">Workflow Approvals</h1>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-lg" style={{ background: 'rgba(59,130,246,.08)', color: '#60a5fa' }}>
                    {queue.length} pending
                </span>
                <div className="flex-1" />
                {aiProvider && (
                    <span className="text-[10px] px-2 py-1 rounded-lg flex items-center gap-1" style={{ background: 'rgba(139,92,246,.08)', color: '#a78bfa' }}>
                        <Icon name="smart_toy" size={12} />
                        {aiProvider.provider} / {aiProvider.model}
                    </span>
                )}
            </div>

            {/* ── content ────────────────────────────────────────────── */}
            <div className="flex flex-1 overflow-hidden">

                {/* ── queue list ─────────────────────────────────────── */}
                <aside className="flex flex-col border-r overflow-hidden" style={{ width: 360, background: 'var(--bg-secondary)', borderColor: 'var(--border-default)' }}>
                    <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--border-default)' }}>
                        <p className="text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Approval Queue</p>
                    </div>

                    <div className="flex-1 overflow-y-auto px-2 py-2 space-y-1">
                        {loading ? (
                            <div className="flex items-center justify-center py-12">
                                <div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                            </div>
                        ) : error ? (
                            <div className="text-center py-8">
                                <Icon name="error" size={24} color="var(--accent-rose)" />
                                <p className="text-xs mt-2" style={{ color: 'var(--text-muted)' }}>{error}</p>
                                <button onClick={fetchQueue} className="btn-ghost text-xs mt-3 px-4 py-2">Retry</button>
                            </div>
                        ) : queue.length === 0 ? (
                            <div className="empty-state py-12">
                                <div className="empty-state-icon" style={{ width: 56, height: 56, marginBottom: 16 }}>
                                    <Icon name="inbox" size={24} color="var(--accent-blue)" />
                                </div>
                                <p className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>No pending approvals</p>
                            </div>
                        ) : queue.map(item => (
                            <div
                                key={item.instance_id}
                                onClick={() => selectItem(item)}
                                className="flex flex-col gap-1 px-3 py-3 rounded-xl cursor-pointer transition-all group"
                                style={{
                                    background: selected?.instance_id === item.instance_id ? 'rgba(59,130,246,.08)' : 'transparent',
                                    border: selected?.instance_id === item.instance_id ? '1px solid rgba(59,130,246,.15)' : '1px solid transparent',
                                }}
                            >
                                <div className="flex items-center gap-2">
                                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: '#fbbf24' }} />
                                    <span className="text-xs font-semibold text-white truncate flex-1">{item.policy_title || 'Untitled Policy'}</span>
                                </div>
                                <div className="flex items-center gap-2 ml-4">
                                    <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                                        {item.template_name} • Level {item.current_level}
                                    </span>
                                </div>
                                <div className="flex items-center gap-2 ml-4">
                                    <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                                        by {item.submitted_by} • {new Date(item.submitted_at).toLocaleDateString()}
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                </aside>

                {/* ── detail panel ───────────────────────────────────── */}
                <main className="flex-1 overflow-y-auto p-6">
                    {!selected ? (
                        <div className="flex items-center justify-center h-full">
                            <div className="text-center">
                                <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ background: 'rgba(59,130,246,.06)' }}>
                                    <Icon name="touch_app" size={30} color="var(--accent-blue)" />
                                </div>
                                <p className="text-sm font-medium" style={{ color: 'var(--text-muted)' }}>Select a policy to review</p>
                                <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>AI impact analysis will run automatically</p>
                            </div>
                        </div>
                    ) : (
                        <div className="max-w-3xl mx-auto space-y-5">
                            {/* ── policy header ─────────────────────── */}
                            <div className="glass-card p-5">
                                <div className="flex items-start justify-between mb-3">
                                    <div>
                                        <h2 className="text-base font-bold text-white">{selected.policy_title || 'Untitled Policy'}</h2>
                                        <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                                            Template: {selected.template_name} • Level {selected.current_level} • Status: {selected.status}
                                        </p>
                                    </div>
                                    <button
                                        onClick={() => router.push(`/dashboard/policies/${selected.policy_id}`)}
                                        className="btn-ghost text-xs px-3 py-1.5 flex items-center gap-1"
                                    >
                                        <Icon name="open_in_new" size={14} />
                                        View Policy
                                    </button>
                                </div>
                                <div className="flex items-center gap-4 text-[11px]" style={{ color: 'var(--text-muted)' }}>
                                    <span>Submitted by: <b className="text-white">{selected.submitted_by}</b></span>
                                    <span>Date: <b className="text-white">{new Date(selected.submitted_at).toLocaleString()}</b></span>
                                </div>
                                {selected.comments && (
                                    <div className="mt-3 p-3 rounded-lg text-xs" style={{ background: 'rgba(255,255,255,.03)', color: 'var(--text-secondary)' }}>
                                        <span className="font-semibold" style={{ color: 'var(--text-muted)' }}>Comments: </span>{selected.comments}
                                    </div>
                                )}
                            </div>

                            {/* ── AI Risk Summary Panel ─────────────── */}
                            <div className="glass-card overflow-hidden">
                                <div style={{ height: 3, background: aiSummary ? 'var(--gradient-violet)' : aiError ? 'var(--accent-rose)' : 'rgba(255,255,255,.05)' }} />
                                <div className="p-5">
                                    <div className="flex items-center gap-2 mb-4">
                                        <Icon name="psychology" size={14} color="var(--accent-violet)" />
                                        <span className="text-xs font-bold text-white">AI Risk Summary</span>
                                        {aiAnalyzing && (
                                            <div className="flex items-center gap-1.5 ml-auto">
                                                <div className="w-3 h-3 border-2 border-violet-400 border-t-transparent rounded-full animate-spin" />
                                                <span className="text-[10px]" style={{ color: '#a78bfa' }}>Analyzing…</span>
                                            </div>
                                        )}
                                        {!aiAnalyzing && !aiSummary && !aiError && (
                                            <button onClick={() => analyzeImpact(selected.policy_id)} className="ml-auto btn-ghost text-xs px-3 py-1.5 flex items-center gap-1">
                                                <Icon name="smart_toy" size={14} />
                                                Analyze Impact with AI
                                            </button>
                                        )}
                                    </div>

                                    {aiError && (
                                        <div className="p-4 rounded-xl flex items-start gap-3" style={{ background: 'rgba(239,68,68,.06)', border: '1px solid rgba(239,68,68,.12)' }}>
                                            <Icon name="error" size={16} color="#f87171" className="mt-0.5" />
                                            <div>
                                                <p className="text-xs font-semibold" style={{ color: '#f87171' }}>AI Analysis Failed</p>
                                                <p className="text-[11px] mt-1" style={{ color: 'var(--text-muted)' }}>{aiError}</p>
                                                <button onClick={() => analyzeImpact(selected.policy_id)} className="text-[11px] mt-2 underline" style={{ color: '#f87171' }}>Retry</button>
                                            </div>
                                        </div>
                                    )}

                                    {aiSummary && (
                                        <div className="space-y-4">
                                            {/* badges row */}
                                            <div className="flex items-center gap-3 flex-wrap">
                                                {directionBadge(aiSummary.risk_direction)}
                                                {severityBadge(aiSummary.risk_severity)}
                                                <span className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase" style={{ background: 'rgba(59,130,246,.1)', color: '#60a5fa' }}>
                                                    Impact: {aiSummary.risk_impact || 'Unknown'}
                                                </span>
                                            </div>

                                            {/* summary */}
                                            <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{aiSummary.summary}</p>

                                            {/* critical changes */}
                                            {aiSummary.critical_changes?.length > 0 && (
                                                <div>
                                                    <p className="text-[11px] font-bold mb-2" style={{ color: '#f87171' }}>
                                                        <Icon name="warning" size={12} className="align-middle mr-1" />
                                                        Critical Changes
                                                    </p>
                                                    <ul className="space-y-1">
                                                        {aiSummary.critical_changes.map((c, i) => (
                                                            <li key={i} className="flex items-start gap-2 text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                                                                <span className="text-[8px] mt-1" style={{ color: '#f87171' }}>●</span>{c}
                                                            </li>
                                                        ))}
                                                    </ul>
                                                </div>
                                            )}

                                            {/* compliance flags */}
                                            {aiSummary.compliance_flags?.length > 0 && (
                                                <div>
                                                    <p className="text-[11px] font-bold mb-2" style={{ color: '#fbbf24' }}>
                                                        <Icon name="flag" size={12} className="align-middle mr-1" />
                                                        Compliance Flags
                                                    </p>
                                                    <div className="flex flex-wrap gap-1.5">
                                                        {aiSummary.compliance_flags.map((f, i) => (
                                                            <span key={i} className="px-2 py-0.5 rounded-md text-[10px]" style={{ background: 'rgba(245,158,11,.08)', color: '#fbbf24' }}>{f}</span>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}

                                            {/* AI metadata */}
                                            <div className="pt-3 border-t flex items-center gap-4 text-[10px]" style={{ borderColor: 'var(--border-default)', color: 'var(--text-muted)' }}>
                                                <span className="flex items-center gap-1">
                                                    <Icon name="smart_toy" size={12} />
                                                    {aiSummary.ai_provider || aiProvider?.provider || 'AI'} / {aiSummary.ai_model || aiProvider?.model || 'model'}
                                                </span>
                                                {aiSummary.ai_duration_ms && (
                                                    <span className="flex items-center gap-1">
                                                        <Icon name="timer" size={12} />
                                                        {(aiSummary.ai_duration_ms / 1000).toFixed(1)}s
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* ── action buttons ───────────────────────── */}
                            <div className="flex items-center gap-3">
                                <button
                                    onClick={() => setActionModal('approve')}
                                    disabled={!canAct}
                                    className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold transition-all"
                                    style={{
                                        background: canAct ? 'rgba(34,197,94,.12)' : 'rgba(255,255,255,.03)',
                                        color: canAct ? '#4ade80' : 'var(--text-muted)',
                                        border: canAct ? '1px solid rgba(34,197,94,.2)' : '1px solid var(--border-default)',
                                        opacity: canAct ? 1 : 0.5,
                                        cursor: canAct ? 'pointer' : 'not-allowed',
                                    }}
                                >
                                    <Icon name="check_circle" size={16} />
                                    Approve
                                </button>
                                <button
                                    onClick={() => setActionModal('reject')}
                                    disabled={!canAct}
                                    className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold transition-all"
                                    style={{
                                        background: canAct ? 'rgba(239,68,68,.12)' : 'rgba(255,255,255,.03)',
                                        color: canAct ? '#f87171' : 'var(--text-muted)',
                                        border: canAct ? '1px solid rgba(239,68,68,.2)' : '1px solid var(--border-default)',
                                        opacity: canAct ? 1 : 0.5,
                                        cursor: canAct ? 'pointer' : 'not-allowed',
                                    }}
                                >
                                    <Icon name="cancel" size={16} />
                                    Reject
                                </button>
                            </div>
                            {!canAct && !aiAnalyzing && (
                                <p className="text-[10px] text-center" style={{ color: 'var(--text-muted)' }}>
                                    {aiError ? 'AI analysis must succeed before approval' : 'Waiting for AI analysis to complete…'}
                                </p>
                            )}
                        </div>
                    )}
                </main>
            </div>

            {/* ── Action confirmation modal ──────────────────────────── */}
            {actionModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,.6)' }} onClick={() => setActionModal(null)}>
                    <div className="glass-card w-full max-w-md animate-scale-in" onClick={e => e.stopPropagation()}>
                        <div style={{ height: 3, background: actionModal === 'approve' ? 'rgba(34,197,94,.6)' : 'rgba(239,68,68,.6)' }} />
                        <div className="p-6">
                            <h3 className="text-base font-bold text-white mb-1">
                                {actionModal === 'approve' ? 'Approve Policy' : 'Reject Policy'}
                            </h3>
                            <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>
                                {selected?.policy_title}
                            </p>
                            <textarea
                                value={actionComments}
                                onChange={e => setActionComments(e.target.value)}
                                placeholder="Add comments (optional)..."
                                className="w-full rounded-xl px-4 py-3 text-sm theme-input resize-none mb-4"
                                rows={3}
                            />
                            <div className="flex gap-3">
                                <button onClick={() => setActionModal(null)} className="btn-ghost px-4 py-2.5 text-sm flex-1">Cancel</button>
                                <button
                                    onClick={handleAction}
                                    disabled={actionLoading}
                                    className="px-4 py-2.5 text-sm flex-1 rounded-xl font-bold flex items-center justify-center gap-2"
                                    style={{
                                        background: actionModal === 'approve' ? 'rgba(34,197,94,.15)' : 'rgba(239,68,68,.15)',
                                        color: actionModal === 'approve' ? '#4ade80' : '#f87171',
                                    }}
                                >
                                    {actionLoading ? (
                                        <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                                    ) : (
                                        <>
                                            <Icon name={actionModal === 'approve' ? 'check' : 'close'} size={16} />
                                            {actionModal === 'approve' ? 'Confirm Approve' : 'Confirm Reject'}
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
