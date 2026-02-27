'use client';

import React, { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { policyAPI } from '@/lib/api';
import Icon from '@/components/ui/Icon';
import FileUpload from '@/components/ui/FileUpload';
import PolicyDocumentPreview from '@/components/ui/PolicyDocumentPreview';
import type { FieldType } from '@/types/policy';

/* ── Types ──────────────────────────────────────────────────────── */
interface Field {
    id: string;
    field_name: string;
    field_type: FieldType;
    validation_rules: Record<string, unknown>;
    conditional_logic: Record<string, unknown>;
    notes: string;
}
interface Subsection { id: string; title: string; order: number; fields: Field[]; }
interface Section {
    id: string; title: string; description: string; order: number;
    subsections: Subsection[];
    narrative_content?: string;
}

/* ── Toast ──────────────────────────────────────────────────────── */
function Toast({ message, type, onClose }: { message: string; type: 'success' | 'error'; onClose: () => void }) {
    React.useEffect(() => { const t = setTimeout(onClose, 4000); return () => clearTimeout(t); }, [onClose]);
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
/*  MANUAL POLICY BUILDER PAGE                                    */
/* ════════════════════════════════════════════════════════════════ */

export default function ManualBuilderPage() {
    const router = useRouter();

    // ── State ──
    const [policyName, setPolicyName] = useState('');
    const [policyDesc, setPolicyDesc] = useState('');
    const [organization, setOrganization] = useState('');
    const [effectiveDate, setEffectiveDate] = useState('');
    const [sections, setSections] = useState<Section[]>([]);
    const [saving, setSaving] = useState(false);
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
    const [attachedFiles, setAttachedFiles] = useState<File[]>([]);

    // ── Mobile tab state ──
    const [mobileTab, setMobileTab] = useState<'editor' | 'preview'>('editor');

    const uid = () => Math.random().toString(36).slice(2, 10);

    // ── Section / Subsection / Field CRUD ──
    const addSection = () => {
        setSections(prev => [...prev, {
            id: uid(), title: '', description: '', order: prev.length + 1,
            subsections: [{ id: uid(), title: '', order: 1, fields: [] }],
        }]);
    };

    const updateSection = (idx: number, patch: Partial<Section>) => {
        setSections(prev => prev.map((s, i) => i === idx ? { ...s, ...patch } : s));
    };

    const removeSection = (idx: number) => {
        setSections(prev => prev.filter((_, i) => i !== idx).map((s, i) => ({ ...s, order: i + 1 })));
    };

    const addField = (sIdx: number, subIdx: number) => {
        setSections(prev => prev.map((s, si) =>
            si !== sIdx ? s : {
                ...s, subsections: s.subsections.map((sub, sbi) =>
                    sbi !== subIdx ? sub : {
                        ...sub, fields: [...sub.fields, {
                            id: uid(), field_name: '', field_type: 'text',
                            validation_rules: {}, conditional_logic: {}, notes: '',
                        }],
                    }),
            }));
    };

    // ── Save ──
    const handleSave = useCallback(async () => {
        if (!policyName.trim()) { setToast({ message: 'Policy name is required', type: 'error' }); return; }
        setSaving(true);
        try {
            // Create policy first
            const res = await policyAPI.create({ name: policyName.trim(), description: policyDesc.trim() || undefined });
            const policyId = res.data.id;
            // Save structure
            await policyAPI.saveManualStructure(policyId, {
                header: { title: policyName.trim(), organization: organization.trim(), effective_date: effectiveDate || null, expiry_date: null },
                sections: sections,
            });
            setToast({ message: 'Policy created! Redirecting...', type: 'success' });
            setTimeout(() => router.push(`/dashboard/policies/${policyId}`), 1500);
        } catch (err: unknown) {
            const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
            setToast({ message: detail || 'Save failed', type: 'error' });
            setSaving(false);
        }
    }, [policyName, policyDesc, organization, effectiveDate, sections, router]);

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
                            color: mobileTab === t ? '#3b82f6' : 'var(--text-muted)',
                            borderBottom: mobileTab === t ? '2px solid #3b82f6' : '2px solid transparent',
                            background: 'transparent',
                        }}
                    >
                        <Icon name={t === 'editor' ? 'edit' : 'preview'} size={14} />
                        <span className="ml-1.5">{t === 'editor' ? 'Editor' : 'Preview'}</span>
                    </button>
                ))}
            </div>

            {/* ═══ Left: Manual Form Builder ═══ */}
            <div className={`flex-1 overflow-y-auto min-w-0 ${mobileTab !== 'editor' ? 'hidden md:block' : ''}`}>
                <div className="max-w-2xl mx-auto px-6 py-8">
                    {/* Header */}
                    <div className="flex items-center gap-3 mb-8">
                        <button onClick={() => router.push('/dashboard/policies/create')} className="btn-icon">
                            <Icon name="arrow_back" size={18} color="var(--text-muted)" />
                        </button>
                        <div>
                            <h1 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>Manual Policy Builder</h1>
                            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Define your policy structure manually</p>
                        </div>
                    </div>

                    {/* File Upload */}
                    <div className="mb-8">
                        <label className="block text-xs font-semibold mb-2" style={{ color: 'var(--text-secondary)' }}>
                            <Icon name="attach_file" size={14} className="inline mr-1" /> Reference Documents
                        </label>
                        <FileUpload files={attachedFiles} onChange={setAttachedFiles} />
                    </div>

                    {/* Basic Details */}
                    <div className="glass-card p-6 mb-6 space-y-4">
                        <h2 className="text-sm font-bold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                            <Icon name="description" size={16} color="var(--accent-blue)" />
                            Policy Details
                        </h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="md:col-span-2">
                                <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--text-secondary)' }}>
                                    Policy Name <span style={{ color: 'var(--accent-rose)' }}>*</span>
                                </label>
                                <input type="text" value={policyName} onChange={(e) => setPolicyName(e.target.value)}
                                    className="w-full rounded-xl px-4 py-3 text-sm theme-input" placeholder="e.g. Vehicle Insurance Underwriting Policy" />
                            </div>
                            <div className="md:col-span-2">
                                <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--text-secondary)' }}>Description</label>
                                <textarea value={policyDesc} onChange={(e) => setPolicyDesc(e.target.value)}
                                    className="w-full rounded-xl px-4 py-3 text-sm theme-input resize-none" rows={2} placeholder="Brief description..." />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--text-secondary)' }}>Organization</label>
                                <input type="text" value={organization} onChange={(e) => setOrganization(e.target.value)}
                                    className="w-full rounded-xl px-4 py-3 text-sm theme-input" placeholder="Organization name" />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--text-secondary)' }}>Effective Date</label>
                                <input type="date" value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)}
                                    className="w-full rounded-xl px-4 py-3 text-sm theme-input" />
                            </div>
                        </div>
                    </div>

                    {/* Section Builder */}
                    <div className="mb-6">
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-sm font-bold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                                <Icon name="list" size={16} color="var(--accent-emerald)" />
                                Sections ({sections.length})
                            </h2>
                            <button onClick={addSection} className="btn-action text-xs">
                                <Icon name="add" size={14} /> Add Section
                            </button>
                        </div>

                        <div className="space-y-4">
                            {sections.map((sec, sIdx) => (
                                <div key={sec.id} className="glass-card p-5 animate-slide-up">
                                    <div className="flex items-center gap-3 mb-4">
                                        <span className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold"
                                            style={{ background: 'rgba(59,130,246,0.1)', color: '#60a5fa' }}>{sec.order}</span>
                                        <input type="text" value={sec.title} onChange={e => updateSection(sIdx, { title: e.target.value })}
                                            className="flex-1 rounded-lg px-3 py-2 text-sm theme-input font-semibold" placeholder="Section title" />
                                        <button onClick={() => removeSection(sIdx)} className="btn-icon" style={{ color: 'var(--accent-rose)' }}>
                                            <Icon name="close" size={16} />
                                        </button>
                                    </div>
                                    <textarea value={sec.description} onChange={e => updateSection(sIdx, { description: e.target.value })}
                                        className="w-full rounded-lg px-3 py-2 text-xs theme-input resize-none mb-3" rows={2} placeholder="Section description..." />

                                    {/* Subsections & Fields */}
                                    {sec.subsections.map((sub, subIdx) => (
                                        <div key={sub.id} className="ml-4 border-l-2 pl-4 mb-3" style={{ borderColor: 'var(--border-subtle)' }}>
                                            <input type="text" value={sub.title}
                                                onChange={e => {
                                                    const subs = [...sec.subsections];
                                                    subs[subIdx] = { ...subs[subIdx], title: e.target.value };
                                                    updateSection(sIdx, { subsections: subs });
                                                }}
                                                className="w-full rounded-lg px-3 py-1.5 text-xs theme-input mb-2 font-medium" placeholder="Subsection title" />
                                            {sub.fields.map((field, fIdx) => (
                                                <div key={field.id} className="flex items-center gap-2 mb-1.5">
                                                    <input type="text" value={field.field_name}
                                                        onChange={e => {
                                                            const subs = [...sec.subsections];
                                                            const fields = [...subs[subIdx].fields];
                                                            fields[fIdx] = { ...fields[fIdx], field_name: e.target.value };
                                                            subs[subIdx] = { ...subs[subIdx], fields };
                                                            updateSection(sIdx, { subsections: subs });
                                                        }}
                                                        className="flex-1 rounded-lg px-2 py-1 text-[11px] theme-input" placeholder="Field name" />
                                                    <select value={field.field_type}
                                                        onChange={e => {
                                                            const subs = [...sec.subsections];
                                                            const fields = [...subs[subIdx].fields];
                                                            fields[fIdx] = { ...fields[fIdx], field_type: e.target.value as FieldType };
                                                            subs[subIdx] = { ...subs[subIdx], fields };
                                                            updateSection(sIdx, { subsections: subs });
                                                        }}
                                                        className="rounded-lg px-2 py-1 text-[11px] theme-input w-28">
                                                        {['text', 'number', 'dropdown', 'boolean', 'date', 'textarea', 'email', 'phone', 'currency', 'percentage', 'multi_select'].map(t => (
                                                            <option key={t} value={t}>{t}</option>
                                                        ))}
                                                    </select>
                                                </div>
                                            ))}
                                            <button onClick={() => addField(sIdx, subIdx)}
                                                className="text-[10px] font-medium flex items-center gap-1 mt-1 transition-colors"
                                                style={{ color: 'var(--text-muted)' }}>
                                                <Icon name="add" size={12} /> Add Field
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            ))}
                        </div>

                        {sections.length === 0 && (
                            <div className="text-center py-12" style={{ color: 'var(--text-muted)' }}>
                                <Icon name="inbox" size={32} color="var(--text-muted)" style={{ margin: '0 auto 12px', display: 'block' }} />
                                <p className="text-sm">No sections yet — click &ldquo;Add Section&rdquo; to start</p>
                            </div>
                        )}
                    </div>

                    {/* Save button */}
                    <button onClick={handleSave} disabled={saving || !policyName.trim()}
                        className="btn-primary w-full py-3.5 text-sm font-semibold rounded-xl flex items-center justify-center gap-2">
                        {saving ? (
                            <><Icon name="progress_activity" size={16} className="animate-spin" /> Saving...</>
                        ) : (
                            <><Icon name="save" size={16} /> Create Policy</>
                        )}
                    </button>
                </div>
            </div>

            {/* ═══ Right: Live Document Preview ═══ */}
            <div className={`flex-1 min-w-0 ${mobileTab !== 'preview' ? 'hidden md:block' : ''}`}>
                <PolicyDocumentPreview
                    header={policyName ? {
                        title: policyName,
                        organization: organization || undefined,
                        effective_date: effectiveDate || null,
                        expiry_date: null,
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
    );
}
