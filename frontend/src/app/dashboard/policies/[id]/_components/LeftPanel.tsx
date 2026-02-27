'use client';

import React, { useRef } from 'react';
import type { Section } from '@/types/policy';
import Icon from '@/components/ui/Icon';

interface LeftPanelProps {
    sections: Section[];
    selectedId: string | null;
    onSelect: (id: string) => void;
    onAdd: () => void;
    onDelete: (id: string) => void;
    onReorder: (from: number, to: number) => void;
}

export default function LeftPanel({
    sections,
    selectedId,
    onSelect,
    onAdd,
    onDelete,
    onReorder,
}: LeftPanelProps) {
    const dragFrom = useRef<number | null>(null);
    const dragTo = useRef<number | null>(null);

    return (
        <aside className="flex flex-col flex-shrink-0 border-r overflow-hidden" style={{ width: 280, background: 'var(--bg-secondary)', borderColor: 'var(--border-default)' }}>
            <div className="panel-header">
                <Icon name="account_tree" size={14} color="var(--accent-blue)" />
                <span className="text-xs font-bold text-white flex-1">Sections</span>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded" style={{ background: 'rgba(59,130,246,.08)', color: '#60a5fa' }}>{sections.length}</span>
            </div>

            <div className="flex-1 overflow-y-auto px-2 py-2 space-y-1">
                {sections.length === 0 ? (
                    <div className="flex items-center justify-center py-8">
                        <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>Add a section to get started</p>
                    </div>
                ) : (
                    sections.map((sec, idx) => {
                        const sel = sec.id === selectedId;
                        return (
                            <div
                                key={sec.id} draggable
                                onDragStart={() => { dragFrom.current = idx; }}
                                onDragEnter={() => { dragTo.current = idx; }}
                                onDragEnd={() => {
                                    if (dragFrom.current !== null && dragTo.current !== null && dragFrom.current !== dragTo.current)
                                        onReorder(dragFrom.current, dragTo.current);
                                    dragFrom.current = null;
                                    dragTo.current = null;
                                }}
                                onDragOver={e => e.preventDefault()}
                                onClick={() => onSelect(sec.id)}
                                className="drag-item flex items-center gap-2 px-3 py-2.5 rounded-xl cursor-pointer group transition-all"
                                style={{
                                    background: sel ? 'rgba(59,130,246,.08)' : 'transparent',
                                    border: sel ? '1px solid rgba(59,130,246,.15)' : '1px solid transparent',
                                }}
                            >
                                <Icon name="drag_indicator" size={12} color="var(--text-muted)" className="cursor-grab opacity-30 group-hover:opacity-60" />
                                <span className="w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-bold flex-shrink-0" style={{ background: sel ? 'rgba(59,130,246,.15)' : 'rgba(255,255,255,.04)', color: sel ? '#60a5fa' : 'var(--text-muted)' }}>{sec.order}</span>
                                <span className="text-xs font-medium truncate flex-1" style={{ color: sel ? '#60a5fa' : 'var(--text-secondary)' }}>{sec.title || 'Untitled Section'}</span>
                                <button onClick={e => { e.stopPropagation(); onDelete(sec.id); }} className="btn-icon opacity-0 group-hover:opacity-100" style={{ width: 24, height: 24 }} title="Delete section">
                                    <Icon name="close" size={12} color="var(--accent-rose)" />
                                </button>
                            </div>
                        );
                    })
                )}
            </div>

            <div className="p-2 border-t" style={{ borderColor: 'var(--border-default)' }}>
                <button onClick={onAdd} className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-semibold transition-all" style={{ background: 'rgba(59,130,246,.06)', color: '#60a5fa', border: '1px dashed rgba(59,130,246,.2)' }}>
                    <Icon name="add" size={14} />Add Section
                </button>
            </div>
        </aside>
    );
}
