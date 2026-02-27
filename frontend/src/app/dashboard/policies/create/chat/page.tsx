'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { chatAPI } from '@/lib/api';
import Icon from '@/components/ui/Icon';
import FileUpload from '@/components/ui/FileUpload';
import PolicyDocumentPreview from '@/components/ui/PolicyDocumentPreview';
import type { ChatMessageResponse } from '@/types/policy';

/* ── Types ──────────────────────────────────────────────────────── */
interface Message {
    role: 'user' | 'assistant';
    content: string;
    timestamp: string;
}

/* ── Toast ──────────────────────────────────────────────────────── */
function Toast({ message, type, onClose }: { message: string; type: 'success' | 'error'; onClose: () => void }) {
    useEffect(() => { const t = setTimeout(onClose, 4000); return () => clearTimeout(t); }, [onClose]);
    return (
        <div className="fixed top-4 right-4 z-50 animate-slide-down"
            style={{ background: type === 'error' ? 'rgba(244,63,94,0.12)' : 'rgba(52,211,153,0.12)', border: `1px solid ${type === 'error' ? 'rgba(244,63,94,0.3)' : 'rgba(52,211,153,0.3)'}`, color: type === 'error' ? '#fb7185' : '#34d399', padding: '12px 20px', borderRadius: 12, backdropFilter: 'blur(12px)', maxWidth: 400 }}>
            <div className="flex items-center gap-2 text-sm font-medium">
                <Icon name={type === 'error' ? 'error' : 'check_circle'} size={16} />
                {message}
            </div>
        </div>
    );
}

/* ════════════════════════════════════════════════════════════════ */
/*  MAIN PAGE                                                     */
/* ════════════════════════════════════════════════════════════════ */

export default function ChatPolicyCreatorPage() {
    const router = useRouter();
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);

    // ── State ──
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState('');
    const [sending, setSending] = useState(false);
    const [sessionId, setSessionId] = useState<string | null>(null);
    const [phase, setPhase] = useState<string>('collecting');
    const [collectedParams, setCollectedParams] = useState<Record<string, unknown>>({});
    const [missingParams, setMissingParams] = useState<string[]>([]);
    const [isComplete, setIsComplete] = useState(false);
    const [suggestedActions, setSuggestedActions] = useState<string[]>([]);
    const [aiMeta, setAiMeta] = useState<{ provider?: string; model?: string; duration_ms?: number } | null>(null);
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

    // Generate dialog
    const [showGenerate, setShowGenerate] = useState(false);
    const [policyName, setPolicyName] = useState('');
    const [policyDesc, setPolicyDesc] = useState('');
    const [tone, setTone] = useState('formal');
    const [generating, setGenerating] = useState(false);
    const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
    const [generatedSections, setGeneratedSections] = useState<Array<{ title: string; description?: string; order: number; subsections?: Array<{ title: string; fields: Array<{ field_name: string; field_type: string; notes?: string }> }>; narrative_content?: string }>>([]);

    // ── Mobile tab state ──
    const [mobileTab, setMobileTab] = useState<'editor' | 'preview'>('editor');

    // ── Auto-scroll ──
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    // ── Welcome message ──
    useEffect(() => {
        setMessages([{
            role: 'assistant',
            content: "Welcome to BaikalSphere AI Policy Creator! 🏦\n\nI'll help you define your policy step-by-step. Tell me what kind of policy you'd like to create — for example:\n\n• \"Phone loan policy for retail customers\"\n• \"Vehicle insurance underwriting policy\"\n• \"Internal compliance policy for anti-money laundering\"\n\nWhat would you like to build?",
            timestamp: new Date().toISOString(),
        }]);
    }, []);

    // ── Send message ──
    const handleSend = useCallback(async () => {
        if (!input.trim() || sending) return;
        const userMsg = input.trim();
        setInput('');
        setSending(true);

        // Include file metadata if attached
        let promptPayload = userMsg;
        if (attachedFiles.length > 0) {
            const fileMeta = attachedFiles.map(f => `[Attached Document: ${f.name} (${Math.round(f.size / 1024)}KB)]`).join('\n');
            promptPayload = `Context from enclosed files:\n${fileMeta}\n\nUser Message:\n${userMsg}`;
        }

        // Add user message immediately
        setMessages(prev => [...prev, {
            role: 'user',
            content: attachedFiles.length > 0 ? `📎 ${attachedFiles.length} file(s) attached\n${userMsg}` : userMsg,
            timestamp: new Date().toISOString(),
        }]);

        // Clear files after sending
        setAttachedFiles([]);

        try {
            const res = await chatAPI.sendMessage({
                session_id: sessionId || undefined,
                message: promptPayload,
            });
            const data: ChatMessageResponse = res.data;

            setSessionId(data.session_id);
            setPhase(data.phase);
            setCollectedParams(data.collected_params);
            setMissingParams(data.missing_params);
            setIsComplete(data.is_complete);
            setSuggestedActions(data.suggested_actions);
            setAiMeta({
                provider: data.ai_provider,
                model: data.ai_model,
                duration_ms: data.ai_duration_ms,
            });

            // Add assistant message
            setMessages(prev => [...prev, {
                role: 'assistant',
                content: data.ai_response,
                timestamp: new Date().toISOString(),
            }]);
        } catch (err: unknown) {
            const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
            setToast({ message: detail || 'AI service error', type: 'error' });
        } finally {
            setSending(false);
            inputRef.current?.focus();
        }
    }, [input, sending, sessionId, attachedFiles]);

    // ── Generate structure ──
    const handleGenerate = useCallback(async () => {
        if (!sessionId || !policyName.trim()) return;
        setGenerating(true);
        try {
            const res = await chatAPI.generate({
                session_id: sessionId,
                policy_name: policyName.trim(),
                policy_description: policyDesc.trim() || undefined,
                tone,
            });
            setToast({ message: 'Policy created! Redirecting...', type: 'success' });
            setTimeout(() => router.push(`/dashboard/policies/${res.data.policy_id}`), 1500);
        } catch (err: unknown) {
            const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
            setToast({ message: detail || 'Generation failed', type: 'error' });
            setGenerating(false);
        }
    }, [sessionId, policyName, policyDesc, tone, router]);

    // ── Key handler ──
    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    const paramCount = Object.keys(collectedParams).length;

    // ── Reset conversation ──
    const handleReset = () => {
        setMessages([{
            role: 'assistant',
            content: "Welcome to BaikalSphere AI Policy Creator! 🏦\n\nI'll help you define your policy step-by-step. Tell me what kind of policy you'd like to create — for example:\n\n• \"Phone loan policy for retail customers\"\n• \"Vehicle insurance underwriting policy\"\n• \"Internal compliance policy for anti-money laundering\"\n\nWhat would you like to build?",
            timestamp: new Date().toISOString(),
        }]);
        setSessionId(null);
        setPhase('collecting');
        setCollectedParams({});
        setMissingParams([]);
        setIsComplete(false);
        setSuggestedActions([]);
        setAiMeta(null);
        setAttachedFiles([]);
        setInput('');
    };

    // ── File Drop Handler ──
    const [dragOver, setDragOver] = useState(false);
    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setDragOver(false);
        if (e.dataTransfer.files?.length) {
            const newFiles = Array.from(e.dataTransfer.files).filter(f =>
                f.name.endsWith('.pdf') || f.name.endsWith('.docx') || f.name.endsWith('.xlsx'));
            if (newFiles.length) {
                setAttachedFiles(prev => [...prev, ...newFiles].slice(0, 5));
                setToast({ message: `Attached ${newFiles.length} file(s)`, type: 'success' });
            }
        }
    };

    return (
        <div className="h-[calc(100vh-64px)] flex split-layout" style={{ background: 'var(--bg-app)' }}>
            {toast && <Toast {...toast} onClose={() => setToast(null)} />}

            {/* ── Mobile Tab Bar ── */}
            <div className="mobile-tab-bar w-full border-b" style={{ borderColor: 'var(--border-default)', background: 'var(--bg-secondary)' }}>
                {(['editor', 'preview'] as const).map(t => (
                    <button
                        key={t}
                        onClick={() => setMobileTab(t)}
                        className="flex-1 py-3 text-xs font-semibold transition-all"
                        style={{
                            color: mobileTab === t ? '#a78bfa' : 'var(--text-muted)',
                            borderBottom: mobileTab === t ? '2px solid #a78bfa' : '2px solid transparent',
                            background: 'transparent',
                        }}
                    >
                        <Icon name={t === 'editor' ? 'forum' : 'preview'} size={14} />
                        <span className="ml-1.5">{t === 'editor' ? 'Chat' : 'Preview'}</span>
                    </button>
                ))}
            </div>

            {/* ═══ Left: Chat Panel ═══ */}
            <div
                className={`flex-1 flex flex-col min-w-0 relative ${mobileTab !== 'editor' ? 'hidden md:flex' : ''}`}
                onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
            >
                {/* Drag Overlay */}
                {dragOver && (
                    <div className="absolute inset-0 z-40 flex items-center justify-center rounded-r-3xl"
                        style={{ background: 'rgba(139,92,246,0.1)', backdropFilter: 'blur(2px)', border: '2px dashed rgba(139,92,246,0.5)' }}>
                        <div className="bg-white/10 px-6 py-4 rounded-2xl flex flex-col items-center gap-2">
                            <Icon name="cloud_upload" size={32} color="#a78bfa" />
                            <p className="font-bold text-white shadow-sm">Drop document to attach</p>
                        </div>
                    </div>
                )}

                {/* Header */}
                <div className="flex items-center gap-3 px-6 py-4 border-b" style={{ borderColor: 'var(--border-subtle)' }}>
                    <button onClick={() => router.push('/dashboard/policies/create')} className="btn-icon">
                        <Icon name="arrow_back" size={18} color="var(--text-muted)" />
                    </button>
                    <div className="flex items-center gap-2">
                        <div style={{ width: 32, height: 32, borderRadius: 10, background: 'var(--gradient-violet)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Icon name="smart_toy" size={18} color="white" />
                        </div>
                        <div>
                            <h1 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>AI Policy Creator</h1>
                            <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                                {phase === 'collecting' ? 'Collecting parameters...' :
                                    phase === 'confirming' ? '✅ Review & confirm' :
                                        phase === 'complete' ? '🎉 Policy generated' : 'Processing...'}
                            </p>
                        </div>
                    </div>
                    <div className="ml-auto flex items-center gap-2">
                        {aiMeta?.provider && (
                            <div className="flex items-center gap-2 text-[10px]" style={{ color: 'var(--text-muted)' }}>
                                <span className="px-2 py-0.5 rounded-md" style={{ background: 'rgba(139,92,246,0.1)', color: '#a78bfa' }}>
                                    {aiMeta.provider}/{aiMeta.model}
                                </span>
                                {aiMeta.duration_ms && (
                                    <span>{Math.round(aiMeta.duration_ms)}ms</span>
                                )}
                            </div>
                        )}
                        <button onClick={handleReset} className="btn-action" style={{ height: 32, padding: '0 12px', fontSize: 11 }} title="Reset Conversation">
                            <Icon name="refresh" size={14} color="#fb7185" />
                            <span className="btn-action-label">Reset</span>
                        </button>
                    </div>
                </div>

                {/* Messages */}
                <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
                    {messages.map((msg, i) => (
                        <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} gap-2`}>
                            {msg.role === 'assistant' && (
                                <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-1" style={{ background: 'rgba(139,92,246,.1)' }}>
                                    <Icon name="smart_toy" size={14} color="#a78bfa" />
                                </div>
                            )}
                            <div className="max-w-[80%] animate-slide-up" style={{
                                background: msg.role === 'user'
                                    ? 'var(--gradient-blue)'
                                    : 'var(--bg-card)',
                                border: msg.role === 'user' ? 'none' : '1px solid var(--border-subtle)',
                                borderRadius: msg.role === 'user' ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
                                padding: '12px 16px',
                            }}>
                                <p className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: msg.role === 'user' ? 'white' : 'var(--text-primary)' }}>
                                    {msg.content}
                                </p>
                                <span className="text-[9px] mt-1 block" style={{ color: msg.role === 'user' ? 'rgba(255,255,255,0.5)' : 'var(--text-muted)' }}>
                                    {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </span>
                            </div>
                            {msg.role === 'user' && (
                                <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-1" style={{ background: 'rgba(59,130,246,.1)' }}>
                                    <Icon name="person" size={14} color="#60a5fa" />
                                </div>
                            )}
                        </div>
                    ))}

                    {sending && (
                        <div className="flex justify-start gap-2">
                            <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-1" style={{ background: 'rgba(139,92,246,.1)' }}>
                                <Icon name="smart_toy" size={14} color="#a78bfa" />
                            </div>
                            <div className="px-4 py-3 rounded-2xl" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)' }}>
                                <div className="flex items-center gap-1.5">
                                    <span className="w-2 h-2 rounded-full animate-bounce" style={{ background: '#a78bfa', animationDelay: '0ms' }} />
                                    <span className="w-2 h-2 rounded-full animate-bounce" style={{ background: '#a78bfa', animationDelay: '150ms' }} />
                                    <span className="w-2 h-2 rounded-full animate-bounce" style={{ background: '#a78bfa', animationDelay: '300ms' }} />
                                </div>
                            </div>
                        </div>
                    )}
                    <div ref={messagesEndRef} />
                </div>

                {/* Input */}
                <div className="px-6 py-4 border-t relative z-50" style={{ borderColor: 'var(--border-subtle)', background: 'var(--bg-app)' }}>
                    {/* Generate bar — shown when all params are confirmed */}
                    {isComplete && (
                        <div className="mb-3 flex items-center gap-3 px-4 py-3 rounded-xl animate-slide-up" style={{ background: 'rgba(52,211,153,0.06)', border: '1px solid rgba(52,211,153,0.15)' }}>
                            <Icon name="check_circle" size={18} color="#34d399" />
                            <span className="text-xs font-medium flex-1" style={{ color: '#34d399' }}>All parameters collected — ready to generate!</span>
                            <button onClick={() => setShowGenerate(true)}
                                className="btn-primary h-9 px-5 text-xs font-semibold flex items-center gap-2 rounded-xl" style={{ background: 'var(--gradient-emerald)' }}>
                                <Icon name="auto_awesome" size={16} />
                                Confirm & Generate
                            </button>
                        </div>
                    )}
                    {/* Suggested actions */}
                    {suggestedActions.length > 0 && phase === 'confirming' && (
                        <div className="flex gap-2 mb-3 flex-wrap">
                            {suggestedActions.map((action, i) => (
                                <button key={i}
                                    onClick={() => {
                                        if (action === 'confirm') {
                                            setShowGenerate(true);
                                        } else {
                                            setInput(action === 'modify' ? 'I want to modify some parameters' : 'I want to add more parameters');
                                        }
                                    }}
                                    className="btn-action text-xs"
                                    style={{
                                        height: 32,
                                        background: action === 'confirm' ? 'rgba(52,211,153,0.1)' : 'rgba(139,92,246,0.1)',
                                        color: action === 'confirm' ? '#34d399' : '#a78bfa',
                                        border: `1px solid ${action === 'confirm' ? 'rgba(52,211,153,0.2)' : 'rgba(139,92,246,0.2)'}`,
                                    }}
                                >
                                    {action === 'confirm' ? '✅ Confirm & Generate' : action === 'modify' ? '✏️ Modify' : `➕ ${action}`}
                                </button>
                            ))}
                        </div>
                    )}

                    <div className="flex gap-3 items-end">
                        <FileUpload files={attachedFiles} onChange={setAttachedFiles} compact />
                        <textarea
                            ref={inputRef}
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder={phase === 'confirming' ? 'Modify parameters or click Confirm...' : 'Describe your policy requirements...'}
                            className="flex-1 rounded-xl px-4 py-3 text-sm theme-input resize-none relative z-50 bg-transparent"
                            rows={1}
                            style={{ maxHeight: 120, minHeight: 44 }}
                        />
                        <button
                            onClick={handleSend}
                            disabled={!input.trim() || sending}
                            className="btn-primary px-4 py-3 rounded-xl flex items-center gap-1 text-sm relative z-50"
                        >
                            <Icon name="send" size={16} />
                        </button>
                    </div>
                </div>
            </div>

            {/* ═══ Right: Live Document Preview ═══ */}
            <div className={`flex-1 min-w-0 ${mobileTab !== 'preview' ? 'hidden md:block' : ''}`}>
                <PolicyDocumentPreview
                    header={policyName ? { title: policyName, organization: policyDesc || undefined } : (collectedParams?.policy_name ? { title: String(collectedParams.policy_name) } : undefined)}
                    sections={generatedSections}
                    collectedParams={collectedParams}
                    generating={generating}
                />
            </div>

            {/* ═══ Generate Modal ═══ */}
            {showGenerate && (
                <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}>
                    <div className="glass-card w-full max-w-md mx-4 p-6 animate-scale-in">
                        <h2 className="text-lg font-bold mb-4" style={{ color: 'var(--text-primary)' }}>Generate Policy Structure</h2>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                                    Policy Name <span style={{ color: 'var(--accent-rose)' }}>*</span>
                                </label>
                                <input
                                    type="text" value={policyName} onChange={(e) => setPolicyName(e.target.value)}
                                    className="w-full rounded-xl px-4 py-3 text-sm theme-input" autoFocus
                                    placeholder="e.g. Phone Loan Underwriting Policy 2026"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                                    Description
                                </label>
                                <textarea
                                    value={policyDesc} onChange={(e) => setPolicyDesc(e.target.value)}
                                    className="w-full rounded-xl px-4 py-3 text-sm theme-input resize-none" rows={2}
                                    placeholder="Brief description..."
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                                    Document Tone
                                </label>
                                <select value={tone} onChange={(e) => setTone(e.target.value)}
                                    className="w-full rounded-xl px-4 py-3 text-sm theme-input">
                                    <option value="formal">Formal</option>
                                    <option value="regulatory">Regulatory</option>
                                    <option value="internal">Internal Memo</option>
                                    <option value="customer_facing">Customer Facing</option>
                                </select>
                            </div>
                        </div>
                        <div className="flex gap-3 mt-6">
                            <button onClick={() => setShowGenerate(false)}
                                className="btn-ghost flex-1 py-3 text-sm" disabled={generating}>Cancel</button>
                            <button onClick={handleGenerate} disabled={!policyName.trim() || generating}
                                className="btn-primary flex-1 py-3 text-sm flex items-center justify-center gap-2">
                                {generating ? (
                                    <><Icon name="progress_activity" size={16} className="animate-spin" /> Generating...</>
                                ) : (
                                    <><Icon name="auto_awesome" size={16} /> Generate</>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
