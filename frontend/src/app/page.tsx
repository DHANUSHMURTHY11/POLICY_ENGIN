'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Icon from '@/components/ui/Icon';

export default function HomePage() {
    const router = useRouter();
    useEffect(() => {
        const token = localStorage.getItem('access_token');
        router.replace(token ? '/dashboard/policies' : '/login');
    }, [router]);

    return (
        <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg-primary)' }}>
            <Icon name="progress_activity" size={36} color="var(--accent-blue)" className="animate-spin" />
        </div>
    );
}
