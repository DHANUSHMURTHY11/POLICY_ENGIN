'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { policyAPI, queryAPI, aiAPI } from '@/lib/api';
import { useAI } from '@/contexts/AIContext';
import AILoadingOverlay from '@/components/ai/AILoadingOverlay';
import Icon from '@/components/ui/Icon';

/* ── Types ──────────────────────────────────────────────────────── */
interface RuleEvaluation {
    field_name: string;
    field_type: string;
    rule: string;
    input_value: any;
    result: string;
    detail: string;
}
interface ReasoningStep {
    step: number;
    action: string;
    detail: string;
}
interface QueryResult {
    policy_id: string;
    policy_name: string;
    version: number;
    decision: string;
    confidence: number;
    explanation: string;
    rule_evaluations: RuleEvaluation[];
    reasoning_trace: ReasoningStep[];
    ai_analysis: string;
    warnings: string[];
    ai_provider?: string;
    ai_model?: string;
    ai_duration_ms?: number;
}
interface FieldDef {
    field_name: string;
    field_type: string;
    validation_rules: Record<string, any>;
}

export default function QueryPage() {
    const params = useParams();
    const router = useRouter();
    const policyId = params.id as string;
    const aiCtx = useAI();

    /* ── state ─────────────────────────────────────────────────── */
    const [policyName, setPolicyName] = useState('');
    const [userQuery, setUserQuery] = useState('');
    const [fields, setFields] = useState<FieldDef[]>([]);
    const [inputs, setInputs] = useState<Record<string, string>>({});
    const [result, setResult] = useState<QueryResult | null>(null);
    const [loading, setLoading] = useState(false);
    const [loadingFields, setLoadingFields] = useState(true);
    const [activeTab, setActiveTab] = useState<'decision' | 'ai' | 'rules' | 'trace'>('decision');

    /* ── AI state ──────────────────────────────────────────────── */
    const [aiProvider, setAiProvider] = useState<{ provider: string; model: string } | null>(null);
    const [overlayVisible, setOverlayVisible] = useState(false);
    const [showRawJson, setShowRawJson] = useState(false);

    /* ── load policy + extract fields ──────────────────────────── */
    useEffect(() => {
        (async () => {
            try {
                const res = await policyAPI.get(policyId);
                const p = res.data;
                setPolicyName(p.name ?? '');
                const ds = p.document_structure;
                if (ds?.sections) {
                    const extracted: FieldDef[] = [];
                    for (const sec of ds.sections) {
                        for (const sub of sec.subsections || []) {
                            for (const f of sub.fields || []) {
                                extracted.push({
                                    field_name: f.field_name,
                                    field_type: f.field_type || 'text',
                                    validation_rules: f.validation_rules || {},
                                });
                            }
                        }
                    }
                    setFields(extracted);
                }
            } catch { /* ignore */ }
            setLoadingFields(false);
        })();
    }, [policyId]);

    useEffect(() => { aiAPI.getProviderInfo().then(r => setAiProvider(r.data)).catch(() => { }); }, []);

    /* ── execute query ─────────────────────────────────────────── */
    const handleSubmit = async () => {
        if (!userQuery.trim()) return;
        setLoading(true);
        setResult(null);
        setOverlayVisible(true);
        const start = Date.now();
        try {
            await aiCtx.trackAICall('runtime_query', async () => {
                const structured: Record<string, any> = {};
                for (const [key, val] of Object.entries(inputs)) {
                    if (val === '') continue;
                    const field = fields.find(f => f.field_name.toLowerCase().replace(/ /g, '_') === key);
                    if (field?.field_type === 'number' || field?.field_type === 'currency' || field?.field_type === 'percentage') {
                        structured[key] = parseFloat(val) || val;
                    } else if (field?.field_type === 'boolean') {
                        structured[key] = val === 'true';
                    } else {
                        structured[key] = val;
                    }
                }
                const res = await queryAPI.execute(policyId, {
                    user_query: userQuery,
                    structured_inputs: structured,
                });
                const data = res.data as QueryResult;
                data.ai_duration_ms = Date.now() - start;
                data.ai_provider = aiProvider?.provider;
                data.ai_model = aiProvider?.model;
                setResult(data);
                setActiveTab('decision');
            });
        } catch (err: unknown) {
            const resp = (err as { response?: { status?: number; data?: { detail?: string } } })?.response;
            if (resp?.status === 503) {
                setResult({
                    policy_id: policyId,
                    policy_name: policyName,
                    version: 0,
                    decision: 'error',
                    confidence: 0,
                    explanation: 'AI service unavailable. The runtime engine requires AI to evaluate policies. Please ensure the AI backend is running.',
                    rule_evaluations: [],
                    reasoning_trace: [],
                    ai_analysis: '',
                    warnings: ['AI service is offline — deterministic evaluation only'],
                });
            } else {
                setResult({
                    policy_id: policyId,
                    policy_name: policyName,
                    version: 0,
                    decision: 'error',
                    confidence: 0,
                    explanation: resp?.data?.detail || 'Query execution failed',
                    rule_evaluations: [],
                    reasoning_trace: [],
                    ai_analysis: '',
                    warnings: [],
                });
            }
        } finally {
            setLoading(false);
            setOverlayVisible(false);
        }
    };

    /* ── helpers ───────────────────────────────────────────────── */
    const decisionStyle = (d: string) => {
        switch (d) {
            case 'approved': return { bg: 'rgba(34,197,94,.08)', color: '#4ade80', icon: 'check_circle' };
            case 'rejected': return { bg: 'rgba(239,68,68,.08)', color: '#f87171', icon: 'cancel' };
            case 'needs_review': return { bg: 'rgba(245,158,11,.08)', color: '#fbbf24', icon: 'pending' };
            case 'error': return { bg: 'rgba(239,68,68,.08)', color: '#f87171', icon: 'error' };
            default: return { bg: 'rgba(139,92,246,.08)', color: '#a78bfa', icon: 'help' };
        }
    };

    const evalStyle = (r: string) => {
        switch (r) {
            case 'pass': return { bg: 'rgba(34,197,94,.06)', color: '#4ade80', icon: 'check_circle' };
            case 'fail': return { bg: 'rgba(239,68,68,.06)', color: '#f87171', icon: 'cancel' };
            case 'not_provided': return { bg: 'rgba(245,158,11,.06)', color: '#fbbf24', icon: 'warning' };
            default: return { bg: 'rgba(255,255,255,.02)', color: 'var(--text-muted)', icon: 'radio_button_unchecked' };
        }
    };

    const fieldKey = (name: string) => name.toLowerCase().replace(/ /g, '_');

    /* stats */
    const passCount = result?.rule_evaluations.filter(e => e.result === 'pass').length ?? 0;
    const failCount = result?.rule_evaluations.filter(e => e.result === 'fail').length ?? 0;
    const totalRules = result?.rule_evaluations.length ?? 0;

    /* ── render ─────────────────────────────────────────────────── */
    return (
        <div className="p-6 max-w-6xl mx-auto animate-fade-in">
            <AILoadingOverlay visible={overlayVisible} message="AI is evaluating policy rules…" />

            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div>
                    <button onClick={() => router.push(`/dashboard/policies/${policyId}`)} className="btn-ghost px-0 py-1 text-[10px] flex items-center gap-0.5 mb-1" style={{ color: 'var(--text-muted)' }}>
                        <Icon name="arrow_back" size={12} />
                        Back to Policy
                    </button>
                    <h1 className="text-xl font-bold text-white flex items-center gap-2">
                        <Icon name="psychology" size={20} color="#a78bfa" />
                        Policy Query Engine
                    </h1>
                    {policyName && <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{policyName}</p>}
                </div>
                {aiProvider && (
                    <span className="text-[10px] px-2 py-1 rounded-lg flex items-center gap-1" style={{ background: 'rgba(139,92,246,.08)', color: '#a78bfa' }}>
                        <Icon name="smart_toy" size={12} />
                        {aiProvider.provider} / {aiProvider.model}
                    </span>
                )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* ═══ Left — Input Panel ══════════════════════════ */}
                <div className="space-y-4">
                    {/* Query input */}
                    <div className="rounded-2xl p-5" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-default)' }}>
                        <h2 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
                            <Icon name="chat" size={16} color="#60a5fa" />
                            Your Question
                        </h2>
                        <textarea
                            value={userQuery}
                            onChange={e => setUserQuery(e.target.value)}
                            placeholder="e.g. Is this applicant eligible for a home loan with 750 credit score and ₹12L income?"
                            rows={3}
                            className="w-full px-3 py-2.5 rounded-xl text-xs bg-[var(--bg-elevated)] text-white placeholder:text-[var(--text-muted)] outline-none resize-none"
                            style={{ border: '1px solid var(--border-default)' }}
                        />
                    </div>

                    {/* Structured inputs */}
                    <div className="rounded-2xl p-5" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-default)' }}>
                        <h2 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
                            <Icon name="tune" size={16} color="#a78bfa" />
                            Structured Inputs
                            <span className="text-[9px] font-normal px-1.5 py-0.5 rounded" style={{ background: 'rgba(139,92,246,.08)', color: '#a78bfa' }}>
                                {fields.length} fields
                            </span>
                        </h2>

                        {loadingFields ? (
                            <div className="flex items-center justify-center py-8">
                                <Icon name="progress_activity" size={20} color="var(--text-muted)" className="animate-spin" />
                            </div>
                        ) : fields.length === 0 ? (
                            <p className="text-xs py-4 text-center" style={{ color: 'var(--text-muted)' }}>
                                No fields found — you can still submit a text-only query.
                            </p>
                        ) : (
                            <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
                                {fields.map(f => {
                                    const key = fieldKey(f.field_name);
                                    const isTriggered = result?.rule_evaluations.some(e => fieldKey(e.field_name) === key && e.result !== 'pass');
                                    return (
                                        <div key={key} className="flex items-center gap-2 px-2 py-1.5 rounded-lg transition-all" style={{
                                            background: isTriggered ? 'rgba(239,68,68,.04)' : 'transparent',
                                            border: isTriggered ? '1px solid rgba(239,68,68,.1)' : '1px solid transparent',
                                        }}>
                                            <label className="text-[10px] font-medium text-white w-36 flex-shrink-0 truncate flex items-center gap-1" title={f.field_name}>
                                                {isTriggered && <span className="w-1.5 h-1.5 rounded-full bg-red-400 flex-shrink-0" />}
                                                {f.field_name}
                                                {f.validation_rules?.required && <span style={{ color: '#f87171' }}> *</span>}
                                            </label>
                                            {f.field_type === 'boolean' ? (
                                                <select
                                                    value={inputs[key] ?? ''}
                                                    onChange={e => setInputs(p => ({ ...p, [key]: e.target.value }))}
                                                    className="flex-1 px-2 py-1.5 rounded-lg text-[10px] bg-[var(--bg-elevated)] text-white outline-none"
                                                    style={{ border: '1px solid var(--border-default)' }}
                                                >
                                                    <option value="">— select —</option>
                                                    <option value="true">Yes</option>
                                                    <option value="false">No</option>
                                                </select>
                                            ) : (
                                                <input
                                                    type={f.field_type === 'number' || f.field_type === 'currency' || f.field_type === 'percentage' ? 'number' : 'text'}
                                                    value={inputs[key] ?? ''}
                                                    onChange={e => setInputs(p => ({ ...p, [key]: e.target.value }))}
                                                    placeholder={f.validation_rules?.min != null ? `min: ${f.validation_rules.min}` : f.field_type}
                                                    className="flex-1 px-2 py-1.5 rounded-lg text-[10px] bg-[var(--bg-elevated)] text-white placeholder:text-[var(--text-muted)] outline-none"
                                                    style={{ border: '1px solid var(--border-default)' }}
                                                />
                                            )}
                                            <span className="text-[8px] px-1.5 py-0.5 rounded" style={{ background: 'var(--bg-elevated)', color: 'var(--text-muted)' }}>
                                                {f.field_type}
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* Submit */}
                    <button
                        onClick={handleSubmit}
                        disabled={loading || !userQuery.trim()}
                        className="btn-primary w-full py-3 text-sm flex items-center justify-center gap-2 rounded-xl"
                    >
                        {loading
                            ? <><Icon name="progress_activity" size={14} className="animate-spin" /> Analyzing…</>
                            : <><Icon name="bolt" size={14} /> Execute Query</>}
                    </button>
                </div>

                {/* ═══ Right — Results Panel ═══════════════════════ */}
                <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-default)' }}>
                    {!result ? (
                        <div className="flex flex-col items-center justify-center py-16 px-5">
                            <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4" style={{ background: 'rgba(139,92,246,.06)' }}>
                                <Icon name="query_stats" size={30} color="var(--accent-violet)" />
                            </div>
                            <p className="text-xs text-center" style={{ color: 'var(--text-muted)' }}>Enter a question and click Execute Query to see results.</p>
                            <p className="text-[10px] text-center mt-1" style={{ color: 'var(--text-muted)' }}>AI will analyze the policy rules and provide explanation.</p>
                        </div>
                    ) : (
                        <div>
                            {/* Decision header */}
                            {(() => {
                                const ds = decisionStyle(result.decision);
                                return (
                                    <div className="flex items-center gap-3 px-5 py-4" style={{ background: ds.bg }}>
                                        <Icon name={ds.icon} size={24} />
                                        <div className="flex-1">
                                            <p className="text-sm font-bold" style={{ color: ds.color }}>{result.decision.replace(/_/g, ' ').toUpperCase()}</p>
                                            <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                                                v{result.version} · Confidence: {Math.round(result.confidence * 100)}%
                                                {totalRules > 0 && ` · ${passCount}/${totalRules} rules passed`}
                                            </p>
                                        </div>
                                        {result.warnings.length > 0 && (
                                            <Icon name="warning" size={16} color="#fbbf24" />
                                        )}
                                    </div>
                                );
                            })()}

                            {/* Result tabs */}
                            <div className="flex border-b" style={{ borderColor: 'var(--border-default)' }}>
                                {([
                                    { key: 'decision' as const, label: 'Decision', icon: 'check_circle' },
                                    { key: 'ai' as const, label: 'AI Explanation', icon: 'smart_toy' },
                                    { key: 'rules' as const, label: `Rules (${totalRules})`, icon: 'list' },
                                    { key: 'trace' as const, label: 'Trace', icon: 'history' },
                                ]).map(tab => (
                                    <button
                                        key={tab.key}
                                        onClick={() => setActiveTab(tab.key)}
                                        className="flex-1 py-2.5 text-[10px] font-semibold text-center transition-all flex items-center justify-center gap-1"
                                        style={{
                                            background: activeTab === tab.key ? 'rgba(139,92,246,.06)' : 'transparent',
                                            color: activeTab === tab.key ? '#a78bfa' : 'var(--text-muted)',
                                            borderBottom: activeTab === tab.key ? '2px solid #a78bfa' : '2px solid transparent',
                                        }}
                                    >
                                        <Icon name={tab.icon} size={14} />
                                        {tab.label}
                                    </button>
                                ))}
                            </div>

                            {/* Tab content */}
                            <div className="p-5">
                                {activeTab === 'decision' && (
                                    <div className="space-y-4">
                                        <div className="text-xs text-white whitespace-pre-wrap leading-relaxed" style={{ maxHeight: 300, overflow: 'auto' }}>
                                            {result.explanation || 'No explanation available.'}
                                        </div>

                                        {/* Warnings */}
                                        {result.warnings.length > 0 && (
                                            <div className="space-y-1">
                                                {result.warnings.map((w, i) => (
                                                    <div key={i} className="flex items-start gap-1.5 text-[10px] px-2.5 py-2 rounded-lg" style={{ background: 'rgba(245,158,11,.06)', color: '#fbbf24' }}>
                                                        <Icon name="warning" size={12} className="mt-0.5" />
                                                        {w}
                                                    </div>
                                                ))}
                                            </div>
                                        )}

                                        {/* Rule summary chips */}
                                        {totalRules > 0 && (
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <span className="px-2 py-0.5 rounded-md text-[10px] font-bold" style={{ background: 'rgba(34,197,94,.08)', color: '#4ade80' }}>
                                                    ✓ {passCount} passed
                                                </span>
                                                {failCount > 0 && (
                                                    <span className="px-2 py-0.5 rounded-md text-[10px] font-bold" style={{ background: 'rgba(239,68,68,.08)', color: '#f87171' }}>
                                                        ✗ {failCount} failed
                                                    </span>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                )}

                                {activeTab === 'ai' && (
                                    <div className="space-y-4">
                                        {result.ai_analysis ? (
                                            <>
                                                <div className="flex items-center gap-2 mb-2">
                                                    <Icon name="auto_awesome" size={14} color="#a78bfa" />
                                                    <span className="text-xs font-bold text-white">AI Analysis</span>
                                                </div>
                                                <div className="text-xs text-[var(--text-secondary)] whitespace-pre-wrap leading-relaxed" style={{ maxHeight: 350, overflow: 'auto' }}>
                                                    {result.ai_analysis}
                                                </div>
                                            </>
                                        ) : result.decision === 'error' ? (
                                            <div className="p-4 rounded-xl" style={{ background: 'rgba(239,68,68,.06)', border: '1px solid rgba(239,68,68,.12)' }}>
                                                <div className="flex items-start gap-3">
                                                    <Icon name="error" size={16} color="#f87171" />
                                                    <div>
                                                        <p className="text-xs font-semibold" style={{ color: '#f87171' }}>AI Analysis Unavailable</p>
                                                        <p className="text-[11px] mt-1" style={{ color: 'var(--text-muted)' }}>The AI service could not process this query. Check that the backend is running and try again.</p>
                                                    </div>
                                                </div>
                                            </div>
                                        ) : (
                                            <p className="text-xs text-center py-8" style={{ color: 'var(--text-muted)' }}>No AI analysis returned for this query.</p>
                                        )}

                                        {/* AI metadata */}
                                        {(result.ai_provider || aiProvider) && (
                                            <div className="pt-3 border-t flex items-center gap-4 text-[10px]" style={{ borderColor: 'var(--border-default)', color: 'var(--text-muted)' }}>
                                                <span className="flex items-center gap-1">
                                                    <Icon name="smart_toy" size={12} />
                                                    {result.ai_provider || aiProvider?.provider || 'AI'} / {result.ai_model || aiProvider?.model || 'model'}
                                                </span>
                                                {result.ai_duration_ms && (
                                                    <span className="flex items-center gap-1">
                                                        <Icon name="timer" size={12} />
                                                        {(result.ai_duration_ms / 1000).toFixed(1)}s
                                                    </span>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                )}

                                {activeTab === 'rules' && (
                                    <div className="space-y-3">
                                        {/* Collapsible raw JSON */}
                                        <button
                                            onClick={() => setShowRawJson(!showRawJson)}
                                            className="flex items-center gap-1.5 text-[10px] font-semibold transition-all"
                                            style={{ color: '#60a5fa' }}
                                        >
                                            <Icon name={showRawJson ? 'expand_less' : 'expand_more'} size={12} />
                                            {showRawJson ? 'Hide' : 'View'} Evaluated Rules JSON
                                        </button>

                                        {showRawJson && (
                                            <pre className="text-[9px] p-3 rounded-xl overflow-auto max-h-[200px]" style={{
                                                background: 'rgba(0,0,0,.3)',
                                                color: '#8b97a7',
                                                fontFamily: 'monospace',
                                                border: '1px solid var(--border-default)',
                                            }}>
                                                {JSON.stringify(result.rule_evaluations, null, 2)}
                                            </pre>
                                        )}

                                        {/* Rule cards with highlighting */}
                                        <div className="space-y-1.5 max-h-[400px] overflow-y-auto pr-1">
                                            {result.rule_evaluations.length === 0 ? (
                                                <p className="text-xs text-center py-6" style={{ color: 'var(--text-muted)' }}>No rules evaluated.</p>
                                            ) : result.rule_evaluations.map((e, i) => {
                                                const es = evalStyle(e.result);
                                                const isTriggered = e.result === 'fail';
                                                return (
                                                    <div key={i} className="flex items-start gap-2 px-3 py-2.5 rounded-lg transition-all" style={{
                                                        background: es.bg,
                                                        border: isTriggered ? '1px solid rgba(239,68,68,.15)' : '1px solid transparent',
                                                    }}>
                                                        <Icon name={es.icon} size={14} className="mt-0.5" />
                                                        <div className="flex-1 min-w-0">
                                                            <div className="flex items-center gap-2">
                                                                <p className="text-[10px] font-semibold text-white">{e.field_name}</p>
                                                                {isTriggered && (
                                                                    <span className="px-1.5 py-0.5 rounded text-[8px] font-bold" style={{ background: 'rgba(239,68,68,.1)', color: '#f87171' }}>
                                                                        TRIGGERED
                                                                    </span>
                                                                )}
                                                                <span className="text-[8px] px-1 py-0.5 rounded" style={{ background: 'rgba(255,255,255,.04)', color: 'var(--text-muted)' }}>
                                                                    {e.field_type}
                                                                </span>
                                                            </div>
                                                            <p className="text-[9px] mt-0.5" style={{ color: 'var(--text-muted)' }}>Rule: {e.rule}</p>
                                                            {e.input_value != null && (
                                                                <p className="text-[9px]" style={{ color: 'var(--text-secondary)' }}>Input: {String(e.input_value)}</p>
                                                            )}
                                                            <p className="text-[9px] mt-0.5" style={{ color: es.color }}>{e.detail}</p>
                                                        </div>
                                                        <span className="text-[8px] font-bold uppercase px-1.5 py-0.5 rounded flex-shrink-0" style={{ color: es.color, background: `${es.color}10` }}>
                                                            {e.result}
                                                        </span>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}

                                {activeTab === 'trace' && (
                                    <div className="space-y-1 max-h-[450px] overflow-y-auto pr-1">
                                        {result.reasoning_trace.length === 0 ? (
                                            <p className="text-xs text-center py-6" style={{ color: 'var(--text-muted)' }}>No trace available.</p>
                                        ) : result.reasoning_trace.map((s, i) => (
                                            <div key={i} className="flex items-start gap-3 px-3 py-2 rounded-lg" style={{ background: 'var(--bg-elevated)' }}>
                                                <div className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold flex-shrink-0" style={{ background: 'rgba(139,92,246,.1)', color: '#a78bfa' }}>
                                                    {s.step}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-[10px] font-semibold text-white">{s.action}</p>
                                                    <p className="text-[9px] mt-0.5" style={{ color: 'var(--text-secondary)' }}>{s.detail}</p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
