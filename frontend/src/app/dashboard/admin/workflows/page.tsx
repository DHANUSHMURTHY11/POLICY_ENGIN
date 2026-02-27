'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { workflowAPI, aiAPI } from '@/lib/api';
import { useAI } from '@/contexts/AIContext';
import AILoadingOverlay from '@/components/ai/AILoadingOverlay';
import Icon from '@/components/ui/Icon';

/* ─── types ───────────────────────────────────────────────────── */
interface TemplateLevel {
    level_number: number;
    role_id: string;
    role_name?: string;
    is_parallel: boolean;
}

interface Template {
    id: string;
    name: string;
    type: string;
    levels: TemplateLevel[];
    created_at: string;
    ai_validation?: { valid: boolean; issues?: string[]; suggestions?: string[] };
}

/* ═════════════════════════════════════════════════════════════════ */
export default function AdminWorkflowsPage() {
    const router = useRouter();

    /* ── templates ────────────────────────────────────────────────── */
    const [templates, setTemplates] = useState<Template[]>([]);
    const [loading, setLoading] = useState(true);

    /* ── NL creation ─────────────────────────────────────────────── */
    const [nlInput, setNlInput] = useState('');
    const [nlCreating, setNlCreating] = useState(false);
    const [nlResult, setNlResult] = useState<Template | null>(null);
    const [nlError, setNlError] = useState('');

    /* ── manual creation ─────────────────────────────────────────── */
    const [showManual, setShowManual] = useState(false);
    const [manualName, setManualName] = useState('');
    const [manualType, setManualType] = useState('sequential');
    const [manualLevels, setManualLevels] = useState<TemplateLevel[]>([{ level_number: 1, role_id: '', role_name: '', is_parallel: false }]);

    /* ── roles ────────────────────────────────────────────────────── */
    const [roles, setRoles] = useState<{ id: string; name: string }[]>([]);

    /* ── overlay & toast ─────────────────────────────────────────── */
    const [overlayVisible, setOverlayVisible] = useState(false);
    const [overlayMessage, setOverlayMessage] = useState('');
    const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
    const [aiProvider, setAiProvider] = useState<{ provider: string; model: string } | null>(null);

    /* ── fetch ────────────────────────────────────────────────────── */
    const fetchTemplates = useCallback(async () => {
        setLoading(true);
        try {
            const res = await workflowAPI.listTemplates();
            setTemplates(Array.isArray(res.data) ? res.data : res.data?.items || []);
        } catch { /* empty */ } finally { setLoading(false); }
    }, []);

    useEffect(() => { fetchTemplates(); }, [fetchTemplates]);
    useEffect(() => { workflowAPI.getRoles().then(r => setRoles(Array.isArray(r.data) ? r.data : r.data?.items || [])).catch(() => { }); }, []);
    useEffect(() => { aiAPI.getProviderInfo().then(r => setAiProvider(r.data)).catch(() => { }); }, []);

    /* ── NL template creation ────────────────────────────────────── */
    const createFromNL = async () => {
        if (!nlInput.trim()) return;
        setNlCreating(true);
        setNlError('');
        setNlResult(null);
        setOverlayMessage('AI is generating workflow template…');
        setOverlayVisible(true);
        try {
            const res = await workflowAPI.createTemplateNatural(nlInput.trim());
            setNlResult(res.data as Template);
            setToast({ msg: 'Template created from AI', type: 'success' });
            fetchTemplates();
            setNlInput('');
        } catch (err: unknown) {
            const resp = (err as { response?: { status?: number; data?: { detail?: string } } })?.response;
            if (resp?.status === 503) {
                setNlError('AI service unavailable');
            } else {
                setNlError(resp?.data?.detail || 'Failed to create template');
            }
        } finally {
            setNlCreating(false);
            setOverlayVisible(false);
        }
    };

    /* ── manual creation ─────────────────────────────────────────── */
    const createManual = async () => {
        if (!manualName.trim()) return;
        try {
            await workflowAPI.createTemplate({
                name: manualName,
                type: manualType,
                levels: manualLevels.filter(l => l.role_id),
            });
            setToast({ msg: 'Template created', type: 'success' });
            setShowManual(false);
            setManualName('');
            setManualLevels([{ level_number: 1, role_id: '', role_name: '', is_parallel: false }]);
            fetchTemplates();
        } catch (err: unknown) {
            const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail || 'Creation failed';
            setToast({ msg, type: 'error' });
        }
    };

    /* ── delete ───────────────────────────────────────────────────── */
    const deleteTemplate = async (id: string) => {
        try {
            await workflowAPI.deleteTemplate(id);
            setToast({ msg: 'Template deleted', type: 'success' });
            fetchTemplates();
        } catch { setToast({ msg: 'Delete failed', type: 'error' }); }
    };

    /* ═══════════════════════════════════════════════════════════════ */
    return (
        <div className="flex flex-col h-full" style={{ background: 'var(--bg-primary)' }}>
            <AILoadingOverlay visible={overlayVisible} message={overlayMessage} />

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
                <Icon name="settings" size={14} color="var(--accent-violet)" />
                <h1 className="text-sm font-bold text-white">Workflow Templates</h1>
                <div className="flex-1" />
                {aiProvider && (
                    <span className="text-[10px] px-2 py-1 rounded-lg flex items-center gap-1" style={{ background: 'rgba(139,92,246,.08)', color: '#a78bfa' }}>
                        <Icon name="smart_toy" size={12} />
                        {aiProvider.provider} / {aiProvider.model}
                    </span>
                )}
                <button onClick={() => setShowManual(true)} className="btn-ghost text-xs px-3 py-1.5 flex items-center gap-1">
                    <Icon name="add" size={14} />
                    Manual Create
                </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
                <div className="max-w-4xl mx-auto space-y-6">

                    {/* ── NL Creator ─────────────────────────────────── */}
                    <div className="glass-card overflow-hidden">
                        <div style={{ height: 3, background: 'var(--gradient-violet)' }} />
                        <div className="p-5">
                            <div className="flex items-center gap-2 mb-3">
                                <Icon name="smart_toy" size={14} color="#a78bfa" />
                                <span className="text-xs font-bold text-white">AI Template Creator</span>
                                <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: 'rgba(139,92,246,.08)', color: '#a78bfa' }}>Natural Language</span>
                            </div>
                            <p className="text-[11px] mb-3" style={{ color: 'var(--text-muted)' }}>
                                Describe your approval workflow in plain text. Example: &ldquo;Manager → Risk Officer → Director → Board Committee&rdquo;
                            </p>
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    value={nlInput}
                                    onChange={e => setNlInput(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && createFromNL()}
                                    placeholder='e.g. "Manager → Risk → Director → Committee"'
                                    className="flex-1 rounded-xl px-4 py-2.5 text-sm theme-input"
                                    disabled={nlCreating}
                                />
                                <button
                                    onClick={createFromNL}
                                    disabled={nlCreating || !nlInput.trim()}
                                    className="btn-primary px-5 py-2.5 text-xs flex items-center gap-2 rounded-xl"
                                >
                                    {nlCreating ? (
                                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                    ) : (
                                        <Icon name="auto_awesome" size={14} />
                                    )}
                                    Generate
                                </button>
                            </div>
                            {nlError && (
                                <p className="text-[11px] mt-2" style={{ color: '#f87171' }}>{nlError}</p>
                            )}

                            {/* NL Result */}
                            {nlResult && (
                                <div className="mt-4 p-4 rounded-xl" style={{ background: 'rgba(34,197,94,.04)', border: '1px solid rgba(34,197,94,.12)' }}>
                                    <div className="flex items-center gap-2 mb-3">
                                        <Icon name="check_circle" size={14} color="#4ade80" />
                                        <span className="text-xs font-bold" style={{ color: '#4ade80' }}>Template Generated: {nlResult.name}</span>
                                    </div>
                                    {/* Hierarchy visualization */}
                                    <div className="flex items-center gap-1 flex-wrap">
                                        {nlResult.levels?.map((level, i) => (
                                            <React.Fragment key={i}>
                                                {i > 0 && (
                                                    <span className="text-sm" style={{ color: level.is_parallel ? '#a78bfa' : 'var(--text-muted)' }}>
                                                        {level.is_parallel ? '⚡' : '→'}
                                                    </span>
                                                )}
                                                <span className="px-2.5 py-1 rounded-lg text-[11px] font-medium" style={{
                                                    background: level.is_parallel ? 'rgba(139,92,246,.08)' : 'rgba(59,130,246,.08)',
                                                    color: level.is_parallel ? '#a78bfa' : '#60a5fa',
                                                    border: `1px solid ${level.is_parallel ? 'rgba(139,92,246,.15)' : 'rgba(59,130,246,.15)'}`,
                                                }}>
                                                    L{level.level_number}: {level.role_name || level.role_id}
                                                </span>
                                            </React.Fragment>
                                        ))}
                                    </div>
                                    {nlResult.ai_validation && (
                                        <div className="mt-3 text-[10px]" style={{ color: 'var(--text-muted)' }}>
                                            AI Validation: {nlResult.ai_validation.valid ? '✓ Passed' : '✗ Issues found'}
                                            {nlResult.ai_validation.issues?.map((iss, j) => (
                                                <span key={j} className="block ml-3 mt-0.5" style={{ color: '#f87171' }}>• {iss}</span>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* ── Templates list ─────────────────────────────── */}
                    <div>
                        <p className="text-[11px] font-bold uppercase tracking-wider mb-3" style={{ color: 'var(--text-muted)' }}>
                            Existing Templates ({templates.length})
                        </p>
                        {loading ? (
                            <div className="flex justify-center py-8">
                                <div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                            </div>
                        ) : templates.length === 0 ? (
                            <div className="glass-card p-8 text-center">
                                <Icon name="schema" size={30} color="var(--text-muted)" className="mb-2" />
                                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>No templates yet. Create one above.</p>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {templates.map(t => (
                                    <div key={t.id} className="glass-card p-4 flex items-center gap-4 group">
                                        <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(139,92,246,.08)' }}>
                                            <Icon name="schema" size={18} color="#a78bfa" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-xs font-bold text-white truncate">{t.name}</p>
                                            <div className="flex items-center gap-1 mt-1 flex-wrap">
                                                {t.levels?.map((level, i) => (
                                                    <React.Fragment key={i}>
                                                        {i > 0 && (
                                                            <span className="text-[10px]" style={{ color: level.is_parallel ? '#a78bfa' : 'var(--text-muted)' }}>
                                                                {level.is_parallel ? '⚡' : '→'}
                                                            </span>
                                                        )}
                                                        <span className="px-1.5 py-0.5 rounded text-[10px]" style={{
                                                            background: level.is_parallel ? 'rgba(139,92,246,.06)' : 'rgba(59,130,246,.06)',
                                                            color: level.is_parallel ? '#a78bfa' : '#60a5fa',
                                                        }}>
                                                            {level.role_name || level.role_id}
                                                        </span>
                                                    </React.Fragment>
                                                ))}
                                            </div>
                                        </div>
                                        <span className="text-[10px] px-2 py-0.5 rounded-md" style={{ background: 'rgba(245,158,11,.08)', color: '#fbbf24' }}>{t.type}</span>
                                        <button onClick={() => deleteTemplate(t.id)} className="btn-icon opacity-0 group-hover:opacity-100" title="Delete">
                                            <Icon name="delete" size={14} color="var(--accent-rose)" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* ── Manual creation modal ──────────────────────────────── */}
            {showManual && (
                <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,.6)' }} onClick={() => setShowManual(false)}>
                    <div className="glass-card w-full max-w-lg animate-scale-in" onClick={e => e.stopPropagation()}>
                        <div style={{ height: 3, background: 'var(--gradient-violet)' }} />
                        <div className="p-6 max-h-[80vh] overflow-y-auto">
                            <h3 className="text-base font-bold text-white mb-4">Create Template Manually</h3>
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-secondary)' }}>Template Name</label>
                                    <input type="text" value={manualName} onChange={e => setManualName(e.target.value)} className="w-full rounded-xl px-4 py-2.5 text-sm theme-input" placeholder="e.g. Standard Approval" />
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-secondary)' }}>Type</label>
                                    <select value={manualType} onChange={e => setManualType(e.target.value)} className="w-full rounded-xl px-4 py-2.5 text-sm theme-input">
                                        <option value="sequential">Sequential</option>
                                        <option value="parallel">Parallel</option>
                                        <option value="hybrid">Hybrid</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-secondary)' }}>Levels</label>
                                    {manualLevels.map((level, i) => (
                                        <div key={i} className="flex items-center gap-2 mb-2">
                                            <span className="text-[10px] w-6 text-center" style={{ color: 'var(--text-muted)' }}>L{i + 1}</span>
                                            <select
                                                value={level.role_id}
                                                onChange={e => {
                                                    const updated = [...manualLevels];
                                                    const selectedRole = roles.find(r => r.id === e.target.value);
                                                    updated[i] = { ...level, role_id: e.target.value, role_name: selectedRole?.name || '' };
                                                    setManualLevels(updated);
                                                }}
                                                className="flex-1 rounded-lg px-3 py-2 text-xs theme-input"
                                            >
                                                <option value="">Select role...</option>
                                                {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                                            </select>
                                            <label className="flex items-center gap-1 cursor-pointer">
                                                <input type="checkbox" checked={level.is_parallel} onChange={e => {
                                                    const updated = [...manualLevels];
                                                    updated[i] = { ...level, is_parallel: e.target.checked };
                                                    setManualLevels(updated);
                                                }} className="w-3 h-3" />
                                                <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>⚡</span>
                                            </label>
                                            {manualLevels.length > 1 && (
                                                <button onClick={() => setManualLevels(manualLevels.filter((_, j) => j !== i))} className="btn-icon" style={{ width: 24, height: 24 }}>
                                                    <Icon name="close" size={12} color="var(--accent-rose)" />
                                                </button>
                                            )}
                                        </div>
                                    ))}
                                    <button
                                        onClick={() => setManualLevels([...manualLevels, { level_number: manualLevels.length + 1, role_id: '', role_name: '', is_parallel: false }])}
                                        className="text-[11px] flex items-center gap-1 mt-1" style={{ color: '#60a5fa' }}
                                    >
                                        <Icon name="add" size={12} />Add Level
                                    </button>
                                </div>
                            </div>
                            <div className="flex gap-3 mt-5">
                                <button onClick={() => setShowManual(false)} className="btn-ghost px-4 py-2.5 text-sm flex-1">Cancel</button>
                                <button onClick={createManual} disabled={!manualName.trim()} className="btn-primary px-4 py-2.5 text-sm flex-1">Create Template</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
