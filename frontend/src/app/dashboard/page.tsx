'use client';

import { useRouter } from 'next/navigation';
import Icon from '@/components/ui/Icon';

export default function DashboardHome() {
    const router = useRouter();
    return (
        <div>
            <h1 className="text-xl font-bold text-white mb-2">Dashboard</h1>
            <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>Welcome to BaikalSphere Policy Engine</p>
            <button
                onClick={() => router.push('/dashboard/policies')}
                className="btn-primary px-5 py-3 text-sm flex items-center gap-2"
            >
                <Icon name="policy" size={18} color="#fff" />
                Go to Policies
            </button>
        </div>
    );
}
