'use client';

import React, { createContext, useContext, useState, useCallback, useRef, ReactNode } from 'react';
import type { AICallMetadata } from '@/types/policy';

/* ─── Types ──────────────────────────────────────────────────────── */

export type AIStatus = 'idle' | 'loading' | 'success' | 'error';

interface AIState {
    status: AIStatus;
    providerUsed: string | null;
    modelUsed: string | null;
    lastCallDuration: number | null;
    lastTokenUsage: number | null;
    lastError: string | null;
    executionLog: AICallMetadata[];
    isDrawerOpen: boolean;
}

interface AIContextType extends AIState {
    /** Wrap an async AI operation to auto-track status, duration, and log the call */
    trackAICall: <T>(
        operation: string,
        fn: () => Promise<T>,
    ) => Promise<T>;
    addLogEntry: (entry: AICallMetadata) => void;
    clearError: () => void;
    clearLog: () => void;
    setDrawerOpen: (open: boolean) => void;
}

const AIContext = createContext<AIContextType | undefined>(undefined);

/* ─── Provider ───────────────────────────────────────────────────── */

export function AIProvider({ children }: { children: ReactNode }) {
    const [state, setState] = useState<AIState>({
        status: 'idle',
        providerUsed: null,
        modelUsed: null,
        lastCallDuration: null,
        lastTokenUsage: null,
        lastError: null,
        executionLog: [],
        isDrawerOpen: false,
    });

    const startRef = useRef<number>(0);

    const addLogEntry = useCallback((entry: AICallMetadata) => {
        setState(prev => ({
            ...prev,
            executionLog: [entry, ...prev.executionLog].slice(0, 50), // keep last 50
            providerUsed: entry.provider,
            modelUsed: entry.model,
            lastCallDuration: entry.duration_ms,
            lastTokenUsage: entry.tokens,
            lastError: entry.error || null,
            status: entry.success ? 'success' : 'error',
        }));
    }, []);

    const trackAICall = useCallback(async <T,>(
        operation: string,
        fn: () => Promise<T>,
    ): Promise<T> => {
        startRef.current = Date.now();
        setState(prev => ({ ...prev, status: 'loading', lastError: null }));

        try {
            const result = await fn();
            const duration = Date.now() - startRef.current;
            const entry: AICallMetadata = {
                provider: state.providerUsed || 'unknown',
                model: state.modelUsed || 'unknown',
                duration_ms: duration,
                tokens: 0,
                operation,
                timestamp: new Date().toISOString(),
                success: true,
            };
            addLogEntry(entry);
            return result;
        } catch (err) {
            const duration = Date.now() - startRef.current;
            const errorMsg = err instanceof Error ? err.message : 'Unknown error';
            const entry: AICallMetadata = {
                provider: state.providerUsed || 'unknown',
                model: state.modelUsed || 'unknown',
                duration_ms: duration,
                tokens: 0,
                operation,
                timestamp: new Date().toISOString(),
                success: false,
                error: errorMsg,
            };
            addLogEntry(entry);
            throw err;
        }
    }, [state.providerUsed, state.modelUsed, addLogEntry]);

    const clearError = useCallback(() => {
        setState(prev => ({ ...prev, lastError: null, status: 'idle' }));
    }, []);

    const clearLog = useCallback(() => {
        setState(prev => ({ ...prev, executionLog: [] }));
    }, []);

    const setDrawerOpen = useCallback((open: boolean) => {
        setState(prev => ({ ...prev, isDrawerOpen: open }));
    }, []);

    return (
        <AIContext.Provider
            value={{
                ...state,
                trackAICall,
                addLogEntry,
                clearError,
                clearLog,
                setDrawerOpen,
            }}
        >
            {children}
        </AIContext.Provider>
    );
}

/* ─── Hook ───────────────────────────────────────────────────────── */

export function useAI() {
    const ctx = useContext(AIContext);
    if (!ctx) throw new Error('useAI must be used inside AIProvider');
    return ctx;
}
