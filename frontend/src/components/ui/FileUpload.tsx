'use client';

import React, { useRef, useState, useCallback } from 'react';
import Icon from '@/components/ui/Icon';

interface FileUploadProps {
    files: File[];
    onChange: (files: File[]) => void;
    accept?: string;
    maxFiles?: number;
    compact?: boolean; // compact mode for chat attachment
}

export default function FileUpload({ files, onChange, accept = '.pdf,.docx,.xlsx', maxFiles = 5, compact = false }: FileUploadProps) {
    const inputRef = useRef<HTMLInputElement>(null);
    const [dragOver, setDragOver] = useState(false);
    const [uploadSuccess, setUploadSuccess] = useState(false);

    const addFiles = useCallback((newFiles: FileList | null) => {
        if (!newFiles || newFiles.length === 0) return;
        const combined = [...files, ...Array.from(newFiles)].slice(0, maxFiles);
        onChange(combined);
        // Show upload success flash
        setUploadSuccess(true);
        setTimeout(() => setUploadSuccess(false), 2000);
    }, [files, maxFiles, onChange]);

    const removeFile = (index: number) => {
        onChange(files.filter((_, i) => i !== index));
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setDragOver(false);
        addFiles(e.dataTransfer.files);
    };

    const fileIcon = (name: string) => {
        if (name.endsWith('.pdf')) return 'picture_as_pdf';
        if (name.endsWith('.docx') || name.endsWith('.doc')) return 'article';
        if (name.endsWith('.xlsx') || name.endsWith('.xls')) return 'description';
        return 'attach_file';
    };

    const fileColor = (name: string) => {
        if (name.endsWith('.pdf')) return '#ef4444';
        if (name.endsWith('.docx') || name.endsWith('.doc')) return '#3b82f6';
        if (name.endsWith('.xlsx') || name.endsWith('.xls')) return '#10b981';
        return '#94a3b8';
    };

    // Compact mode — animated paperclip button for chat input
    if (compact) {
        return (
            <>
                <button
                    type="button"
                    onClick={() => inputRef.current?.click()}
                    className="relative w-10 h-10 rounded-xl flex items-center justify-center transition-all"
                    style={{
                        background: 'rgba(139,92,246,0.06)',
                        border: '1px solid rgba(139,92,246,0.15)',
                    }}
                    title="Attach file"
                >
                    <Icon name="attach_file" size={18} color="#a78bfa" />
                    {/* Pulse ring animation */}
                    <span
                        className="absolute inset-0 rounded-xl animate-pulse-glow-purple"
                        style={{ border: '1px solid rgba(167,139,250,0.4)' }}
                    />
                    {/* Upload success flash */}
                    {uploadSuccess && (
                        <span
                            className="absolute inset-0 rounded-xl animate-fade-in"
                            style={{
                                background: 'rgba(52,211,153,0.15)',
                                border: '2px solid rgba(52,211,153,0.4)',
                            }}
                        />
                    )}
                </button>
                <input ref={inputRef} type="file" accept={accept} onChange={e => addFiles(e.target.files)} className="hidden" multiple />

                {/* File chips */}
                {files.length > 0 && (
                    <div className="flex gap-1.5 flex-wrap">
                        {files.map((f, i) => (
                            <span key={i} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-medium animate-scale-in"
                                style={{ background: 'rgba(139,92,246,0.08)', color: '#c4b5fd', border: '1px solid rgba(139,92,246,0.15)' }}>
                                <Icon name={fileIcon(f.name)} size={12} color={fileColor(f.name)} />
                                <span className="max-w-[100px] truncate">{f.name}</span>
                                <button onClick={() => removeFile(i)} className="hover:text-white transition-colors" style={{ lineHeight: 1 }}>
                                    <Icon name="close" size={10} />
                                </button>
                            </span>
                        ))}
                    </div>
                )}
            </>
        );
    }

    // Full mode — drop zone + file list
    return (
        <div className="space-y-3">
            <div
                onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => inputRef.current?.click()}
                className="flex flex-col items-center justify-center gap-2 py-6 px-4 rounded-xl cursor-pointer transition-all hover:scale-[1.01]"
                style={{
                    background: uploadSuccess
                        ? 'rgba(52,211,153,0.08)'
                        : dragOver
                            ? 'rgba(59,130,246,0.08)'
                            : 'rgba(255,255,255,0.01)',
                    border: `2px dashed ${uploadSuccess
                        ? 'rgba(52,211,153,0.5)'
                        : dragOver
                            ? 'rgba(59,130,246,0.5)'
                            : 'var(--border-default)'}`,
                    boxShadow: dragOver ? '0 0 20px rgba(59,130,246,0.12)' : uploadSuccess ? '0 0 20px rgba(52,211,153,0.12)' : 'none',
                    transition: 'all 0.3s ease',
                }}
            >
                <div className="w-10 h-10 rounded-xl flex items-center justify-center transition-transform"
                    style={{
                        background: uploadSuccess
                            ? 'rgba(52,211,153,0.15)'
                            : dragOver
                                ? 'rgba(59,130,246,0.15)'
                                : 'rgba(59,130,246,0.08)',
                        transform: dragOver ? 'scale(1.1)' : 'scale(1)',
                    }}>
                    {uploadSuccess ? (
                        <Icon name="check_circle" size={22} color="#34d399" />
                    ) : (
                        <Icon name="cloud_upload" size={22} color="#60a5fa" />
                    )}
                </div>
                <p className="text-xs font-medium" style={{ color: uploadSuccess ? '#34d399' : 'var(--text-secondary)' }}>
                    {uploadSuccess
                        ? 'Files attached successfully!'
                        : <>Drag & drop files here, or <span style={{ color: '#60a5fa' }}>browse</span></>}
                </p>
                <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                    PDF, DOCX, XLSX • Max {maxFiles} files
                </p>
            </div>
            <input ref={inputRef} type="file" accept={accept} onChange={e => addFiles(e.target.files)} className="hidden" multiple />

            {/* File chips */}
            {files.length > 0 && (
                <div className="flex gap-2 flex-wrap">
                    {files.map((f, i) => (
                        <div key={i} className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium animate-scale-in"
                            style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)' }}>
                            <Icon name={fileIcon(f.name)} size={16} color={fileColor(f.name)} />
                            <span className="max-w-[160px] truncate" style={{ color: 'var(--text-primary)' }}>{f.name}</span>
                            <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                                {(f.size / 1024).toFixed(0)}KB
                            </span>
                            <button onClick={(e) => { e.stopPropagation(); removeFile(i); }}
                                className="w-5 h-5 rounded flex items-center justify-center transition-all hover:bg-red-500/10"
                                style={{ color: 'var(--text-muted)' }}>
                                <Icon name="close" size={12} />
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
