'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Icon from '@/components/ui/Icon';
import FileUpload from '@/components/ui/FileUpload';

export default function CreatePolicyPage() {
    const router = useRouter();
    const [manualFiles, setManualFiles] = useState<File[]>([]);
    const [aiFiles, setAiFiles] = useState<File[]>([]);

    return (
        <div className="min-h-[calc(100vh-64px)] flex items-center justify-center p-6">
            <div className="w-full max-w-3xl animate-scale-in">
                {/* Header */}
                <div className="flex items-center gap-3 mb-8">
                    <button onClick={() => router.push('/dashboard/policies')} className="btn-icon">
                        <Icon name="arrow_back" size={18} color="var(--text-muted)" />
                    </button>
                    <div>
                        <h1 className="text-xl font-bold text-white">Create New Policy</h1>
                        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                            Choose how you want to create your policy
                        </p>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    {/* ── Manual Builder (Left) ── */}
                    <div className="text-left group">
                        <div className="glass-card overflow-hidden transition-all duration-300 hover:scale-[1.02]"
                            style={{ border: '1px solid rgba(96,165,250,0.2)' }}>
                            <div style={{ height: 3, background: 'var(--gradient-blue)' }} />
                            <div className="p-6">
                                <div className="flex items-center gap-3 mb-4">
                                    <div style={{
                                        width: 44, height: 44, borderRadius: 12,
                                        background: 'var(--gradient-blue)',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    }}>
                                        <Icon name="construction" size={22} color="white" />
                                    </div>
                                    <div>
                                        <h2 className="text-base font-bold text-white">Manual Builder</h2>
                                        <span className="text-[10px] px-2 py-0.5 rounded font-semibold"
                                            style={{ background: 'rgba(96,165,250,0.15)', color: '#60a5fa' }}>
                                            FULL CONTROL
                                        </span>
                                    </div>
                                </div>
                                <p className="text-xs leading-relaxed mb-4" style={{ color: 'var(--text-secondary)' }}>
                                    Create a policy manually using the visual structure builder. Add sections,
                                    subsections, and fields by hand with a live document preview.
                                </p>
                                <div className="flex flex-wrap gap-1.5 mb-4">
                                    {['Visual builder', 'Live preview', 'Sections & Fields'].map((tag) => (
                                        <span key={tag} className="text-[10px] px-2 py-1 rounded-md"
                                            style={{ background: 'rgba(96,165,250,0.08)', color: '#93c5fd' }}>
                                            {tag}
                                        </span>
                                    ))}
                                </div>

                                {/* File Upload Zone */}
                                <div className="mb-4">
                                    <label className="block text-[10px] font-semibold mb-1.5 flex items-center gap-1"
                                        style={{ color: 'var(--text-muted)' }}>
                                        <Icon name="attach_file" size={12} />
                                        Attach Reference Documents (optional)
                                    </label>
                                    <FileUpload files={manualFiles} onChange={setManualFiles} />
                                </div>

                                <button
                                    onClick={() => router.push('/dashboard/policies/create/manual')}
                                    className="btn-primary w-full py-3 text-sm font-semibold rounded-xl flex items-center justify-center gap-2"
                                >
                                    <Icon name="construction" size={16} />
                                    Create Manually
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* ── AI Chat Creator (Right) ── */}
                    <div className="text-left group">
                        <div className="glass-card overflow-hidden transition-all duration-300 hover:scale-[1.02]"
                            style={{ border: '1px solid rgba(139,92,246,0.2)' }}>
                            <div style={{ height: 3, background: 'var(--gradient-violet)' }} />
                            <div className="p-6">
                                <div className="flex items-center gap-3 mb-4">
                                    <div style={{
                                        width: 44, height: 44, borderRadius: 12,
                                        background: 'var(--gradient-violet)',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    }}>
                                        <Icon name="smart_toy" size={22} color="white" />
                                    </div>
                                    <div>
                                        <h2 className="text-base font-bold text-white">AI Chat Creator</h2>
                                        <span className="text-[10px] px-2 py-0.5 rounded font-semibold"
                                            style={{ background: 'rgba(139,92,246,0.15)', color: '#a78bfa' }}>
                                            RECOMMENDED
                                        </span>
                                    </div>
                                </div>
                                <p className="text-xs leading-relaxed mb-4" style={{ color: 'var(--text-secondary)' }}>
                                    Describe your policy in natural language. The AI assistant will ask
                                    you step-by-step questions, collect parameters, and generate a complete
                                    policy structure with narratives and rules.
                                </p>
                                <div className="flex flex-wrap gap-1.5 mb-4">
                                    {['Conversational', 'Step-by-step', 'AI-generated'].map((tag) => (
                                        <span key={tag} className="text-[10px] px-2 py-1 rounded-md"
                                            style={{ background: 'rgba(139,92,246,0.08)', color: '#c4b5fd' }}>
                                            {tag}
                                        </span>
                                    ))}
                                </div>

                                {/* File Upload Zone */}
                                <div className="mb-4">
                                    <label className="block text-[10px] font-semibold mb-1.5 flex items-center gap-1"
                                        style={{ color: 'var(--text-muted)' }}>
                                        <Icon name="attach_file" size={12} />
                                        Attach Reference Documents (optional)
                                    </label>
                                    <FileUpload files={aiFiles} onChange={setAiFiles} />
                                </div>

                                <button
                                    onClick={() => router.push('/dashboard/policies/create/chat')}
                                    className="btn-primary w-full py-3 text-sm font-semibold rounded-xl flex items-center justify-center gap-2"
                                    style={{ background: 'var(--gradient-violet)' }}
                                >
                                    <Icon name="smart_toy" size={16} />
                                    Generate with AI
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
