'use client';

import React, { useState } from 'react';
import type { PolicyField } from '@/types/policy';
import { FIELD_TYPES } from '@/types/policy';
import Icon from '@/components/ui/Icon';

interface FieldModalProps {
    field: PolicyField;
    onSave: (f: PolicyField) => void;
    onClose: () => void;
}

export default function FieldModal({ field: initial, onSave, onClose }: FieldModalProps) {
    const [f, setF] = useState<PolicyField>({ ...initial });
    const [valReq, setValReq] = useState(Boolean(initial.validation_rules?.required));
    const [valMin, setValMin] = useState(String(initial.validation_rules?.min ?? ''));
    const [valMax, setValMax] = useState(String(initial.validation_rules?.max ?? ''));
    const [valOpts, setValOpts] = useState(
        Array.isArray(initial.validation_rules?.options)
            ? (initial.validation_rules.options as string[]).join(', ')
            : '',
    );
    const [condJson, setCondJson] = useState(
        Object.keys(initial.conditional_logic).length
            ? JSON.stringify(initial.conditional_logic, null, 2)
            : '',
    );
    const [condErr, setCondErr] = useState('');

    const needsOpts = f.field_type === 'dropdown' || f.field_type === 'multi_select';
    const needsMinMax = ['number', 'currency', 'percentage'].includes(f.field_type);

    function save() {
        if (!f.field_name.trim()) return;
        const rules: Record<string, unknown> = {};
        if (valReq) rules.required = true;
        if (needsMinMax && valMin) rules.min = parseFloat(valMin);
        if (needsMinMax && valMax) rules.max = parseFloat(valMax);
        if (needsOpts && valOpts.trim()) {
            rules.options = valOpts.split(',').map(o => o.trim()).filter(Boolean);
        }
        let cond: Record<string, unknown> = {};
        if (condJson.trim()) {
            try { cond = JSON.parse(condJson); } catch { setCondErr('Invalid JSON'); return; }
        }
        onSave({ ...f, validation_rules: rules, conditional_logic: cond });
    }

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center"
            style={{ background: 'rgba(0,0,0,.6)' }}
            onClick={onClose}
        >
            <div className="glass-card w-full max-w-lg animate-scale-in" onClick={e => e.stopPropagation()}>
                <div style={{ height: 3, background: 'var(--gradient-violet)', borderRadius: '18px 18px 0 0' }} />
                <div className="px-6 pt-5 pb-6 max-h-[80vh] overflow-y-auto">
                    <div className="flex items-center justify-between mb-5">
                        <h3 className="text-base font-bold text-white">
                            {initial.field_name ? 'Edit Field' : 'Add New Field'}
                        </h3>
                        <button onClick={onClose} className="btn-icon">
                            <Icon name="close" size={18} color="var(--text-muted)" />
                        </button>
                    </div>

                    <div className="space-y-4">
                        {/* name */}
                        <div>
                            <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                                Field Name <span style={{ color: 'var(--accent-rose)' }}>*</span>
                            </label>
                            <input
                                type="text" value={f.field_name}
                                onChange={e => setF({ ...f, field_name: e.target.value })}
                                className="w-full rounded-xl px-4 py-2.5 text-sm theme-input"
                                placeholder="e.g. Minimum Age" autoFocus
                            />
                        </div>

                        {/* type */}
                        <div>
                            <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                                Field Type
                            </label>
                            <select
                                value={f.field_type}
                                onChange={e => setF({ ...f, field_type: e.target.value as PolicyField['field_type'] })}
                                className="w-full rounded-xl px-4 py-2.5 text-sm theme-input cursor-pointer"
                            >
                                {FIELD_TYPES.map(t => (
                                    <option key={t} value={t}>
                                        {t.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())}
                                    </option>
                                ))}
                            </select>
                        </div>

                        {/* validation */}
                        <div className="p-4 rounded-xl" style={{ background: 'rgba(59,130,246,.04)', border: '1px solid rgba(59,130,246,.08)' }}>
                            <p className="text-xs font-semibold mb-3" style={{ color: 'var(--accent-blue-light)' }}>Validation Rules</p>
                            <div className="space-y-3">
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input type="checkbox" checked={valReq} onChange={e => setValReq(e.target.checked)} className="w-4 h-4 rounded accent-blue-500" />
                                    <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>Required</span>
                                </label>
                                {needsMinMax && (
                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <label className="block text-[10px] font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>Min</label>
                                            <input type="number" value={valMin} onChange={e => setValMin(e.target.value)} className="w-full rounded-lg px-3 py-2 text-xs theme-input" placeholder="0" />
                                        </div>
                                        <div>
                                            <label className="block text-[10px] font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>Max</label>
                                            <input type="number" value={valMax} onChange={e => setValMax(e.target.value)} className="w-full rounded-lg px-3 py-2 text-xs theme-input" placeholder="100" />
                                        </div>
                                    </div>
                                )}
                                {needsOpts && (
                                    <div>
                                        <label className="block text-[10px] font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>Options (comma-separated)</label>
                                        <input type="text" value={valOpts} onChange={e => setValOpts(e.target.value)} className="w-full rounded-lg px-3 py-2 text-xs theme-input" placeholder="Option A, Option B" />
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* conditional logic */}
                        <div>
                            <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-secondary)' }}>Conditional Logic (JSON)</label>
                            <textarea
                                value={condJson}
                                onChange={e => { setCondJson(e.target.value); setCondErr(''); }}
                                className="w-full rounded-xl px-4 py-2.5 text-xs font-mono theme-input resize-none"
                                rows={3} placeholder='{"depends_on":"field_id","show_when":"value"}'
                            />
                            {condErr && <p className="text-[10px] mt-1" style={{ color: 'var(--accent-rose)' }}>{condErr}</p>}
                        </div>

                        {/* notes */}
                        <div>
                            <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-secondary)' }}>Notes</label>
                            <textarea
                                value={f.notes}
                                onChange={e => setF({ ...f, notes: e.target.value })}
                                className="w-full rounded-xl px-4 py-2.5 text-sm theme-input resize-none"
                                rows={2} placeholder="Documentation notes..."
                            />
                        </div>
                    </div>

                    <div className="flex gap-3 mt-5">
                        <button onClick={onClose} className="btn-ghost px-4 py-2.5 text-sm flex-1">Cancel</button>
                        <button onClick={save} disabled={!f.field_name.trim()} className="btn-primary px-4 py-2.5 text-sm flex-1 flex items-center justify-center gap-2">
                            <Icon name="check" size={16} />
                            {initial.field_name ? 'Update Field' : 'Add Field'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
