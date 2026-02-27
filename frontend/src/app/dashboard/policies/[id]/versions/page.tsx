'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { versionAPI, policyAPI, aiAPI } from '@/lib/api';
import { useAI } from '@/contexts/AIContext';
import AILoadingOverlay from '@/components/ai/AILoadingOverlay';
import Icon from '@/components/ui/Icon';

/* ── Types ──────────────────────────────────────────────────────── */
interface VersionItem {
    id: string;
    policy_id: string;
    version_number: number;
    change_summary: string | null;
    created_by: string | null;
    created_at: string;
    is_locked: boolean;
    approved_at: string | null;
}

interface Change {
    type: string;
    path: string;
    detail: string;
}

interface CompareResult {
    base_version: number;
    compare_version: number;
    base_structure: any;
    compare_structure: any;
    changes: Change[];
}

interface AIDiffResult {
    risk_direction: string;
    risk_severity: string;
    risk_impact: string;
    critical_changes: string[];
    compliance_flags: string[];
    summary: string;
    ai_provider?: string;
    ai_model?: string;
    ai_duration_ms?: number;
}

export default function VersionHistoryPage() {
    const params = useParams();
    const router = useRouter();
    const policyId = params.id as string;
    const aiCtx = useAI();

    /* ── state ─────────────────────────────────────────────────── */
    const [versions, setVersions] = useState<VersionItem[]>([]);
    const [policyName, setPolicyName] = useState('');
    const [loading, setLoading] = useState(true);
    const [acting, setActing] = useState(false);

    // Compare state
    const [baseV, setBaseV] = useState<number | null>(null);
    const [compareV, setCompareV] = useState<number | null>(null);
    const [compareResult, setCompareResult] = useState<CompareResult | null>(null);
    const [comparing, setComparing] = useState(false);

    // AI Diff state
    const [aiDiff, setAiDiff] = useState<AIDiffResult | null>(null);
    const [aiDiffLoading, setAiDiffLoading] = useState(false);
    const [aiDiffError, setAiDiffError] = useState('');
    const [viewTab, setViewTab] = useState<'raw' | 'ai'>('ai');
    const [aiProvider, setAiProvider] = useState<{ provider: string; model: string } | null>(null);

    const [overlayVisible, setOverlayVisible] = useState(false);
    const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
    useEffect(() => { if (toast) { const t = setTimeout(() => setToast(null), 3500); return () => clearTimeout(t); } }, [toast]);

    /* ── load ───────────────────────────────────────────────────── */
    const loadVersions = useCallback(async () => {
        setLoading(true);
        try {
            const [vRes, pRes] = await Promise.all([
                versionAPI.list(policyId),
                policyAPI.get(policyId).catch(() => null),
            ]);
            setVersions(vRes.data.versions ?? []);
            if (pRes?.data) setPolicyName(pRes.data.name ?? '');
        } catch { /* ignore */ }
        setLoading(false);
    }, [policyId]);

    useEffect(() => { loadVersions(); }, [loadVersions]);
    useEffect(() => { aiAPI.getProviderInfo().then(r => setAiProvider(r.data)).catch(() => { }); }, []);

    /* ── compare + auto AI diff ────────────────────────────────── */
    const handleCompare = async () => {
        if (baseV == null || compareV == null) return;
        setComparing(true);
        setCompareResult(null);
        setAiDiff(null);
        setAiDiffError('');
        try {
            const res = await versionAPI.compare(policyId, baseV, compareV);
            setCompareResult(res.data);

            // Auto-trigger AI diff analysis
            setAiDiffLoading(true);
            setOverlayVisible(true);
            const start = Date.now();
            try {
                await aiCtx.trackAICall('version_ai_diff', async () => {
                    const aiRes = await versionAPI.aiDiff(policyId, baseV, compareV);
                    const data = aiRes.data as AIDiffResult;
                    data.ai_duration_ms = Date.now() - start;
                    data.ai_provider = aiProvider?.provider;
                    data.ai_model = aiProvider?.model;
                    setAiDiff(data);
                    setViewTab('ai');
                });
            } catch (err: unknown) {
                const resp = (err as { response?: { status?: number; data?: { detail?: string } } })?.response;
                if (resp?.status === 503) {
                    setAiDiffError('AI service unavailable');
                } else {
                    setAiDiffError(resp?.data?.detail || 'AI analysis failed');
                }
                setViewTab('raw');
            } finally {
                setAiDiffLoading(false);
                setOverlayVisible(false);
            }
        } catch {
            setToast({ msg: 'Compare failed', type: 'error' });
        }
        setComparing(false);
    };

    /* ── actions ───────────────────────────────────────────────── */
    const handleLock = async (vn: number) => {
        setActing(true);
        try {
            await versionAPI.lock(policyId, vn);
            setToast({ msg: `Version ${vn} locked`, type: 'success' });
            await loadVersions();
        } catch {
            setToast({ msg: 'Lock failed', type: 'error' });
        }
        setActing(false);
    };

    const handleRollback = async (vn: number) => {
        setActing(true);
        try {
            await versionAPI.rollback(policyId, vn);
            setToast({ msg: `Rolled back to v${vn}`, type: 'success' });
            await loadVersions();
        } catch (err: unknown) {
            const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail || 'Rollback failed';
            setToast({ msg, type: 'error' });
        }
        setActing(false);
    };

    const handleCreateSnapshot = async () => {
        setActing(true);
        try {
            await versionAPI.create(policyId, 'Manual snapshot');
            setToast({ msg: 'Snapshot created', type: 'success' });
            await loadVersions();
        } catch (err: unknown) {
            const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail || 'Snapshot failed';
            setToast({ msg, type: 'error' });
        }
        setActing(false);
    };

    /* ── helpers ───────────────────────────────────────────────── */
    const formatDate = (d: string) => {
        try { return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }); }
        catch { return d; }
    };

    const changeColor = (t: string) => {
        switch (t) {
            case 'added': return { bg: 'rgba(34,197,94,.08)', color: '#4ade80', icon: 'add_circle' };
            case 'removed': return { bg: 'rgba(239,68,68,.08)', color: '#f87171', icon: 'remove_circle' };
            case 'modified': return { bg: 'rgba(245,158,11,.08)', color: '#fbbf24', icon: 'edit' };
            default: return { bg: 'rgba(255,255,255,.04)', color: 'var(--text-muted)', icon: 'check_circle' };
        }
    };

    const directionBadge = (d: string) => {
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
    };

    /* ── render ─────────────────────────────────────────────────── */
    return (
        <div className="p-6 max-w-6xl mx-auto animate-fade-in">
            <AILoadingOverlay visible={overlayVisible} message="Running AI version diff analysis…" />

            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div>
                    <button onClick={() => router.push(`/dashboard/policies/${policyId}`)} className="btn-ghost px-0 py-1 text-[10px] flex items-center gap-0.5 mb-1" style={{ color: 'var(--text-muted)' }}>
                        <Icon name="arrow_back" size={12} />
                        Back to Policy
                    </button>
                    <h1 className="text-xl font-bold text-white flex items-center gap-2">
                        <Icon name="history" size={20} color="#a78bfa" />
                        Version History
                    </h1>
                    {policyName && <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{policyName}</p>}
                </div>
                <div className="flex items-center gap-3">
                    {aiProvider && (
                        <span className="text-[10px] px-2 py-1 rounded-lg flex items-center gap-1" style={{ background: 'rgba(139,92,246,.08)', color: '#a78bfa' }}>
                            <Icon name="smart_toy" size={12} />
                            {aiProvider.provider} / {aiProvider.model}
                        </span>
                    )}
                    <button onClick={handleCreateSnapshot} disabled={acting} className="btn-primary px-4 py-2.5 text-xs flex items-center gap-1.5">
                        <Icon name="add_circle" size={14} />
                        Create Snapshot
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
                {/* ═══ Version Timeline ═════════════════════════════ */}
                <div className="lg:col-span-2 rounded-2xl p-5" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-default)' }}>
                    <h2 className="text-sm font-bold text-white mb-4">Versions</h2>

                    {loading ? (
                        <div className="flex items-center justify-center py-12">
                            <Icon name="progress_activity" size={20} color="var(--text-muted)" className="animate-spin" />
                        </div>
                    ) : versions.length === 0 ? (
                        <div className="text-center py-12">
                            <Icon name="folder_off" size={30} color="var(--text-muted)" className="mb-2" />
                            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>No versions yet — create a snapshot above.</p>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {versions.map(v => (
                                <div
                                    key={v.id}
                                    className="flex items-center gap-3 px-4 py-3 rounded-xl group transition-all"
                                    style={{
                                        background: (baseV === v.version_number || compareV === v.version_number)
                                            ? 'rgba(139,92,246,.06)' : 'var(--bg-elevated)',
                                        border: `1px solid ${(baseV === v.version_number || compareV === v.version_number)
                                            ? 'rgba(139,92,246,.2)' : 'var(--border-default)'}`,
                                    }}
                                >
                                    <div className="w-8 h-8 rounded-lg flex items-center justify-center text-[11px] font-bold flex-shrink-0"
                                        style={{ background: v.is_locked ? 'rgba(34,197,94,.1)' : 'rgba(139,92,246,.1)', color: v.is_locked ? '#4ade80' : '#a78bfa' }}>
                                        v{v.version_number}
                                    </div>

                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs font-medium text-white">{v.change_summary || 'Snapshot'}</span>
                                            {v.is_locked && (
                                                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[8px] font-bold" style={{ background: 'rgba(34,197,94,.08)', color: '#4ade80' }}>
                                                    <Icon name="lock" size={20} className="text-[10px]" />LOCKED
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                                            {formatDate(v.created_at)}
                                        </p>
                                    </div>

                                    <div className="flex items-center gap-1 opacity-70 group-hover:opacity-100 transition-opacity">
                                        <button onClick={() => setBaseV(v.version_number)}
                                            className={`px-2 py-1 rounded text-[9px] font-semibold transition-all ${baseV === v.version_number ? 'ring-1' : ''}`}
                                            style={{ background: baseV === v.version_number ? 'rgba(59,130,246,.1)' : 'transparent', color: baseV === v.version_number ? '#60a5fa' : 'var(--text-muted)' }}
                                            title="Set as base">
                                            BASE
                                        </button>
                                        <button onClick={() => setCompareV(v.version_number)}
                                            className={`px-2 py-1 rounded text-[9px] font-semibold transition-all ${compareV === v.version_number ? 'ring-1' : ''}`}
                                            style={{ background: compareV === v.version_number ? 'rgba(245,158,11,.1)' : 'transparent', color: compareV === v.version_number ? '#fbbf24' : 'var(--text-muted)' }}
                                            title="Set as compare">
                                            CMP
                                        </button>
                                    </div>

                                    <div className="flex gap-0.5 opacity-60 group-hover:opacity-100 transition-opacity">
                                        {!v.is_locked && (
                                            <>
                                                <button onClick={() => handleLock(v.version_number)} disabled={acting} className="btn-icon p-1.5" title="Lock version" style={{ color: '#4ade80' }}>
                                                    <Icon name="lock" size={14} />
                                                </button>
                                                <button onClick={() => handleRollback(v.version_number)} disabled={acting} className="btn-icon p-1.5" title="Rollback" style={{ color: '#60a5fa' }}>
                                                    <Icon name="undo" size={14} />
                                                </button>
                                            </>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* ═══ Compare Panel (now with AI) ═════════════════════ */}
                <div className="lg:col-span-3 rounded-2xl overflow-hidden" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-default)' }}>
                    {/* Compare selector */}
                    <div className="p-5 border-b" style={{ borderColor: 'var(--border-default)' }}>
                        <h2 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
                            <Icon name="compare_arrows" size={16} color="#60a5fa" />
                            Compare Versions
                        </h2>

                        <div className="flex items-center gap-2 mb-4">
                            <div className="flex-1 text-center">
                                <p className="text-[9px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>Base</p>
                                <div className="inline-flex px-3 py-1.5 rounded-lg text-xs font-bold" style={{ background: baseV != null ? 'rgba(59,130,246,.08)' : 'var(--bg-elevated)', color: baseV != null ? '#60a5fa' : 'var(--text-muted)' }}>
                                    {baseV != null ? `v${baseV}` : '—'}
                                </div>
                            </div>
                            <Icon name="compare_arrows" size={14} color="var(--text-muted)" />
                            <div className="flex-1 text-center">
                                <p className="text-[9px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>Compare</p>
                                <div className="inline-flex px-3 py-1.5 rounded-lg text-xs font-bold" style={{ background: compareV != null ? 'rgba(245,158,11,.08)' : 'var(--bg-elevated)', color: compareV != null ? '#fbbf24' : 'var(--text-muted)' }}>
                                    {compareV != null ? `v${compareV}` : '—'}
                                </div>
                            </div>
                        </div>

                        <button
                            onClick={handleCompare}
                            disabled={baseV == null || compareV == null || comparing || baseV === compareV}
                            className="btn-primary w-full py-2.5 text-xs flex items-center justify-center gap-1.5"
                        >
                            {comparing
                                ? <Icon name="progress_activity" size={14} className="animate-spin" />
                                : <Icon name="difference" size={14} />}
                            {comparing ? 'Comparing…' : 'Compare & Analyze'}
                        </button>
                    </div>

                    {/* Results area */}
                    {compareResult && (
                        <div>
                            {/* Tab toggle: Raw Diff / AI Analysis */}
                            <div className="flex border-b" style={{ borderColor: 'var(--border-default)' }}>
                                <button
                                    onClick={() => setViewTab('ai')}
                                    className={`flex-1 py-2.5 text-xs font-semibold text-center transition-all flex items-center justify-center gap-1.5 ${viewTab === 'ai' ? 'text-white' : ''}`}
                                    style={{
                                        background: viewTab === 'ai' ? 'rgba(139,92,246,.06)' : 'transparent',
                                        color: viewTab === 'ai' ? '#a78bfa' : 'var(--text-muted)',
                                        borderBottom: viewTab === 'ai' ? '2px solid #a78bfa' : '2px solid transparent',
                                    }}
                                >
                                    <Icon name="psychology" size={14} />
                                    AI Analysis
                                    {aiDiff && <span className="w-1.5 h-1.5 rounded-full bg-green-400" />}
                                    {aiDiffError && <span className="w-1.5 h-1.5 rounded-full bg-red-400" />}
                                </button>
                                <button
                                    onClick={() => setViewTab('raw')}
                                    className={`flex-1 py-2.5 text-xs font-semibold text-center transition-all flex items-center justify-center gap-1.5`}
                                    style={{
                                        background: viewTab === 'raw' ? 'rgba(59,130,246,.06)' : 'transparent',
                                        color: viewTab === 'raw' ? '#60a5fa' : 'var(--text-muted)',
                                        borderBottom: viewTab === 'raw' ? '2px solid #60a5fa' : '2px solid transparent',
                                    }}
                                >
                                    <Icon name="code" size={14} />
                                    Raw Diff ({compareResult.changes.length})
                                </button>
                            </div>

                            <div className="p-5">
                                {viewTab === 'ai' ? (
                                    /* ── AI Analysis view ──────────────── */
                                    <div>
                                        {aiDiffLoading && (
                                            <div className="flex items-center justify-center py-8 gap-2">
                                                <div className="w-4 h-4 border-2 border-violet-400 border-t-transparent rounded-full animate-spin" />
                                                <span className="text-xs" style={{ color: '#a78bfa' }}>AI analyzing differences…</span>
                                            </div>
                                        )}

                                        {aiDiffError && (
                                            <div className="p-4 rounded-xl" style={{ background: 'rgba(239,68,68,.06)', border: '1px solid rgba(239,68,68,.12)' }}>
                                                <div className="flex items-start gap-3">
                                                    <Icon name="error" size={16} color="#f87171" className="mt-0.5" />
                                                    <div>
                                                        <p className="text-xs font-semibold" style={{ color: '#f87171' }}>AI Analysis Failed</p>
                                                        <p className="text-[11px] mt-1" style={{ color: 'var(--text-muted)' }}>{aiDiffError}</p>
                                                        <p className="text-[10px] mt-2" style={{ color: 'var(--text-muted)' }}>Showing raw diff instead. Switch tabs to view changes.</p>
                                                    </div>
                                                </div>
                                            </div>
                                        )}

                                        {aiDiff && (
                                            <div className="space-y-4">
                                                {/* Risk badges */}
                                                <div className="flex items-center gap-3 flex-wrap">
                                                    {directionBadge(aiDiff.risk_direction)}
                                                    <span className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase" style={{
                                                        background: aiDiff.risk_severity === 'high' ? 'rgba(239,68,68,.1)' : aiDiff.risk_severity === 'medium' ? 'rgba(245,158,11,.1)' : 'rgba(34,197,94,.1)',
                                                        color: aiDiff.risk_severity === 'high' ? '#f87171' : aiDiff.risk_severity === 'medium' ? '#fbbf24' : '#4ade80',
                                                    }}>
                                                        {aiDiff.risk_severity || 'Unknown'} severity
                                                    </span>
                                                    <span className="px-2 py-0.5 rounded-md text-[10px] font-bold" style={{ background: 'rgba(59,130,246,.1)', color: '#60a5fa' }}>
                                                        Impact: {aiDiff.risk_impact || 'TBD'}
                                                    </span>
                                                </div>

                                                {/* Summary */}
                                                <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{aiDiff.summary}</p>

                                                {/* Critical changes */}
                                                {aiDiff.critical_changes?.length > 0 && (
                                                    <div>
                                                        <p className="text-[11px] font-bold mb-2" style={{ color: '#f87171' }}>
                                                            <Icon name="warning" size={12} className="align-middle mr-1" />
                                                            Critical Changes
                                                        </p>
                                                        <ul className="space-y-1">
                                                            {aiDiff.critical_changes.map((c, i) => (
                                                                <li key={i} className="flex items-start gap-2 text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                                                                    <span className="text-[8px] mt-1" style={{ color: '#f87171' }}>●</span>{c}
                                                                </li>
                                                            ))}
                                                        </ul>
                                                    </div>
                                                )}

                                                {/* Compliance flags */}
                                                {aiDiff.compliance_flags?.length > 0 && (
                                                    <div>
                                                        <p className="text-[11px] font-bold mb-2" style={{ color: '#fbbf24' }}>
                                                            <Icon name="flag" size={12} className="align-middle mr-1" />
                                                            Compliance Flags
                                                        </p>
                                                        <div className="flex flex-wrap gap-1.5">
                                                            {aiDiff.compliance_flags.map((f, i) => (
                                                                <span key={i} className="px-2 py-0.5 rounded-md text-[10px]" style={{ background: 'rgba(245,158,11,.08)', color: '#fbbf24' }}>{f}</span>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}

                                                {/* AI metadata */}
                                                <div className="pt-3 border-t flex items-center gap-4 text-[10px]" style={{ borderColor: 'var(--border-default)', color: 'var(--text-muted)' }}>
                                                    <span className="flex items-center gap-1">
                                                        <Icon name="smart_toy" size={12} />
                                                        {aiDiff.ai_provider || aiProvider?.provider || 'AI'} / {aiDiff.ai_model || aiProvider?.model || 'model'}
                                                    </span>
                                                    {aiDiff.ai_duration_ms && (
                                                        <span className="flex items-center gap-1">
                                                            <Icon name="timer" size={12} />
                                                            {(aiDiff.ai_duration_ms / 1000).toFixed(1)}s
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    /* ── Raw diff view ─────────────────── */
                                    <div className="space-y-2">
                                        <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                                            Changes (v{compareResult.base_version} → v{compareResult.compare_version})
                                        </p>
                                        {compareResult.changes.length === 0 ? (
                                            <p className="text-xs py-4 text-center" style={{ color: 'var(--text-muted)' }}>No changes detected</p>
                                        ) : (
                                            compareResult.changes.map((c, i) => {
                                                const cc = changeColor(c.type);
                                                return (
                                                    <div key={i} className="flex items-start gap-2 px-3 py-2 rounded-lg" style={{ background: cc.bg }}>
                                                        <Icon name={cc.icon} size={14} className="mt-0.5" />
                                                        <div className="flex-1 min-w-0">
                                                            <p className="text-[10px] font-semibold" style={{ color: cc.color }}>{c.type.toUpperCase()}</p>
                                                            <p className="text-[10px] text-white">{c.path}</p>
                                                            <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-secondary)' }}>{c.detail}</p>
                                                        </div>
                                                    </div>
                                                );
                                            })
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {!compareResult && (
                        <div className="p-8 text-center">
                            <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-3" style={{ background: 'rgba(59,130,246,.06)' }}>
                                <Icon name="compare_arrows" size={24} color="var(--accent-blue)" />
                            </div>
                            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                                Click <strong>BASE</strong> and <strong>CMP</strong> on versions, then compare.
                            </p>
                            <p className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>AI analysis runs automatically after compare.</p>
                        </div>
                    )}
                </div>
            </div>

            {/* ═══ Toast ════════════════════════════════════════════ */}
            {toast && (
                <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-medium shadow-lg animate-fade-in"
                    style={{
                        background: toast.type === 'success' ? 'rgba(34,197,94,.12)' : 'rgba(239,68,68,.12)',
                        border: `1px solid ${toast.type === 'success' ? 'rgba(34,197,94,.25)' : 'rgba(239,68,68,.25)'}`,
                        color: toast.type === 'success' ? '#4ade80' : '#f87171',
                    }}>
                    <Icon name={toast.type === 'success' ? 'check_circle' : 'error'} size={14} />
                    {toast.msg}
                </div>
            )}
        </div>
    );
}
