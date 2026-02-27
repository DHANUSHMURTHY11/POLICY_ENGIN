'use client';

import React from 'react';
import Icon from '@/components/ui/Icon';

/* ── Types ──────────────────────────────────────────────────────── */
interface PreviewField {
    field_name: string;
    field_type: string;
    validation_rules?: Record<string, unknown>;
    notes?: string;
}

interface PreviewSubsection {
    title: string;
    fields: PreviewField[];
}

interface PreviewSection {
    title: string;
    description?: string;
    order: number;
    subsections?: PreviewSubsection[];
    narrative_content?: string;
    tone?: string;
}

interface PreviewHeader {
    title: string;
    organization?: string;
    effective_date?: string | null;
    expiry_date?: string | null;
}

interface PolicyDocumentPreviewProps {
    header?: PreviewHeader;
    sections?: PreviewSection[];
    /** For AI chat mode — show collected params as building blocks */
    collectedParams?: Record<string, unknown>;
    /** Label shown while generating */
    generating?: boolean;
}

/* ════════════════════════════════════════════════════════════════ */
/*  COMPONENT                                                      */
/* ════════════════════════════════════════════════════════════════ */

export default function PolicyDocumentPreview({
    header,
    sections = [],
    collectedParams,
    generating = false,
}: PolicyDocumentPreviewProps) {
    const hasContent = (header?.title) || sections.length > 0 || (collectedParams && Object.keys(collectedParams).length > 0);

    return (
        <div className="h-full flex flex-col" style={{ background: '#e8ebf0' }}>
            {/* Toolbar */}
            <div className="flex items-center justify-between px-5 py-3 border-b" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-default)' }}>
                <div className="flex items-center gap-2">
                    <Icon name="preview" size={16} color="var(--accent-blue)" />
                    <span className="text-xs font-bold" style={{ color: 'var(--text-primary)' }}>Live Preview</span>
                </div>
                {generating && (
                    <div className="flex items-center gap-2 text-[11px] font-medium" style={{ color: '#a78bfa' }}>
                        <Icon name="progress_activity" size={14} className="animate-spin" />
                        Generating…
                    </div>
                )}
            </div>

            {/* Paper area */}
            <div className="flex-1 overflow-y-auto p-6 flex justify-center">
                <div
                    className="w-full max-w-[680px] rounded-lg shadow-lg"
                    style={{
                        background: '#ffffff',
                        color: '#1e293b',
                        minHeight: 900,
                        padding: '48px 56px',
                        fontFamily: "'Georgia', 'Times New Roman', serif",
                        lineHeight: 1.7,
                        boxShadow: '0 4px 24px rgba(0,0,0,0.12), 0 1px 4px rgba(0,0,0,0.06)',
                        overflowWrap: 'break-word',
                        wordWrap: 'break-word',
                        wordBreak: 'break-word'
                    }}
                >
                    {!hasContent ? (
                        /* ── Blank state ── */
                        <div style={{ textAlign: 'center', paddingTop: 180 }}>
                            <div style={{
                                width: 64, height: 64, borderRadius: 16,
                                background: '#f1f5f9', display: 'flex',
                                alignItems: 'center', justifyContent: 'center',
                                margin: '0 auto 20px',
                            }}>
                                <Icon name="description" size={28} color="#94a3b8" />
                            </div>
                            <p style={{ fontSize: 15, fontWeight: 600, color: '#475569', marginBottom: 6 }}>
                                Your Policy Document
                            </p>
                            <p style={{ fontSize: 12, color: '#94a3b8', maxWidth: 280, margin: '0 auto' }}>
                                Start adding content and it will appear here as a live preview
                            </p>
                        </div>
                    ) : (
                        /* ── Document content ── */
                        <>
                            {/* Header */}
                            {header?.title && (
                                <div style={{ textAlign: 'center', marginBottom: 36, paddingBottom: 24, borderBottom: '2px solid #e2e8f0' }}>
                                    {header.organization && (
                                        <p style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 2, color: '#94a3b8', marginBottom: 8 }}>
                                            {header.organization}
                                        </p>
                                    )}
                                    <h1 style={{ fontSize: 22, fontWeight: 700, color: '#0f172a', margin: 0, lineHeight: 1.3 }}>
                                        {header.title}
                                    </h1>
                                    <div style={{ display: 'flex', justifyContent: 'center', gap: 24, marginTop: 12 }}>
                                        {header.effective_date && (
                                            <span style={{ fontSize: 10, color: '#64748b' }}>
                                                Effective: {header.effective_date}
                                            </span>
                                        )}
                                        {header.expiry_date && (
                                            <span style={{ fontSize: 10, color: '#64748b' }}>
                                                Expires: {header.expiry_date}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Collected Params (AI chat mode — progressive build) */}
                            {collectedParams && Object.keys(collectedParams).length > 0 && sections.length === 0 && (
                                <div style={{ marginBottom: 32 }}>
                                    <h2 style={{ fontSize: 16, fontWeight: 700, color: '#0f172a', marginBottom: 16, paddingBottom: 8, borderBottom: '1px solid #e2e8f0' }}>
                                        Policy Parameters
                                    </h2>
                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, tableLayout: 'fixed' }}>
                                        <tbody>
                                            {Object.entries(collectedParams).map(([key, value]) => (
                                                <tr key={key} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                                    <td style={{ padding: '8px 12px 8px 0', fontWeight: 600, color: '#475569', textTransform: 'capitalize', width: '35%', verticalAlign: 'top' }}>
                                                        {key.replace(/_/g, ' ')}
                                                    </td>
                                                    <td style={{ padding: '8px 0', color: '#1e293b' }}>
                                                        {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}

                            {/* Sections */}
                            {sections.map((section, idx) => (
                                <div key={idx} style={{ marginBottom: 32 }} className="animate-fade-in">
                                    <h2 style={{
                                        fontSize: 16, fontWeight: 700, color: '#0f172a',
                                        marginBottom: 4,
                                        display: 'flex', alignItems: 'baseline', gap: 8,
                                    }}>
                                        <span style={{ color: '#3b82f6', fontSize: 14 }}>{section.order}.</span>
                                        {section.title || 'Untitled Section'}
                                    </h2>
                                    {section.description && (
                                        <p style={{ fontSize: 12, color: '#64748b', marginBottom: 12, fontStyle: 'italic' }}>
                                            {section.description}
                                        </p>
                                    )}

                                    {/* Narrative */}
                                    {section.narrative_content && (
                                        <div style={{ fontSize: 13, color: '#334155', marginBottom: 16, whiteSpace: 'pre-wrap', overflowWrap: 'break-word', wordBreak: 'break-word' }}>
                                            {section.narrative_content}
                                        </div>
                                    )}

                                    {/* Subsections */}
                                    {section.subsections?.map((sub, si) => (
                                        <div key={si} style={{ marginLeft: 16, marginBottom: 16 }}>
                                            <h3 style={{ fontSize: 14, fontWeight: 600, color: '#1e293b', marginBottom: 8 }}>
                                                {sub.title || 'Untitled Subsection'}
                                            </h3>
                                            {sub.fields?.length > 0 && (
                                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, marginLeft: 4, tableLayout: 'fixed' }}>
                                                    <thead>
                                                        <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                                                            <th style={{ textAlign: 'left', padding: '6px 8px', color: '#64748b', fontWeight: 600, fontSize: 10, textTransform: 'uppercase', letterSpacing: 1 }}>Field</th>
                                                            <th style={{ textAlign: 'left', padding: '6px 8px', color: '#64748b', fontWeight: 600, fontSize: 10, textTransform: 'uppercase', letterSpacing: 1 }}>Type</th>
                                                            <th style={{ textAlign: 'left', padding: '6px 8px', color: '#64748b', fontWeight: 600, fontSize: 10, textTransform: 'uppercase', letterSpacing: 1 }}>Notes</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {sub.fields.map((field, fi) => (
                                                            <tr key={fi} style={{ borderBottom: '1px solid #f8fafc' }}>
                                                                <td style={{ padding: '6px 8px', color: '#1e293b', fontWeight: 500, wordWrap: 'break-word', overflowWrap: 'break-word', wordBreak: 'break-word' }}>{field.field_name}</td>
                                                                <td style={{ padding: '6px 8px', wordWrap: 'break-word', overflowWrap: 'break-word', wordBreak: 'break-word' }}>
                                                                    <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: '#f1f5f9', color: '#64748b' }}>
                                                                        {field.field_type}
                                                                    </span>
                                                                </td>
                                                                <td style={{ padding: '6px 8px', color: '#94a3b8', fontSize: 11, wordWrap: 'break-word', overflowWrap: 'break-word', wordBreak: 'break-word' }}>{field.notes || '—'}</td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            ))}

                            {/* Generating indicator at bottom */}
                            {generating && (
                                <div style={{ textAlign: 'center', paddingTop: 24, borderTop: '1px dashed #e2e8f0' }}>
                                    <div className="flex items-center justify-center gap-2" style={{ color: '#a78bfa', fontSize: 12 }}>
                                        <Icon name="auto_awesome" size={16} />
                                        AI is generating your policy structure…
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
