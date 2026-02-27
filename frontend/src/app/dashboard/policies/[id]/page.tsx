'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { policyAPI, documentAPI, aiAPI, workflowAPI } from '@/lib/api';
import type {
    PolicyDetail,
    Section,
    Subsection,
    PolicyField,
    PolicyHeader,
    DocumentStructure,
    StructureResponse,
    AIValidationIssue,
    AICallMetadata,
} from '@/types/policy';
import { FIELD_TYPES } from '@/types/policy';
import { useAI } from '@/contexts/AIContext';
import AIAssistantPanel from '@/components/ai/AIAssistantPanel';
import AIValidationBanner from '@/components/ai/AIValidationBanner';
import AILoadingOverlay from '@/components/ai/AILoadingOverlay';
import AIExecutionLogDrawer from '@/components/ai/AIExecutionLogDrawer';
import PolicyDocumentPreview from '@/components/ui/PolicyDocumentPreview';
import FileUpload from '@/components/ui/FileUpload';


import FieldModal from './_components/FieldModal';
import Icon from '@/components/ui/Icon';

/* ─── helpers ─────────────────────────────────────────────────── */

function uuid(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = (Math.random() * 16) | 0;
        return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    });
}

function emptySection(order: number): Section {
    return { id: uuid(), title: '', order, description: '', subsections: [], narrative_content: '', ai_generated: false, tone: 'formal', communication_style: 'policy_circular' };
}

function emptySubsection(order: number): Subsection {
    return { id: uuid(), title: '', order, fields: [] };
}

function emptyField(): PolicyField {
    return {
        id: uuid(),
        field_name: '',
        field_type: 'text',
        validation_rules: {},
        conditional_logic: {},
        notes: '',
    };
}

/* ─── toast ───────────────────────────────────────────────────── */

function Toast({
    message,
    type,
    onClose,
}: {
    message: string;
    type: 'success' | 'error';
    onClose: () => void;
}) {
    React.useEffect(() => {
        const t = setTimeout(onClose, 3200);
        return () => clearTimeout(t);
    }, [onClose]);

    const colors = {
        success: { bg: 'rgba(34,197,94,.08)', border: 'rgba(34,197,94,.2)', text: '#4ade80', icon: 'check_circle' },
        error: { bg: 'rgba(239,68,68,.08)', border: 'rgba(239,68,68,.2)', text: '#f87171', icon: 'error' },
    };
    const c = colors[type];

    return (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 px-5 py-3 rounded-2xl shadow-lg animate-fade-in"
            style={{ background: c.bg, border: `1px solid ${c.border}` }}>
            <Icon name={c.icon} size={16} />
            <span className="text-xs font-medium" style={{ color: c.text }}>{message}</span>
        </div>
    );
}

/* ─── field-type visual map ───────────────────────────────────── */

const FT_STYLE: Record<string, { bg: string; color: string; icon: string }> = {
    text: { bg: 'rgba(59,130,246,.08)', color: '#60a5fa', icon: 'text_fields' },
    number: { bg: 'rgba(139,92,246,.08)', color: '#a78bfa', icon: 'tag' },
    dropdown: { bg: 'rgba(6,182,212,.08)', color: '#22d3ee', icon: 'arrow_drop_down_circle' },
    multi_select: { bg: 'rgba(16,185,129,.08)', color: '#34d399', icon: 'checklist' },
    date: { bg: 'rgba(245,158,11,.08)', color: '#fbbf24', icon: 'calendar_today' },
    boolean: { bg: 'rgba(244,63,94,.08)', color: '#fb7185', icon: 'toggle_on' },
    textarea: { bg: 'rgba(99,102,241,.08)', color: '#818cf8', icon: 'notes' },
    email: { bg: 'rgba(59,130,246,.08)', color: '#60a5fa', icon: 'mail' },
    phone: { bg: 'rgba(16,185,129,.08)', color: '#34d399', icon: 'phone' },
    currency: { bg: 'rgba(245,158,11,.08)', color: '#fbbf24', icon: 'payments' },
    percentage: { bg: 'rgba(139,92,246,.08)', color: '#a78bfa', icon: 'percent' },
};

function fts(t: string) {
    return FT_STYLE[t] ?? FT_STYLE.text;
}

/* ═══════════════════════════════════════════════════════════════ */
/*  MAIN PAGE                                                    */
/* ═══════════════════════════════════════════════════════════════ */

export default function PolicyBuilderPage() {
    const params = useParams();
    const router = useRouter();
    const searchParams = useSearchParams();
    const isViewMode = searchParams.get('view') === 'true';
    const policyId = params.id as string;

    const [policy, setPolicy] = useState<PolicyDetail | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    const [header, setHeader] = useState<PolicyHeader>({ title: '', organization: '', effective_date: null, expiry_date: null });
    const [sections, setSections] = useState<Section[]>([]);
    const [selectedSectionId, setSelectedSectionId] = useState<string | null>(null);

    const [fieldModal, setFieldModal] = useState<{ sectionId: string; subsectionId: string; field: PolicyField; isEdit: boolean } | null>(null);

    const [aiPreview, setAiPreview] = useState<DocumentStructure | null>(null);
    const [aiPanelOpen, setAiPanelOpen] = useState(true);
    const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

    /* ── document composer state ────────────────────────────── */
    const [docDropdownOpen, setDocDropdownOpen] = useState(false);
    const [docGenerating, setDocGenerating] = useState<string | null>(null);
    const [enhanceModalOpen, setEnhanceModalOpen] = useState(false);
    const [enhanceInstruction, setEnhanceInstruction] = useState('');
    const [enhancing, setEnhancing] = useState(false);

    /* ── AI governance ─────────────────────────────────────────── */
    const [aiProviderInfo, setAiProviderInfo] = useState<{ provider: string; model: string; strict_mode: boolean } | null>(null);
    const [ai503ModalOpen, setAi503ModalOpen] = useState(false);

    /* ── AI-native enhancements ────────────────────────────────── */
    const aiCtx = useAI();
    const [aiValidationIssues, setAiValidationIssues] = useState<AIValidationIssue[]>([]);
    const [aiValidationSuggestions, setAiValidationSuggestions] = useState<string[]>([]);
    const [aiNormalizedNames, setAiNormalizedNames] = useState<Record<string, string>>({});
    const [showValidationBanner, setShowValidationBanner] = useState(false);
    const [aiOverlayVisible, setAiOverlayVisible] = useState(false);
    const [aiOverlayMessage, setAiOverlayMessage] = useState('');
    const [lastAiMeta, setLastAiMeta] = useState<AICallMetadata | null>(null);
    const [aiValidating, setAiValidating] = useState(false);
    const [sectionEnhancingId, setSectionEnhancingId] = useState<string | null>(null);

    /* ── File attachments ───────────────────────────────────────────── */
    const [attachedFiles, setAttachedFiles] = useState<File[]>([]);

    /* ── Mobile tab state (editor vs preview) ──────────────────────── */
    const [mobileTab, setMobileTab] = useState<'editor' | 'preview'>(searchParams.get('view') === 'true' ? 'preview' : 'editor');

    /* ── Narrative rewrite ─────────────────────────────────────────── */
    const TONE_OPTIONS = [
        { value: 'formal', label: 'Formal' },
        { value: 'regulatory', label: 'Regulatory' },
        { value: 'internal', label: 'Internal' },
        { value: 'customer_facing', label: 'Customer-facing' },
    ] as const;
    const REWRITE_ACTIONS = [
        { value: 'expand', label: 'Expand Content', icon: 'unfold_more' },
        { value: 'simplify', label: 'Simplify Language', icon: 'compress' },
        { value: 'regulatory_tone', label: 'Regulatory Tone', icon: 'gavel' },
        { value: 'internal_memo', label: 'Internal Memo', icon: 'mail' },
    ] as const;
    const [rewritingSection, setRewritingSection] = useState(false);
    const [rewriteActionOpen, setRewriteActionOpen] = useState(false);

    const handleRewriteSection = async (sectionId: string, action: string) => {
        const sec = sections.find(s => s.id === sectionId);
        if (!sec) return;
        setRewritingSection(true);
        setRewriteActionOpen(false);
        try {
            const res = await policyAPI.rewriteSection(policyId, {
                section_id: sectionId,
                action,
                current_content: sec.narrative_content || '',
                section_title: sec.title,
                section_description: sec.description,
                tone: sec.tone || 'formal',
            });
            const data = res.data as { narrative_content: string; tone: string; ai_generated: boolean; communication_style: string };
            updateSection(sectionId, {
                narrative_content: data.narrative_content,
                tone: data.tone,
                ai_generated: data.ai_generated,
                communication_style: data.communication_style,
            });
            setToast({ msg: `Section narrative ${action === 'expand' ? 'expanded' : action === 'simplify' ? 'simplified' : 'rewritten'} by AI`, type: 'success' });
        } catch (err: unknown) {
            const status = (err as { response?: { status?: number } })?.response?.status;
            if (status === 503) setAi503ModalOpen(true);
            else setToast({ msg: 'AI rewrite failed — no fallback allowed', type: 'error' });
        } finally {
            setRewritingSection(false);
        }
    };


    useEffect(() => {
        aiAPI.getProviderInfo()
            .then(res => setAiProviderInfo(res.data))
            .catch(() => setAiProviderInfo(null));
    }, []);

    /* ── load ──────────────────────────────────────────────────── */

    const loadPolicy = useCallback(async () => {
        setLoading(true);
        try {
            const res = await policyAPI.get(policyId);
            const data: PolicyDetail = res.data;
            setPolicy(data);
            if (data.document_structure) {
                setHeader(data.document_structure.header);
                setSections(data.document_structure.sections ?? []);
                if ((data.document_structure.sections?.length ?? 0) > 0) {
                    setSelectedSectionId(data.document_structure.sections[0].id);
                }
            }
        } catch {
            setToast({ msg: 'Failed to load policy', type: 'error' });
        } finally {
            setLoading(false);
        }
    }, [policyId]);

    useEffect(() => { loadPolicy(); }, [loadPolicy]);

    const selectedSection = sections.find(s => s.id === selectedSectionId) ?? null;

    /* ── section ops ──────────────────────────────────────────── */

    const addSection = () => {
        const s = emptySection(sections.length + 1);
        s.title = 'New Section ' + String(sections.length + 1);
        setSections(prev => [...prev, s]);
        setSelectedSectionId(s.id);
    };

    const updateSection = (id: string, u: Partial<Section>) => {
        setSections(prev => prev.map(s => (s.id === id ? { ...s, ...u } : s)));
    };

    const deleteSection = (id: string) => {
        setSections(prev => {
            const next = prev.filter(s => s.id !== id).map((s, i) => ({ ...s, order: i + 1 }));
            if (selectedSectionId === id) setSelectedSectionId(next[0]?.id ?? null);
            return next;
        });
    };

    const reorderSections = (from: number, to: number) => {
        setSections(prev => {
            const copy = [...prev];
            const [item] = copy.splice(from, 1);
            copy.splice(to, 0, item);
            return copy.map((s, i) => ({ ...s, order: i + 1 }));
        });
    };

    /* ── subsection ops ───────────────────────────────────────── */

    const addSubsection = (secId: string) => {
        setSections(prev =>
            prev.map(s => {
                if (s.id !== secId) return s;
                const sub = emptySubsection(s.subsections.length + 1);
                sub.title = 'Subsection ' + String(s.subsections.length + 1);
                return { ...s, subsections: [...s.subsections, sub] };
            }),
        );
    };

    const updateSubsection = (secId: string, subId: string, u: Partial<Subsection>) => {
        setSections(prev =>
            prev.map(s =>
                s.id !== secId ? s : { ...s, subsections: s.subsections.map(sub => (sub.id === subId ? { ...sub, ...u } : sub)) },
            ),
        );
    };

    const deleteSubsection = (secId: string, subId: string) => {
        setSections(prev =>
            prev.map(s =>
                s.id !== secId ? s : { ...s, subsections: s.subsections.filter(sub => sub.id !== subId).map((sub, i) => ({ ...sub, order: i + 1 })) },
            ),
        );
    };

    /* ── field ops ────────────────────────────────────────────── */

    const openAddField = (secId: string, subId: string) => setFieldModal({ sectionId: secId, subsectionId: subId, field: emptyField(), isEdit: false });
    const openEditField = (secId: string, subId: string, field: PolicyField) => setFieldModal({ sectionId: secId, subsectionId: subId, field: { ...field }, isEdit: true });

    const saveField = (field: PolicyField) => {
        if (!fieldModal) return;
        const { sectionId, subsectionId, isEdit } = fieldModal;
        setSections(prev =>
            prev.map(s => {
                if (s.id !== sectionId) return s;
                return {
                    ...s,
                    subsections: s.subsections.map(sub => {
                        if (sub.id !== subsectionId) return sub;
                        return isEdit
                            ? { ...sub, fields: sub.fields.map(ff => (ff.id === field.id ? field : ff)) }
                            : { ...sub, fields: [...sub.fields, field] };
                    }),
                };
            }),
        );
        setFieldModal(null);
    };

    const deleteField = (secId: string, subId: string, fId: string) => {
        setSections(prev =>
            prev.map(s =>
                s.id !== secId ? s : { ...s, subsections: s.subsections.map(sub => (sub.id !== subId ? sub : { ...sub, fields: sub.fields.filter(ff => ff.id !== fId) })) },
            ),
        );
    };

    /* ── save (with AI validation overlay) ────────────────────── */

    const updateMeta = (op: string, start: number, success: boolean, error?: string) => {
        const meta: AICallMetadata = {
            provider: aiProviderInfo?.provider || 'unknown',
            model: aiProviderInfo?.model || 'unknown',
            duration_ms: Date.now() - start,
            tokens: 0, operation: op,
            timestamp: new Date().toISOString(),
            success, error,
        };
        setLastAiMeta(meta);
        aiCtx.addLogEntry(meta);
    };

    const handleSave = async () => {
        if (saving) return;
        setSaving(true);
        setShowValidationBanner(false);
        setAiOverlayMessage('AI Validation in progress…');
        setAiOverlayVisible(true);
        const start = Date.now();
        try {
            await aiCtx.trackAICall('save_with_validation', async () => {
                const res = await policyAPI.saveManualStructure(policyId, { header, sections, annexures: [], attachments: [] });
                const data: StructureResponse = res.data;
                setPolicy(prev => (prev ? { ...prev, current_version: data.version } : prev));
                updateMeta('save_with_validation', start, true);
                setToast({ msg: 'Structure saved — v' + String(data.version), type: 'success' });
            });
        } catch (err: unknown) {
            const resp = (err as { response?: { status?: number; data?: { detail?: unknown } } })?.response;
            const detail = resp?.data?.detail;
            if (resp?.status === 422 && typeof detail === 'object' && detail !== null && 'ai_validation_failed' in detail) {
                const vr = detail as { issues?: AIValidationIssue[]; suggestions?: string[]; normalized_field_names?: Record<string, string>; message?: string };
                setAiValidationIssues(vr.issues || []);
                setAiValidationSuggestions(vr.suggestions || []);
                setAiNormalizedNames(vr.normalized_field_names || {});
                setShowValidationBanner(true);
                updateMeta('save_with_validation', start, false, vr.message || 'Validation failed');
            } else if (resp?.status === 503) {
                setAi503ModalOpen(true);
                updateMeta('save_with_validation', start, false, 'AI service unavailable (503)');
            } else {
                const d = typeof detail === 'string' ? detail : 'Failed to save structure';
                setToast({ msg: d, type: 'error' });
                updateMeta('save_with_validation', start, false, d);
            }
        } finally {
            setSaving(false);
            setAiOverlayVisible(false);
        }
    };

    /* ── validate (pre-check without save) ─────────────────────── */

    const handleValidate = async () => {
        if (aiValidating) return;
        setAiValidating(true);
        setShowValidationBanner(false);
        setAiOverlayMessage('Running AI validation…');
        setAiOverlayVisible(true);
        const start = Date.now();
        try {
            await aiCtx.trackAICall('validate_structure', async () => {
                await policyAPI.saveManualStructure(policyId, { header, sections, annexures: [], attachments: [] });
                updateMeta('validate_structure', start, true);
                setToast({ msg: 'AI validation passed ✓', type: 'success' });
            });
        } catch (err: unknown) {
            const resp = (err as { response?: { status?: number; data?: { detail?: unknown } } })?.response;
            const detail = resp?.data?.detail;
            if (resp?.status === 422 && typeof detail === 'object' && detail !== null && 'ai_validation_failed' in detail) {
                const vr = detail as { issues?: AIValidationIssue[]; suggestions?: string[]; normalized_field_names?: Record<string, string>; message?: string };
                setAiValidationIssues(vr.issues || []);
                setAiValidationSuggestions(vr.suggestions || []);
                setAiNormalizedNames(vr.normalized_field_names || {});
                setShowValidationBanner(true);
                updateMeta('validate_structure', start, false, vr.message || 'Validation failed');
            } else if (resp?.status === 503) {
                setAi503ModalOpen(true);
                updateMeta('validate_structure', start, false, 'AI service unavailable');
            } else {
                setToast({ msg: 'Validation check failed', type: 'error' });
                updateMeta('validate_structure', start, false, 'Unknown error');
            }
        } finally {
            setAiValidating(false);
            setAiOverlayVisible(false);
        }
    };

    /* ── per-section AI enhance ────────────────────────────────── */

    const handleSectionEnhance = async (secId: string) => {
        if (sectionEnhancingId) return;
        setSectionEnhancingId(secId);
        const sec = sections.find(s => s.id === secId);
        if (!sec) { setSectionEnhancingId(null); return; }
        const start = Date.now();
        try {
            await aiCtx.trackAICall('enhance_section', async () => {
                const res = await documentAPI.enhanceStructure(policyId, `Improve section "${sec.title}": enhance field naming, add missing validation rules, improve clarity`);
                const enhanced = res.data.document_structure;
                if (enhanced) {
                    setSections(prev => prev.map(s => {
                        if (s.id !== secId) return s;
                        const enhancedSec = enhanced.sections.find((es: Section) => es.order === s.order) || enhanced.sections[0];
                        if (!enhancedSec) return s;
                        return { ...enhancedSec, id: s.id, _aiSource: 'enhanced' as const };
                    }));
                    updateMeta('enhance_section', start, true);
                    setToast({ msg: `Section "${sec.title}" enhanced by AI`, type: 'success' });
                }
            });
        } catch (err: unknown) {
            const resp = (err as { response?: { status?: number } })?.response;
            if (resp?.status === 503) {
                setAi503ModalOpen(true);
                updateMeta('enhance_section', start, false, 'AI service unavailable');
            } else {
                setToast({ msg: 'AI enhancement failed', type: 'error' });
                updateMeta('enhance_section', start, false, 'Enhancement failed');
            }
        } finally {
            setSectionEnhancingId(null);
        }
    };

    /* ── ai ────────────────────────────────────────────────────── */


    const acceptAi = () => {
        if (!aiPreview) return;
        setHeader(aiPreview.header);
        const marked = aiPreview.sections.map(s => ({ ...s, _aiSource: 'ai' as const }));
        setSections(marked);
        if (marked.length > 0) setSelectedSectionId(marked[0].id);
        setAiPreview(null);
        setToast({ msg: 'AI structure accepted — click Save to persist', type: 'success' });
    };

    const handleSubmitApproval = async () => {
        if (!aiPreview) return;
        const start = Date.now();
        setSaving(true);
        try {
            await aiCtx.trackAICall('save_with_validation', async () => {
                await policyAPI.saveManualStructure(policyId, {
                    header: aiPreview.header,
                    sections: aiPreview.sections,
                    annexures: [],
                    attachments: []
                });

                const tRes = await workflowAPI.listTemplates();
                const templates = tRes.data;
                if (!templates || templates.length === 0) {
                    throw new Error("No workflow templates found. Please create one first.");
                }

                await workflowAPI.submit(policyId, templates[0].id, "Submitted via AI Assistant");
                setToast({ msg: 'Policy submitted for approval successfully.', type: 'success' });

                const pRes = await policyAPI.get(policyId);
                setPolicy(pRes.data);

                setHeader(aiPreview.header);
                setSections(aiPreview.sections.map(s => ({ ...s, _aiSource: 'ai' as const })));
            });
        } catch (err: unknown) {
            const resp = (err as any)?.response;
            const detail = resp?.data?.detail;
            const d = typeof detail === 'string' ? detail : (err as Error).message || 'Failed to submit workflow';
            setToast({ msg: d, type: 'error' });
        } finally {
            setSaving(false);
        }
    };

    /* ── document composer ─────────────────────────────────────── */

    const handleDownload = async (format: 'word' | 'pdf' | 'json') => {
        setDocGenerating(format);
        setDocDropdownOpen(false);
        try {
            const fn = format === 'word' ? documentAPI.generateWord
                : format === 'pdf' ? documentAPI.generatePDF
                    : documentAPI.generateJSON;
            const res = await fn(policyId);
            const blob = new Blob([res.data]);
            const ext = format === 'word' ? 'docx' : format;
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${policy?.name || 'policy'}.${ext}`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);
            setToast({ msg: `${format.toUpperCase()} downloaded`, type: 'success' });
        } catch {
            setToast({ msg: `${format.toUpperCase()} generation failed`, type: 'error' });
        } finally {
            setDocGenerating(null);
        }
    };

    const handleEnhance = async () => {
        if (!enhanceInstruction.trim() || enhancing) return;
        setEnhancing(true);
        try {
            await aiCtx.trackAICall('enhance_full_structure', async () => {
                const res = await documentAPI.enhanceStructure(policyId, enhanceInstruction.trim());
                const enhanced = res.data.document_structure;
                if (enhanced) {
                    setHeader(enhanced.header);
                    setSections(enhanced.sections ?? []);
                    if ((enhanced.sections?.length ?? 0) > 0)
                        setSelectedSectionId(enhanced.sections[0].id);
                    setToast({ msg: 'Structure enhanced — click Save to persist', type: 'success' });
                }
            });
            setEnhanceModalOpen(false);
            setEnhanceInstruction('');
        } catch (err: unknown) {
            const resp = (err as { response?: { status?: number; data?: { detail?: string } } })?.response;
            if (resp?.status === 503) {
                setAi503ModalOpen(true);
            } else {
                setToast({ msg: 'AI enhancement failed', type: 'error' });
            }
        } finally {
            setEnhancing(false);
        }
    };

    /* ── loading / not found ──────────────────────────────────── */

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg-primary)' }}>
                <div className="flex flex-col items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: 'var(--gradient-blue)', boxShadow: 'var(--shadow-blue)' }}>
                        <Icon name="progress_activity" size={24} className="animate-spin" />
                    </div>
                    <p className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Loading builder...</p>
                </div>
            </div>
        );
    }

    if (!policy) {
        return (
            <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg-primary)' }}>
                <div className="text-center">
                    <p className="text-sm font-semibold text-white mb-2">Policy Not Found</p>
                    <button onClick={() => router.push('/dashboard/policies')} className="btn-ghost px-4 py-2 text-xs">Back to Policies</button>
                </div>
            </div>
        );
    }

    /* ── render ────────────────────────────────────────────────── */

    return (
        <div className="flex flex-col h-screen" style={{ background: 'var(--bg-primary)' }}>
            {/* ── Policy Header — Clean Three-Row Layout ────────────── */}
            <header className="policy-header flex-shrink-0 border-b px-6 py-4" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-default)' }}>
                {/* Row 1: Back + Policy Name + Status Badge */}
                <div className="flex items-center gap-4">
                    <button onClick={() => router.push('/dashboard/policies')} className="btn-icon flex-shrink-0" style={{ width: 36, height: 36, borderRadius: 12, border: '1px solid var(--border-default)' }} title="Back to Policies">
                        <Icon name="arrow_back" size={18} color="var(--text-muted)" />
                    </button>
                    <h1 className="text-lg font-bold flex-1 truncate" style={{ color: 'var(--text-primary)' }}>{policy.name}</h1>
                    {/* Color-coded status badge */}
                    <span className="status-badge" style={{
                        ...(policy.status === 'approved' ? { background: 'rgba(52,211,153,0.1)', color: '#34d399', border: '1px solid rgba(52,211,153,0.2)' }
                            : policy.status === 'pending_approval' ? { background: 'rgba(251,191,36,0.1)', color: '#fbbf24', border: '1px solid rgba(251,191,36,0.2)' }
                                : policy.status === 'validation_failed' ? { background: 'rgba(248,113,113,0.1)', color: '#f87171', border: '1px solid rgba(248,113,113,0.2)' }
                                    : { background: 'rgba(156,163,175,0.1)', color: '#9ca3af', border: '1px solid rgba(156,163,175,0.15)' }),
                    }}>
                        <Icon name={
                            policy.status === 'approved' ? 'check_circle'
                                : policy.status === 'pending_approval' ? 'schedule'
                                    : policy.status === 'validation_failed' ? 'error'
                                        : 'edit_note'
                        } size={14} />
                        {policy.status.replace(/_/g, ' ')}
                    </span>
                </div>

                {/* Row 2: Action Toolbar — uniform btn-action buttons */}
                <div className="action-toolbar flex items-center gap-4 pl-[52px] mt-4">
                    <span className="inline-flex items-center gap-1.5 text-[11px] font-mono px-2.5 py-1.5 rounded-lg mr-2" style={{ background: 'rgba(99,102,241,.08)', color: '#818cf8', border: '1px solid rgba(99,102,241,.1)' }}>
                        <Icon name="history" size={14} />
                        v{policy.current_version}
                    </span>
                    {/* Generate Document dropdown */}
                    <div className="relative">
                        <button onClick={() => setDocDropdownOpen(v => !v)} disabled={!!docGenerating || sections.length === 0} className="btn-action">
                            {docGenerating
                                ? <Icon name="progress_activity" size={16} className="animate-spin" />
                                : <Icon name="description" size={16} />}
                            <span className="btn-action-label">{docGenerating ? `${docGenerating.toUpperCase()}...` : 'Generate'}</span>
                            <Icon name="expand_more" size={14} />
                        </button>
                        {docDropdownOpen && (
                            <div className="absolute left-0 top-full mt-1.5 w-48 rounded-xl overflow-hidden shadow-lg z-50" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)' }}>
                                {[
                                    { key: 'word' as const, icon: 'article', label: 'Word (.docx)', color: '#3b82f6' },
                                    { key: 'pdf' as const, icon: 'picture_as_pdf', label: 'PDF (.pdf)', color: '#ef4444' },
                                    { key: 'json' as const, icon: 'data_object', label: 'JSON (.json)', color: '#10b981' },
                                ].map(item => (
                                    <button key={item.key} onClick={() => handleDownload(item.key)} className="w-full flex items-center gap-2.5 px-4 py-2.5 text-xs font-medium text-left hover:bg-white/5 transition-colors" style={{ color: 'var(--text-primary)' }}>
                                        <Icon name={item.icon} size={16} color={item.color} />
                                        {item.label}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Compose */}
                    <button onClick={() => router.push(`/dashboard/policies/${policyId}/compose`)} className="btn-action btn-action--accent" title="AI Composer">
                        <Icon name="auto_awesome" size={16} filled />
                        <span className="btn-action-label">Compose</span>
                    </button>

                    {/* Enhance */}
                    <button onClick={() => setEnhanceModalOpen(true)} disabled={sections.length === 0} className="btn-action btn-action--warning" title="AI Enhance">
                        <Icon name="magic_button" size={16} />
                        <span className="btn-action-label">Enhance</span>
                    </button>

                    {/* Validate */}
                    <button onClick={handleValidate} disabled={aiValidating || sections.length === 0} className="btn-action" title="Validate with AI">
                        {aiValidating
                            ? <Icon name="progress_activity" size={16} className="animate-spin" />
                            : <Icon name="verified" size={16} />}
                        <span className="btn-action-label">{aiValidating ? 'Validating…' : 'Validate'}</span>
                    </button>

                    <span className="flex-1" />

                    {/* AI Log */}
                    <button onClick={() => aiCtx.setDrawerOpen(true)} className="btn-action" style={{ padding: 0, width: 40 }} title="AI Execution Log">
                        <Icon name="terminal" size={16} color="var(--text-muted)" />
                        {aiCtx.executionLog.length > 0 && (
                            <span style={{ position: 'absolute', top: 8, right: 8, width: 6, height: 6, borderRadius: '50%', background: '#a78bfa' }} />
                        )}
                    </button>

                    {/* AI Panel toggle */}
                    <button onClick={() => setAiPanelOpen(v => !v)} className={`btn-action ${aiPanelOpen ? 'btn-action--accent' : ''}`} style={{ padding: 0, width: 40 }} title="AI Assistant Panel">
                        <Icon name="smart_toy" size={16} filled />
                    </button>

                    {/* Save — primary */}
                    <button onClick={handleSave} disabled={saving || sections.length === 0} className="btn-primary h-10 px-5 rounded-xl text-xs font-semibold flex items-center gap-2">
                        {saving
                            ? <Icon name="progress_activity" size={16} className="animate-spin" />
                            : <Icon name="save" size={16} />}
                        <span>{saving ? 'Saving…' : 'Save'}</span>
                    </button>
                </div>
            </header>

            {/* ── Mobile Tab Bar (editor vs preview) ── */}
            {!isViewMode && <div className="mobile-tab-bar w-full border-b" style={{ borderColor: 'var(--border-default)', background: 'var(--bg-secondary)' }}>
                {(['editor', 'preview'] as const).map(t => (
                    <button
                        key={t}
                        onClick={() => setMobileTab(t)}
                        className="flex-1 py-3 text-xs font-semibold transition-all"
                        style={{
                            color: mobileTab === t ? '#3b82f6' : 'var(--text-muted)',
                            borderBottom: mobileTab === t ? '2px solid #3b82f6' : '2px solid transparent',
                            background: 'transparent',
                        }}
                    >
                        <Icon name={t === 'editor' ? 'edit' : 'preview'} size={14} />
                        <span className="ml-1.5">{t === 'editor' ? 'Editor' : 'Preview'}</span>
                    </button>
                ))}
            </div>}

            {/* ═══ Split-Screen Layout ═══ */}
            <div className="flex flex-1 overflow-hidden split-layout bg-transparent">

                {/* ═══ Left: Editor Panel ═══ */}
                <div className={`flex-1 flex flex-col min-w-0 ${mobileTab !== 'editor' ? 'hidden md:flex' : ''} ${isViewMode ? '!hidden' : ''}`}>
                    <div className="flex flex-1 overflow-hidden justify-center bg-transparent">

                        {/* center canvas */}
                        <main className="flex-1 overflow-y-auto p-6 max-w-5xl w-full mx-auto relative">
                            {/* header editor */}
                            <div className="theme-card p-5 mb-5 animate-fade-in">
                                <div className="flex items-center gap-2 mb-4">
                                    <Icon name="description" size={14} color="var(--accent-violet)" />
                                    <span className="text-xs font-bold text-white">Policy Header</span>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-[10px] font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>Title</label>
                                        <input type="text" value={header.title} onChange={e => setHeader(h => ({ ...h, title: e.target.value }))} className="w-full rounded-lg px-3 py-2 text-xs theme-input" placeholder="Policy title" />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>Organization</label>
                                        <input type="text" value={header.organization} onChange={e => setHeader(h => ({ ...h, organization: e.target.value }))} className="w-full rounded-lg px-3 py-2 text-xs theme-input" placeholder="Organization name" />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>Effective Date</label>
                                        <input type="date" value={header.effective_date ?? ''} onChange={e => setHeader(h => ({ ...h, effective_date: e.target.value || null }))} className="w-full rounded-lg px-3 py-2 text-xs theme-input" />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>Expiry Date</label>
                                        <input type="date" value={header.expiry_date ?? ''} onChange={e => setHeader(h => ({ ...h, expiry_date: e.target.value || null }))} className="w-full rounded-lg px-3 py-2 text-xs theme-input" />
                                    </div>
                                </div>
                            </div>

                            {/* ── File Attachments ── */}
                            <div className="theme-card p-5 mb-5 animate-fade-in">
                                <div className="flex items-center gap-2 mb-3">
                                    <Icon name="attach_file" size={14} color="var(--accent-blue)" />
                                    <span className="text-xs font-bold text-white">Reference Documents</span>
                                    {attachedFiles.length > 0 && (
                                        <span className="text-[10px] font-mono px-1.5 rounded" style={{ background: 'rgba(59,130,246,.08)', color: '#60a5fa' }}>
                                            {attachedFiles.length} file{attachedFiles.length !== 1 ? 's' : ''}
                                        </span>
                                    )}
                                </div>
                                <FileUpload files={attachedFiles} onChange={setAttachedFiles} />
                            </div>

                            {/* Sections Builder Header */}
                            <div className="flex items-center justify-between mb-4 mt-8">
                                <h2 className="text-lg font-bold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                                    <Icon name="list" size={20} color="var(--accent-emerald)" />
                                    Sections ({sections.length})
                                </h2>
                                <button onClick={addSection} className="btn-action text-xs" style={{ height: 36 }}>
                                    <Icon name="add" size={16} /> Add Section
                                </button>
                            </div>

                            {/* All sections editor */}
                            {sections.length > 0 ? (
                                <div className="space-y-8 pb-32">
                                    {sections.map((sec) => (
                                        <div key={sec.id} className="animate-fade-in relative">
                                            {/* Section Details card — full width */}
                                            <div className="theme-card p-5 mb-4">
                                                <div className="flex items-center gap-2 mb-4">
                                                    <span className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold" style={{ background: 'rgba(59,130,246,.12)', color: '#60a5fa' }}>{sec.order}</span>
                                                    <span className="text-xs font-bold text-white">Section Details</span>
                                                    {/* AI source badge */}
                                                    {sec._aiSource && (
                                                        <span style={{
                                                            fontSize: 9, fontWeight: 700, padding: '2px 8px', borderRadius: 9999,
                                                            background: sec._aiSource === 'ai' ? 'rgba(139,92,246,.1)' : 'rgba(245,158,11,.1)',
                                                            color: sec._aiSource === 'ai' ? '#a78bfa' : '#fbbf24',
                                                            border: `1px solid ${sec._aiSource === 'ai' ? 'rgba(139,92,246,.2)' : 'rgba(245,158,11,.2)'}`,
                                                            display: 'inline-flex', alignItems: 'center', gap: 3,
                                                        }}>
                                                            <Icon name="auto_awesome" size={10} filled />
                                                            {sec._aiSource === 'ai' ? 'AI Generated' : 'AI Enhanced'}
                                                        </span>
                                                    )}
                                                    <span style={{ flex: 1 }} />
                                                    {/* Delete section button */}
                                                    <button onClick={() => deleteSection(sec.id)} className="btn-icon mr-2" style={{ width: 28, height: 28, color: 'var(--accent-rose)' }} title="Remove Section">
                                                        <Icon name="delete" size={14} />
                                                    </button>
                                                    {/* Per-section enhance button */}
                                                    <button
                                                        onClick={() => handleSectionEnhance(sec.id)}
                                                        disabled={sectionEnhancingId === sec.id}
                                                        className="btn-ghost px-2.5 py-1.5 text-[10px] flex items-center gap-1"
                                                        style={{ borderColor: 'rgba(245,158,11,.2)', color: '#fbbf24' }}
                                                    >
                                                        {sectionEnhancingId === sec.id
                                                            ? <Icon name="progress_activity" size={12} className="animate-spin" />
                                                            : <Icon name="auto_fix_high" size={12} />}
                                                        Enhance with AI
                                                    </button>
                                                </div>
                                                <div className="grid grid-cols-1 gap-3">
                                                    <div>
                                                        <label className="block text-[10px] font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>Section Title</label>
                                                        <input type="text" value={sec.title} onChange={e => updateSection(sec.id, { title: e.target.value })} className="w-full rounded-lg px-3 py-2 text-sm theme-input" placeholder="Enter section title" />
                                                    </div>
                                                    <div>
                                                        <label className="block text-[10px] font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>Description</label>
                                                        <textarea value={sec.description} onChange={e => updateSection(sec.id, { description: e.target.value })} className="w-full rounded-lg px-3 py-2 text-xs theme-input resize-none" rows={2} placeholder="What does this section cover?" />
                                                    </div>
                                                    <div>
                                                        <div className="flex items-center justify-between mb-1">
                                                            <label className="block text-[10px] font-semibold" style={{ color: 'var(--text-muted)' }}>Formal Narrative Content</label>
                                                            <span className="text-[9px]" style={{ color: 'var(--text-secondary)' }}>This text appears exactly as written in the final document</span>
                                                        </div>
                                                        <textarea
                                                            value={sec.narrative_content}
                                                            onChange={e => updateSection(sec.id, { narrative_content: e.target.value, ai_generated: false })}
                                                            className="w-full rounded-lg px-3 py-2 text-xs theme-input resize-none font-serif leading-relaxed"
                                                            style={{ borderLeft: '3px solid var(--accent-violet)', background: 'rgba(255,255,255,.01)' }}
                                                            rows={4}
                                                            placeholder="Enter formal policy text here. (e.g. 'This policy applies to all full-time employees...')"
                                                        />
                                                    </div>
                                                </div>
                                            </div>

                                            {/* ── Structured Fields / Subsections ── */}
                                            <div className="flex gap-4">

                                                {/* Structured Fields / Subsections (100%) */}
                                                <div className="flex-1" style={{ overflow: 'visible' }}>
                                                    {sec.subsections.map(sub => (
                                                        <div key={sub.id} className="theme-card mb-4 overflow-hidden">
                                                            <div className="px-4 py-3 flex items-center gap-3 border-b" style={{ borderColor: 'var(--border-default)', background: 'rgba(255,255,255,.01)' }}>
                                                                <Icon name="segment" size={14} color="var(--accent-cyan)" />
                                                                <input type="text" value={sub.title} onChange={e => updateSubsection(sec.id, sub.id, { title: e.target.value })} className="flex-1 bg-transparent text-xs font-semibold text-white outline-none" placeholder="Subsection title" />
                                                                <span className="text-[10px] font-mono px-1.5 rounded" style={{ background: 'rgba(6,182,212,.08)', color: '#22d3ee' }}>{sub.fields.length} field{sub.fields.length !== 1 ? 's' : ''}</span>
                                                                <button onClick={() => deleteSubsection(sec.id, sub.id)} className="btn-icon" style={{ width: 28, height: 28 }}>
                                                                    <Icon name="delete" size={12} color="var(--accent-rose)" />
                                                                </button>
                                                            </div>
                                                            <div className="p-4 space-y-2">
                                                                {sub.fields.length === 0 ? (
                                                                    <p className="text-[11px] text-center py-4" style={{ color: 'var(--text-muted)' }}>No fields — click below to add</p>
                                                                ) : (
                                                                    sub.fields.map(field => {
                                                                        const st = fts(field.field_type);
                                                                        return (
                                                                            <div key={field.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl group transition-all" style={{ background: 'rgba(255,255,255,.015)', border: '1px solid var(--border-subtle)' }}>
                                                                                <Icon name={st.icon} size={14} />
                                                                                <div className="flex-1 min-w-0">
                                                                                    <p className="text-xs font-medium text-white truncate">{field.field_name}</p>
                                                                                    {field.notes ? <p className="text-[10px] truncate mt-0.5" style={{ color: 'var(--text-muted)' }}>{field.notes}</p> : null}
                                                                                </div>
                                                                                <span className="text-[10px] font-medium px-2 py-0.5 rounded-full" style={{ background: st.bg, color: st.color }}>{field.field_type.replace('_', ' ')}</span>
                                                                                {field._aiSource && (
                                                                                    <span style={{
                                                                                        fontSize: 8, fontWeight: 700, padding: '1px 6px', borderRadius: 9999,
                                                                                        background: field._aiSource === 'ai' ? 'rgba(139,92,246,.1)' : 'rgba(245,158,11,.1)',
                                                                                        color: field._aiSource === 'ai' ? '#a78bfa' : '#fbbf24',
                                                                                        border: `1px solid ${field._aiSource === 'ai' ? 'rgba(139,92,246,.2)' : 'rgba(245,158,11,.2)'}`,
                                                                                        display: 'inline-flex', alignItems: 'center', gap: 2,
                                                                                    }}>
                                                                                        <Icon name="auto_awesome" size={8} filled />
                                                                                        {field._aiSource === 'ai' ? 'AI' : '✦'}
                                                                                    </span>
                                                                                )}
                                                                                {Boolean(field.validation_rules?.required) && (
                                                                                    <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded" style={{ background: 'rgba(244,63,94,.08)', color: '#fb7185' }}>REQ</span>
                                                                                )}
                                                                                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                                                                    <button onClick={() => openEditField(sec.id, sub.id, field)} className="btn-icon" style={{ width: 26, height: 26 }}>
                                                                                        <Icon name="edit" size={12} color="var(--accent-blue)" />
                                                                                    </button>
                                                                                    <button onClick={() => deleteField(sec.id, sub.id, field.id)} className="btn-icon" style={{ width: 26, height: 26 }}>
                                                                                        <Icon name="delete" size={12} color="var(--accent-rose)" />
                                                                                    </button>
                                                                                </div>
                                                                            </div>
                                                                        );
                                                                    })
                                                                )}
                                                                <button onClick={() => openAddField(sec.id, sub.id)} className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg text-[11px] font-medium transition-all" style={{ color: '#60a5fa', background: 'rgba(59,130,246,.04)', border: '1px dashed rgba(59,130,246,.15)' }}>
                                                                    <Icon name="add" size={14} />Add Field
                                                                </button>
                                                            </div>
                                                        </div>
                                                    ))}

                                                    <button onClick={() => addSubsection(sec.id)} className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-xs font-semibold transition-all" style={{ color: '#22d3ee', background: 'rgba(6,182,212,.04)', border: '1px dashed rgba(6,182,212,.2)' }}>
                                                        <Icon name="add" size={14} />Add Subsection
                                                    </button>
                                                </div>{/* end Subsections */}
                                            </div>{/* end Structured Fields wrapper */}
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="empty-state py-20 border border-dashed rounded-2xl mb-6 mt-6 flex flex-col items-center justify-center text-center space-y-2 h-full min-h-[400px]" style={{ borderColor: 'var(--border-subtle)', background: 'rgba(255,255,255,.005)' }}>
                                    <div className="empty-state-icon flex items-center justify-center rounded-xl" style={{ width: 64, height: 64, marginBottom: 8, background: 'rgba(59,130,246,.08)' }}>
                                        <Icon name="account_tree" size={28} color="var(--accent-blue)" />
                                    </div>
                                    <p className="text-sm font-semibold text-white">Policy Structure Builder</p>
                                    <p className="text-xs max-w-[280px]" style={{ color: 'var(--text-muted)' }}>Click "Add Section" above to start building your policy structure.</p>
                                </div>
                            )}
                        </main>

                        <div style={{ display: aiPanelOpen ? 'block' : 'none', height: '100%' }}>
                            <AIAssistantPanel
                                policyId={policyId}
                                policyName={policy?.name || 'Untitled Policy'}
                                preview={aiPreview}
                                setPreview={setAiPreview}
                                onAccept={acceptAi}
                                onReject={() => setAiPreview(null)}
                                onClose={() => setAiPanelOpen(false)}
                                onValidate={handleValidate}
                                validating={aiValidating}
                                onSubmitApproval={handleSubmitApproval}
                                lastMeta={lastAiMeta}
                                providerInfo={aiProviderInfo}
                            />
                        </div>
                    </div>
                </div>

                {/* ═══ Right: Live Document Preview ═══ */}
                <div className={`flex-1 min-w-0 ${mobileTab !== 'preview' ? 'hidden md:block' : ''} ${isViewMode ? '!block !max-w-none w-full flex-1 mx-auto' : ''}`}
                    style={{ borderLeft: '1px solid var(--border-default)' }}>
                    <PolicyDocumentPreview
                        header={header.title ? {
                            title: header.title,
                            organization: header.organization || undefined,
                            effective_date: header.effective_date,
                            expiry_date: header.expiry_date,
                        } : undefined}
                        sections={sections.filter(s => s.title.trim()).map(s => ({
                            ...s,
                            subsections: s.subsections.map(sub => ({
                                ...sub,
                                fields: sub.fields.filter(f => f.field_name.trim()).map(f => ({
                                    field_name: f.field_name,
                                    field_type: f.field_type,
                                    notes: f.notes,
                                })),
                            })),
                        }))}
                    />
                </div>
            </div>

            {fieldModal && <FieldModal field={fieldModal.field} onSave={saveField} onClose={() => setFieldModal(null)} />
            }
            {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}

            {/* click-away for doc dropdown */}
            {docDropdownOpen && <div className="fixed inset-0 z-40" onClick={() => setDocDropdownOpen(false)} />}

            {/* AI Enhance Modal */}
            {
                enhanceModalOpen && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'var(--bg-overlay)' }}>
                        <div className="w-full max-w-lg rounded-2xl p-6 animate-fade-in" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-default)' }}>
                            <div className="flex items-center gap-2 mb-4">
                                <Icon name="magic_button" size={18} color="#fbbf24" />
                                <h2 className="text-sm font-bold text-white">AI Enhance Structure</h2>
                            </div>
                            <p className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>
                                Describe how the AI should improve the current policy structure. The schema will be preserved.
                            </p>
                            <textarea
                                value={enhanceInstruction}
                                onChange={e => setEnhanceInstruction(e.target.value)}
                                rows={4}
                                className="w-full rounded-lg px-3 py-2 text-xs theme-input mb-4"
                                placeholder="e.g. Add credit risk assessment fields to Section 2, improve validation rules..."
                            />
                            <div className="flex justify-end gap-2">
                                <button onClick={() => { setEnhanceModalOpen(false); setEnhanceInstruction(''); }} className="btn-ghost px-4 py-2 text-xs">Cancel</button>
                                <button onClick={handleEnhance} disabled={enhancing || !enhanceInstruction.trim()} className="btn-primary px-4 py-2 text-xs flex items-center gap-1.5">
                                    {enhancing
                                        ? <Icon name="progress_activity" size={14} className="animate-spin" />
                                        : <Icon name="magic_button" size={14} />}
                                    {enhancing ? 'Enhancing...' : 'Enhance'}
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* AI 503 Unavailable Modal */}
            {
                ai503ModalOpen && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'var(--bg-overlay)' }}>
                        <div className="w-full max-w-md rounded-2xl p-8 animate-fade-in text-center" style={{ background: 'var(--bg-card)', border: '1px solid rgba(239,68,68,.2)' }}>
                            <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4" style={{ background: 'rgba(239,68,68,.08)' }}>
                                <Icon name="cloud_off" size={30} color="#ef4444" />
                            </div>
                            <h2 className="text-lg font-bold text-white mb-2">AI Service Unavailable</h2>
                            <p className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>The AI provider returned a <span className="font-mono text-[#ef4444]">503</span> error.</p>
                            <p className="text-xs mb-6" style={{ color: 'var(--text-muted)' }}>
                                {aiProviderInfo
                                    ? `Provider: ${aiProviderInfo.provider.toUpperCase()} (${aiProviderInfo.model})`
                                    : 'Could not determine provider info'}
                            </p>
                            <p className="text-xs mb-6" style={{ color: 'var(--text-muted)' }}>
                                Please verify the API key is valid and the service is reachable. Contact your administrator if the issue persists.
                            </p>
                            <button onClick={() => setAi503ModalOpen(false)} className="btn-primary px-6 py-2.5 text-xs">
                                Dismiss
                            </button>
                        </div>
                    </div>
                )
            }

            {/* ── AI Native Components ──────────────────────────── */}
            <AILoadingOverlay visible={aiOverlayVisible} message={aiOverlayMessage} subMessage="No structure save can bypass AI validation" providerName={aiProviderInfo?.provider} modelName={aiProviderInfo?.model} />

            {
                showValidationBanner && (
                    <AIValidationBanner
                        issues={aiValidationIssues}
                        suggestions={aiValidationSuggestions}
                        normalizedNames={aiNormalizedNames}
                        onDismiss={() => setShowValidationBanner(false)}
                        onRetry={handleSave}
                    />
                )
            }

            {/* AIExecutionLogDrawer now rendered globally in dashboard layout */}
        </div >
    );
}
