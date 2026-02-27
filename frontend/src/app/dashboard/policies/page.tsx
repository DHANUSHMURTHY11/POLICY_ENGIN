'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { policyAPI } from '@/lib/api';
import type { Policy, PolicyListResponse } from '@/types/policy';
import Icon from '@/components/ui/Icon';

const STATUS_COLORS: Record<string, { bg: string; text: string; border: string; label: string }> = {
    draft: { bg: 'rgba(245,158,11,0.08)', text: '#fbbf24', border: 'rgba(245,158,11,0.15)', label: 'Draft' },
    submitted: { bg: 'rgba(59,130,246,0.08)', text: '#60a5fa', border: 'rgba(59,130,246,0.15)', label: 'Submitted' },
    approved: { bg: 'rgba(16,185,129,0.08)', text: '#34d399', border: 'rgba(16,185,129,0.15)', label: 'Approved' },
    rejected: { bg: 'rgba(244,63,94,0.08)', text: '#fb7185', border: 'rgba(244,63,94,0.15)', label: 'Rejected' },
};

type StatKey = 'total' | 'draft' | 'approved' | 'rejected';

const STAT_CARDS: { key: StatKey; label: string; icon: string; gradient: string; color: string }[] = [
    { key: 'total', label: 'Total Policies', icon: 'inventory_2', gradient: 'linear-gradient(135deg, #3b82f6, #2563eb)', color: '#3b82f6' },
    { key: 'draft', label: 'Drafts', icon: 'edit_note', gradient: 'linear-gradient(135deg, #f59e0b, #d97706)', color: '#f59e0b' },
    { key: 'approved', label: 'Approved', icon: 'verified', gradient: 'linear-gradient(135deg, #10b981, #059669)', color: '#10b981' },
    { key: 'rejected', label: 'Rejected', icon: 'cancel', gradient: 'linear-gradient(135deg, #f43f5e, #e11d48)', color: '#f43f5e' },
];

export default function PoliciesPage() {
    const router = useRouter();
    const [policies, setPolicies] = useState<Policy[]>([]);
    const [loading, setLoading] = useState(true);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('');
    const [stats, setStats] = useState<Record<StatKey, number>>({ total: 0, draft: 0, approved: 0, rejected: 0 });
    const [deleting, setDeleting] = useState<string | null>(null);

    const loadPolicies = useCallback(async () => {
        setLoading(true);
        try {
            const params: Record<string, string> = { page: page.toString(), page_size: '10' };
            if (search) params.search = search;
            if (statusFilter) params.status = statusFilter;
            const res = await policyAPI.list(params);
            const data: PolicyListResponse = res.data;
            setPolicies(data.policies);
            setTotal(data.total);

            // Load stats (all policies without filter to get counts)
            const allRes = await policyAPI.list({ page: '1', page_size: '100' });
            const all = allRes.data.policies;
            setStats({
                total: all.length,
                draft: all.filter((p: Policy) => p.status === 'draft').length,
                approved: all.filter((p: Policy) => p.status === 'approved').length,
                rejected: all.filter((p: Policy) => p.status === 'rejected').length,
            });
        } catch (err) {
            console.error('Failed to load policies', err);
        } finally {
            setLoading(false);
        }
    }, [page, search, statusFilter]);

    useEffect(() => { loadPolicies(); }, [loadPolicies]);

    const handleDelete = async (id: string) => {
        if (!confirm('Delete this policy permanently?')) return;
        setDeleting(id);
        try {
            await policyAPI.delete(id);
            loadPolicies();
        } catch {
            console.error('Delete failed');
        } finally {
            setDeleting(null);
        }
    };

    const totalPages = Math.ceil(total / 10);

    return (
        <div className="p-6 animate-fade-in">
            {/* ── Header ── */}
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-xl font-bold text-white">Policies</h1>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                        Manage and create dynamic policy structures
                    </p>
                </div>
                <button
                    onClick={() => router.push('/dashboard/policies/create')}
                    className="btn-primary px-5 py-2.5 text-sm flex items-center gap-2"
                >
                    <Icon name="add" size={18} />
                    Create New Policy
                </button>
            </div>

            {/* ── Stats Cards ── */}
            <div className="grid grid-cols-4 gap-4 mb-6">
                {STAT_CARDS.map((stat) => {
                    const isActive = statusFilter === (stat.key === 'total' ? '' : stat.key);
                    return (
                        <div 
                            key={stat.key} 
                            onClick={() => {
                                setStatusFilter(stat.key === 'total' ? '' : stat.key);
                                setPage(1);
                            }}
                            className={`stat-card cursor-pointer transition-all duration-200 hover:-translate-y-1 hover:shadow-lg relative overflow-hidden ${isActive ? 'ring-2 ring-offset-2 ring-offset-[#0f1115]' : ''}`}
                            style={{ 
                                '--accent': stat.color,
                                '--tw-ring-color': stat.color,
                                background: isActive ? `color-mix(in srgb, ${stat.color} 5%, var(--bg-surface))` : undefined
                            } as React.CSSProperties}
                        >
                            <div
                                className="stat-card"
                                style={{ padding: 0, border: 'none', boxShadow: 'none', background: 'transparent' }}
                            >
                                <div className="flex items-center justify-between relative z-10">
                                    <div>
                                        <p className="text-[10px] font-semibold uppercase tracking-widest mb-1 transition-colors"
                                            style={{ color: isActive ? stat.color : 'var(--text-muted)' }}>
                                            {stat.label}
                                        </p>
                                        <p className="text-2xl font-bold" style={{ color: stat.color }}>
                                            {loading ? '–' : stats[stat.key]}
                                        </p>
                                    </div>
                                    <div
                                        className={`w-10 h-10 rounded-xl flex items-center justify-center transition-transform ${isActive ? 'scale-110' : ''}`}
                                        style={{ background: `${stat.color}12`, color: stat.color }}
                                    >
                                        <Icon name={stat.icon} size={20} filled />
                                    </div>
                                </div>
                            </div>
                            <div style={{
                                position: 'absolute', top: 0, left: 0, right: 0, height: isActive ? 4 : 2,
                                background: stat.gradient, transition: 'height 0.2s', zIndex: 0
                            }} />
                        </div>
                    );
                })}
            </div>

            {/* ── Search & Filters ── */}
            <div className="flex items-center gap-3 mb-5">
                <div className="relative flex-1 max-w-sm">
                    <Icon name="search" size={14} color="var(--text-muted)" className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                        type="text"
                        value={search}
                        onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                        className="w-full rounded-xl pl-10 pr-4 py-2.5 text-xs theme-input"
                        placeholder="Search policies..."
                    />
                </div>
                <select
                    value={statusFilter}
                    onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
                    className="rounded-xl px-4 py-2.5 text-xs theme-input cursor-pointer"
                    style={{ minWidth: 140 }}
                >
                    <option value="">All Statuses</option>
                    <option value="draft">Draft</option>
                    <option value="submitted">Submitted</option>
                    <option value="approved">Approved</option>
                    <option value="rejected">Rejected</option>
                </select>
                <div className="flex-1" />
                <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
                    {total} {total === 1 ? 'policy' : 'policies'}
                </span>
            </div>

            {/* ── Table ── */}
            <div className="theme-card overflow-hidden">
                {loading ? (
                    <div className="p-8 space-y-3">
                        {[...Array(5)].map((_, i) => (
                            <div key={i} className="skeleton h-12 w-full" />
                        ))}
                    </div>
                ) : policies.length === 0 ? (
                    <div className="empty-state py-16">
                        <div className="empty-state-icon">
                            <Icon name="policy" size={30} color="var(--accent-blue)" />
                        </div>
                        <p className="text-sm font-semibold text-white mb-1">No policies found</p>
                        <p className="text-xs max-w-xs" style={{ color: 'var(--text-muted)' }}>
                            {search || statusFilter
                                ? 'Try adjusting your search or filter criteria'
                                : 'Create your first policy to get started with the builder'}
                        </p>
                        {!search && !statusFilter && (
                            <button
                                onClick={() => router.push('/dashboard/policies/create')}
                                className="btn-primary px-5 py-2.5 text-xs mt-4 flex items-center gap-2"
                            >
                                <Icon name="add" size={14} />
                                Create First Policy
                            </button>
                        )}
                    </div>
                ) : (
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>Policy Name</th>
                                <th>Status</th>
                                <th>Version</th>
                                <th>Created</th>
                                <th>Updated</th>
                                <th style={{ width: 120 }}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {policies.map((policy) => {
                                const sc = STATUS_COLORS[policy.status] || STATUS_COLORS.draft;
                                return (
                                    <tr key={policy.id} className="group">
                                        <td>
                                            <button
                                                onClick={() => router.push(`/dashboard/policies/${policy.id}`)}
                                                className="text-left group/link"
                                            >
                                                <p className="text-sm font-semibold text-white group-hover/link:text-blue-400 transition-colors">
                                                    {policy.name}
                                                </p>
                                                {policy.description && (
                                                    <p className="text-[11px] mt-0.5 truncate max-w-xs" style={{ color: 'var(--text-muted)' }}>
                                                        {policy.description}
                                                    </p>
                                                )}
                                            </button>
                                        </td>
                                        <td>
                                            <span
                                                className="status-badge"
                                                style={{ background: sc.bg, color: sc.text, border: `1px solid ${sc.border}` }}
                                            >
                                                <span className="w-1.5 h-1.5 rounded-full" style={{ background: sc.text }} />
                                                {sc.label}
                                            </span>
                                        </td>
                                        <td>
                                            <span className="inline-flex items-center gap-1 text-xs font-mono px-2 py-0.5 rounded-md"
                                                style={{ background: 'rgba(99,102,241,0.08)', color: '#818cf8' }}>
                                                v{policy.current_version}
                                            </span>
                                        </td>
                                        <td className="text-xs">
                                            {new Date(policy.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                        </td>
                                        <td className="text-xs">
                                            {new Date(policy.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                        </td>
                                        <td>
                                            <div className="flex items-center gap-3 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button
                                                    onClick={() => router.push(`/dashboard/policies/${policy.id}?view=true`)}
                                                    className="btn-icon" title="View Document"
                                                >
                                                    <Icon name="visibility" size={14} color="var(--text-muted)" />
                                                </button>
                                                <button
                                                    onClick={() => router.push(`/dashboard/policies/${policy.id}`)}
                                                    className="btn-icon" title="Edit Builder"
                                                >
                                                    <Icon name="edit" size={14} color="var(--accent-blue)" />
                                                </button>
                                                <button
                                                    onClick={() => handleDelete(policy.id)}
                                                    disabled={deleting === policy.id}
                                                    className="btn-icon" title="Delete"
                                                >
                                                    <Icon name={deleting === policy.id ? 'progress_activity' : 'delete'} size={14} color="var(--accent-rose)" />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                )}
            </div>

            {/* ── Pagination ── */}
            {totalPages > 1 && (
                <div className="flex items-center justify-center gap-2 mt-4">
                    <button
                        onClick={() => setPage(Math.max(1, page - 1))}
                        disabled={page <= 1}
                        className="btn-ghost px-3 py-1.5 text-xs flex items-center gap-1"
                    >
                        <Icon name="chevron_left" size={14} />
                        Prev
                    </button>
                    {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                        <button
                            key={p}
                            onClick={() => setPage(p)}
                            className="w-8 h-8 rounded-lg text-xs font-semibold transition-all"
                            style={{
                                background: p === page ? 'var(--gradient-blue)' : 'transparent',
                                color: p === page ? 'white' : 'var(--text-muted)',
                                boxShadow: p === page ? 'var(--shadow-blue)' : 'none',
                            }}
                        >
                            {p}
                        </button>
                    ))}
                    <button
                        onClick={() => setPage(Math.min(totalPages, page + 1))}
                        disabled={page >= totalPages}
                        className="btn-ghost px-3 py-1.5 text-xs flex items-center gap-1"
                    >
                        Next
                        <Icon name="chevron_right" size={14} />
                    </button>
                </div>
            )}
        </div>
    );
}
