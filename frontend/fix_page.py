import sys
import re

filepath = r"d:\POLICY_ENGIN\frontend\src\app\dashboard\policies\page.tsx"

with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Fix stat cards
old_cards = """                {STAT_CARDS.map((stat) => (
                    <div key={stat.key} className="stat-card" style={{ '--accent': stat.color } as React.CSSProperties}>
                        <div
                            className="stat-card"
                            style={{ padding: 0, border: 'none', boxShadow: 'none', background: 'transparent' }}
                        >
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-[10px] font-semibold uppercase tracking-widest mb-1"
                                        style={{ color: 'var(--text-muted)' }}>
                                        {stat.label}
                                    </p>
                                    <p className="text-2xl font-bold" style={{ color: stat.color }}>
                                        {loading ? '–' : stats[stat.key]}
                                    </p>
                                </div>
                                <div
                                    className="w-10 h-10 rounded-xl flex items-center justify-center"
                                    style={{ background: `${stat.color}12`, color: stat.color }}
                                >
                                    <Icon name={stat.icon} size={20} filled />
                                </div>
                            </div>
                        </div>
                        <div style={{
                            position: 'absolute', top: 0, left: 0, right: 0, height: 2,
                            background: stat.gradient, borderRadius: '14px 14px 0 0',
                        }} />
                    </div>
                ))}"""

new_cards = """                {STAT_CARDS.map((stat) => {
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
                })}"""

if old_cards in content:
    content = content.replace(old_cards, new_cards)
    print("Replaced cards successfully.")
else:
    print("Could not find old cards block.")

# 2. Fix actions
old_actions = """                                            <div className="flex items-center gap-3 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button
                                                    onClick={() => router.push(`/dashboard/policies/${policy.id}`)}
                                                    className="btn-icon" title="Open Builder"
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
                                            </div>"""

new_actions = """                                            <div className="flex items-center gap-3 opacity-0 group-hover:opacity-100 transition-opacity">
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
                                            </div>"""

if old_actions in content:
    content = content.replace(old_actions, new_actions)
    print("Replaced actions successfully.")
else:
    print("Could not find old actions block.")

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(content)
