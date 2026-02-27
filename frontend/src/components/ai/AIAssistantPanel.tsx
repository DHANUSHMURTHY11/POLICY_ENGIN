'use client';

import React, { useState, useEffect, useRef } from 'react';
import type { DocumentStructure, AICallMetadata } from '@/types/policy';
import Icon from '@/components/ui/Icon';
import { useAI } from '@/contexts/AIContext';
import { chatAPI, policyAPI } from '@/lib/api';

interface Props {
    policyId: string;
    policyName?: string;
    /* Preview */
    preview: DocumentStructure | null;
    setPreview: (v: DocumentStructure | null) => void;
    onAccept: () => void;
    onReject: () => void;
    onClose: () => void;
    /* Validate */
    onValidate: () => void;
    validating: boolean;
    /* Workflow */
    onSubmitApproval: () => void;
    /* Metadata */
    lastMeta: AICallMetadata | null;
    providerInfo: { provider: string; model: string; strict_mode: boolean } | null;
    /* Reset */
    onReset?: () => void;
}

export default function AIAssistantPanel({
    policyId, policyName = "Policy",
    preview, setPreview,
    onAccept, onReject, onClose,
    onValidate, validating,
    onSubmitApproval,
    lastMeta, providerInfo,
    onReset,
}: Props) {
    const aiCtx = useAI();
    const [tab, setTab] = useState<'chat' | 'validate'>('chat');

    // Chat state
    const [sessionId, setSessionId] = useState<string | null>(null);
    const [messages, setMessages] = useState<{ role: string; content: string }[]>([]);
    const [input, setInput] = useState('');
    const [sending, setSending] = useState(false);
    const [generating, setGenerating] = useState(false);

    // AI Phase state
    const [phase, setPhase] = useState<'idle' | 'intent_detected' | 'collecting_parameters' | 'summarizing' | 'awaiting_confirmation' | 'generating_structure' | 'preview_ready' | 'submitted_for_approval' | 'completed'>('idle');
    const [isComplete, setIsComplete] = useState(false);

    const chatEndRef = useRef<HTMLDivElement>(null);

    // Auto-scroll to bottom of chat
    useEffect(() => {
        if (chatEndRef.current) {
            chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [messages, sending, generating, preview]);

    // Initial greeting if empty
    useEffect(() => {
        if (messages.length === 0 && !sending) {
            setMessages([
                { role: 'assistant', content: 'Hello! I am BaikalSphere, your AI policy architect. What type of policy would you like to create today?' }
            ]);
        }
    }, [messages.length, sending]);

    const handleSend = async () => {
        if (!input.trim() || sending) return;
        const msg = input.trim();
        setInput('');
        setMessages(prev => [...prev, { role: 'user', content: msg }]);
        setSending(true);

        try {
            await aiCtx.trackAICall('chat_message', async () => {
                const res = await chatAPI.sendMessage({
                    session_id: sessionId || undefined,
                    message: msg,
                    policy_id: policyId
                });
                const data = res.data;

                setSessionId(data.session_id);
                setPhase(data.phase as any);
                setIsComplete(data.is_complete);
                setMessages(prev => [...prev, { role: 'assistant', content: data.ai_response }]);

                if (data.ai_provider && data.ai_duration_ms) {
                    aiCtx.addLogEntry({
                        provider: data.ai_provider,
                        model: data.ai_model || 'unknown',
                        duration_ms: data.ai_duration_ms,
                        tokens: 0,
                        operation: 'chat_message',
                        timestamp: new Date().toISOString(),
                        success: true
                    });
                }
            });
        } catch (err: unknown) {
            setMessages(prev => [...prev, { role: 'assistant', content: 'Sorry, I encountered an error. The AI service might be unavailable.' }]);
        } finally {
            setSending(false);
        }
    };

    const handleGenerate = async () => {
        if (!sessionId || generating) return;
        setGenerating(true);
        setPreview(null);
        setPhase('generating_structure');
        const start = Date.now();

        try {
            await aiCtx.trackAICall('generate_structure', async () => {
                const res = await chatAPI.generate({
                    session_id: sessionId,
                    policy_id: policyId,
                    policy_name: policyName,
                    tone: 'formal'
                });
                const data = res.data as any;
                setPreview(data.document_structure);
                setPhase('preview_ready');

                if (data.ai_provider) {
                    aiCtx.addLogEntry({
                        provider: data.ai_provider,
                        model: data.ai_model || 'unknown',
                        duration_ms: Date.now() - start,
                        tokens: 0,
                        operation: 'generate_structure',
                        timestamp: new Date().toISOString(),
                        success: true
                    });
                }
            });
        } catch (err: unknown) {
            const resp = (err as any)?.response;
            const d = resp?.data?.detail;
            setMessages(prev => [...prev, { role: 'assistant', content: `Generation failed: ${typeof d === 'string' ? d : 'Unknown error'}` }]);
            setPhase('awaiting_confirmation'); // allow retry
        } finally {
            setGenerating(false);
        }
    };

    return (
        <aside className="flex flex-col flex-shrink-0 border-l overflow-hidden h-full" style={{ width: 360, background: 'var(--bg-secondary)', borderColor: 'var(--border-default)' }}>
            {/* Header */}
            <div className="panel-header" style={{ display: 'flex', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid var(--border-default)', background: 'var(--bg-elevated)' }}>
                <Icon name="smart_toy" size={16} color="var(--accent-violet)" filled />
                <span className="text-sm font-bold flex-1 ml-2" style={{ color: 'var(--text-primary)' }}>AI Assistant</span>
                {providerInfo && (
                    <span style={{
                        fontSize: 9, fontWeight: 600, fontFamily: 'monospace',
                        padding: '2px 8px', borderRadius: 9999,
                        background: 'rgba(16,185,129,.08)', color: '#34d399', marginRight: 8
                    }}>
                        {providerInfo.provider.toUpperCase()}
                    </span>
                )}
                {/* Reset conversation */}
                <button
                    onClick={() => {
                        setMessages([{ role: 'assistant', content: 'Hello! I am BaikalSphere, your AI policy architect. What type of policy would you like to create today?' }]);
                        setSessionId(null);
                        setPhase('idle');
                        setPreview(null);
                        onReset?.();
                    }}
                    className="btn-icon" style={{ width: 28, height: 28, marginRight: 4 }}
                    title="Reset Conversation"
                >
                    <Icon name="refresh" size={14} color="var(--text-muted)" />
                </button>
                <button onClick={onClose} className="btn-icon" style={{ width: 28, height: 28 }}>
                    <Icon name="close" size={16} color="var(--text-muted)" />
                </button>
            </div>

            {/* Tabs */}
            <div style={{
                display: 'flex', borderBottom: '1px solid var(--border-default)',
                padding: '0 12px',
            }}>
                {(['chat', 'validate'] as const).map(t => (
                    <button
                        key={t}
                        onClick={() => setTab(t)}
                        style={{
                            flex: 1, padding: '10px 0', fontSize: 11, fontWeight: 600,
                            color: tab === t ? '#a78bfa' : 'var(--text-muted)',
                            borderBottom: tab === t ? '2px solid #a78bfa' : '2px solid transparent',
                            background: 'transparent', border: 'none', cursor: 'pointer',
                            transition: 'all 150ms',
                            textTransform: 'capitalize',
                        }}
                    >
                        <Icon name={t === 'chat' ? 'forum' : 'verified'} size={14} />
                        <span className="ml-1">{t === 'chat' ? 'Chat' : 'Validate'}</span>
                    </button>
                ))}
            </div>

            {/* Content */}
            <div className="flex-1 overflow-hidden p-4 flex flex-col">
                {tab === 'chat' ? (
                    <div className="flex flex-col h-full bg-transparent overflow-hidden">

                        {/* Status Bar */}
                        <div className="flex items-center justify-between mb-4 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider shrink-0" style={{ background: 'rgba(255,255,255,.03)', color: 'var(--text-muted)' }}>
                            <span className="flex items-center gap-1.5">
                                <span className={`w-2 h-2 rounded-full ${phase === 'completed' || phase === 'preview_ready' || phase === 'submitted_for_approval' ? 'bg-emerald-400' : phase === 'awaiting_confirmation' ? 'bg-amber-400' : 'bg-blue-400'}`} />
                                Phase: {phase.replace(/_/g, ' ')}
                            </span>
                        </div>

                        {/* Messages Area */}
                        <div className="flex-1 overflow-y-auto pr-2 mb-4 space-y-4">
                            {messages.map((m, i) => (
                                <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'} gap-2`}>
                                    {m.role === 'assistant' && (
                                        <div className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 mt-1" style={{ background: 'rgba(139,92,246,.1)' }}>
                                            <span style={{ fontSize: 12 }}>🤖</span>
                                        </div>
                                    )}
                                    <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-xs shadow-sm`}
                                        style={m.role === 'user'
                                            ? { background: 'var(--gradient-violet)', color: 'white', borderBottomRightRadius: 4 }
                                            : { background: 'var(--bg-card)', color: 'var(--text-secondary)', border: '1px solid var(--border-default)', borderBottomLeftRadius: 4 }
                                        }>
                                        <p className="whitespace-pre-wrap leading-relaxed">{m.content}</p>
                                    </div>
                                    {m.role === 'user' && (
                                        <div className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 mt-1" style={{ background: 'rgba(59,130,246,.1)' }}>
                                            <span style={{ fontSize: 12 }}>👤</span>
                                        </div>
                                    )}
                                </div>
                            ))}

                            {sending && (
                                <div className="flex justify-start gap-2">
                                    <div className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 mt-1" style={{ background: 'rgba(139,92,246,.1)' }}>
                                        <span style={{ fontSize: 12 }}>🤖</span>
                                    </div>
                                    <div className="rounded-2xl px-4 py-2.5 shadow-sm" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-default)', borderBottomLeftRadius: 4 }}>
                                        <div className="flex gap-1.5 p-1">
                                            <div className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                                            <div className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                                            <div className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                                        </div>
                                    </div>
                                </div>
                            )}

                            {preview && (
                                <div className="animate-slide-up mt-4">
                                    <div className="flex items-center gap-2 mb-3">
                                        <Icon name="preview" size={14} color="var(--accent-emerald)" />
                                        <span className="text-xs font-bold text-white">Generated Preview</span>
                                    </div>
                                    <div className="rounded-xl p-3 mb-3 space-y-2" style={{ background: 'rgba(16,185,129,.04)', border: '1px solid rgba(16,185,129,.1)' }}>
                                        <div className="flex items-center gap-2">
                                            <Icon name="badge" size={12} color="#34d399" />
                                            <span className="text-[11px] font-semibold text-white">{preview.header.title || '(No Title)'}</span>
                                        </div>
                                        {preview.sections.map(sec => (
                                            <div key={sec.id} className="pl-2 mt-2">
                                                <div className="flex items-center gap-1.5">
                                                    <span className="w-4 h-4 rounded flex items-center justify-center text-[9px] font-bold" style={{ background: 'rgba(59,130,246,.12)', color: '#60a5fa' }}>{sec.order}</span>
                                                    <span className="text-[11px] font-medium text-white">{sec.title}</span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                    <div className="flex gap-2">
                                        <button onClick={() => { onReject(); setPhase('collecting_parameters'); }} className="btn-danger flex-1 py-2 text-xs flex items-center justify-center gap-1.5">
                                            <Icon name="close" size={14} />Reject
                                        </button>
                                        <button onClick={() => { onAccept(); setPhase('completed'); setMessages([]); setSessionId(null); }} className="btn-success flex-1 py-2 text-xs flex items-center justify-center gap-1.5">
                                            <Icon name="check" size={14} />Accept
                                        </button>
                                    </div>
                                    {phase !== 'submitted_for_approval' && (
                                        <button
                                            onClick={() => {
                                                onSubmitApproval();
                                                setPhase('submitted_for_approval');
                                            }}
                                            className="btn-primary w-full mt-3 py-2 text-xs flex items-center justify-center gap-1.5"
                                            style={{ background: 'var(--gradient-emerald)' }}
                                            disabled={!preview || generating}
                                        >
                                            <Icon name="send" size={14} />Submit for Approval
                                        </button>
                                    )}
                                </div>
                            )}

                            <div ref={chatEndRef} />
                        </div>

                        {/* Input Area */}
                        <div className="shrink-0 pt-3 border-t bg-transparent" style={{ borderColor: 'var(--border-default)' }}>
                            {phase === 'awaiting_confirmation' ? (
                                <div className="space-y-3">
                                    <p className="text-xs text-center text-emerald-400 font-semibold mb-2">Ready to generate structure!</p>
                                    <div className="flex gap-2">
                                        <button onClick={() => setPhase('collecting_parameters')} className="btn-ghost flex-1 py-2 text-xs">
                                            Cancel
                                        </button>
                                        <button onClick={handleGenerate} disabled={generating} className="btn-primary flex-1 py-2 text-xs flex items-center justify-center gap-2" style={{ background: 'var(--gradient-emerald)' }}>
                                            {generating ? <Icon name="progress_activity" size={14} className="animate-spin" /> : <Icon name="auto_awesome" size={14} filled />}
                                            {generating ? 'Generating...' : 'Confirm'}
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <div className="flex gap-2 items-end">
                                    <textarea
                                        value={input}
                                        onChange={e => setInput(e.target.value)}
                                        onKeyDown={e => {
                                            if (e.key === 'Enter' && !e.shiftKey) {
                                                e.preventDefault();
                                                handleSend();
                                            }
                                        }}
                                        disabled={sending || generating || ['preview_ready', 'submitted_for_approval', 'completed'].includes(phase)}
                                        className="w-full rounded-xl px-3 py-2.5 text-xs theme-input resize-none"
                                        rows={2}
                                        placeholder={['preview_ready', 'submitted_for_approval', 'completed'].includes(phase) ? 'Generation complete' : "Reply to BaikalSphere..."}
                                    />
                                    <button
                                        onClick={handleSend}
                                        disabled={!input.trim() || sending || generating || ['preview_ready', 'submitted_for_approval', 'completed'].includes(phase)}
                                        className="w-10 h-10 rounded-xl flex shrink-0 items-center justify-center transition-all disabled:opacity-50"
                                        style={{ background: 'var(--gradient-violet)', color: 'white' }}
                                    >
                                        <Icon name="arrow_upward" size={16} />
                                    </button>
                                </div>
                            )}
                        </div>

                    </div>
                ) : (
                    /* ─── Validate Tab ─── */
                    <>
                        <div className="rounded-xl p-4 mb-4" style={{ background: 'rgba(16,185,129,.04)', border: '1px solid rgba(16,185,129,.08)' }}>
                            <div className="flex items-center gap-2 mb-2">
                                <Icon name="verified" size={16} color="#34d399" filled />
                                <span style={{ fontSize: 12, fontWeight: 700, color: '#f1f5f9' }}>AI Structure Validation</span>
                            </div>
                            <p style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.6 }}>
                                Run AI validation against your current structure to check for duplicate fields, missing sections, naming inconsistencies, and structural issues.
                            </p>
                        </div>

                        <button
                            onClick={onValidate}
                            disabled={validating}
                            className="btn-primary w-full py-2.5 text-xs flex items-center justify-center gap-2 mb-4"
                            style={{ background: 'var(--gradient-emerald)' }}
                        >
                            {validating ? (
                                <><Icon name="progress_activity" size={14} className="animate-spin" />Validating…</>
                            ) : (
                                <><Icon name="shield" size={14} />Validate Current Structure</>
                            )}
                        </button>

                        <div className="rounded-xl p-3" style={{ background: 'rgba(245,158,11,.04)', border: '1px solid rgba(245,158,11,.08)' }}>
                            <p className="text-[10px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                                <Icon name="info" size={12} color="#fbbf24" />
                                <strong style={{ color: '#fbbf24' }}>Note:</strong> Save is always blocked by AI validation. Use this to pre-check before saving.
                            </p>
                        </div>
                    </>
                )}

                {/* AI Metadata Card — always visible when there is metadata */}
                {lastMeta && (
                    <div className="rounded-xl overflow-hidden animate-slide-up mt-auto" style={{ border: '1px solid var(--border-default)' }}>
                        <div style={{
                            padding: '8px 12px',
                            display: 'flex', alignItems: 'center', gap: 6,
                            background: 'rgba(139,92,246,.04)',
                            borderBottom: '1px solid var(--border-default)',
                        }}>
                            <Icon name="analytics" size={12} color="#a78bfa" />
                            <span style={{ fontSize: 10, fontWeight: 700, color: '#c4b5fd' }}>Last AI Call</span>
                            <span style={{ flex: 1 }} />
                            <span style={{
                                fontSize: 9, fontWeight: 600, fontFamily: 'monospace',
                                padding: '1px 6px', borderRadius: 4,
                                background: lastMeta.success ? 'rgba(16,185,129,.1)' : 'rgba(239,68,68,.1)',
                                color: lastMeta.success ? '#34d399' : '#f87171',
                            }}>
                                {lastMeta.success ? 'SUCCESS' : 'FAILED'}
                            </span>
                        </div>
                        <div style={{ padding: '10px 12px' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                                <MetaItem icon="smart_toy" label="Provider" value={lastMeta.provider.toUpperCase()} color="#60a5fa" />
                                <MetaItem icon="memory" label="Model" value={lastMeta.model} color="#a78bfa" />
                                <MetaItem icon="timer" label="Duration" value={`${lastMeta.duration_ms}ms`} color="#fbbf24" />
                                <MetaItem icon="token" label="Tokens" value={String(lastMeta.tokens)} color="#34d399" />
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </aside>
    );
}

function MetaItem({ icon, label, value, color }: { icon: string; label: string; value: string; color: string }) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <Icon name={icon} size={11} />
                <span style={{ fontSize: 9, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.05em' }}>{label}</span>
            </div>
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', fontFamily: 'monospace' }}>{value}</span>
        </div>
    );
}
