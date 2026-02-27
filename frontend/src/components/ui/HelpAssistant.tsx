'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Icon from './Icon';
import { helpAssistantAPI, HelpMessage, HelpChatResponse } from '@/lib/api/helpAssistant';

export function HelpAssistant() {
    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState<HelpMessage[]>([
        { role: 'assistant', content: 'Hi there! I’m the BaikalSphere guidance assistant. How can I help you use the platform today?' }
    ]);
    const [input, setInput] = useState('');
    const [isTyping, setIsTyping] = useState(false);

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const router = useRouter();

    // Auto-scroll to bottom of chat
    useEffect(() => {
        if (messagesEndRef.current) {
            messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [messages, isTyping]);

    const handleSend = async () => {
        if (!input.trim() || isTyping) return;

        const userMsg: HelpMessage = { role: 'user', content: input.trim() };
        setMessages(prev => [...prev, userMsg]);
        setInput('');
        setIsTyping(true);

        try {
            // we send the current history minus the new user msg
            const res = await helpAssistantAPI.chat({
                message: userMsg.content,
                history: messages
            });

            const data = res.data;
            const astMsg: HelpMessage = { role: 'assistant', content: data.message };

            // If there's a navigation suggestion, we can inject a special message or handle it inline
            setMessages(prev => [...prev, astMsg]);

            // Check for navigation tokens
            if (data.suggested_navigation === 'create_policy_options') {
                // We add a synthetic "system" or "action" bubble by pushing another message object 
                // but since our schema is strictly user|assistant, we handle it via a special property 
                // For simplicity, we'll append a custom tag we can parse in render: [ACTION:CREATE_OPTIONS]
                setMessages(prev => [
                    ...prev,
                    { role: 'assistant', content: '[ACTION:CREATE_OPTIONS]' }
                ]);
            }

        } catch (error) {
            console.error('Help Assistant Error:', error);
            setMessages(prev => [...prev, { role: 'assistant', content: 'Sorry, I am having trouble connecting right now. Please try again.' }]);
        } finally {
            setIsTyping(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            handleSend();
        }
    };

    const resetChat = () => {
        setMessages([{ role: 'assistant', content: 'Chat reset. How can I help you?' }]);
    };

    const handleNavigate = (path: string) => {
        setIsOpen(false);
        // We'll dispatch a custom event to collapse sidebar if implemented elsewhere, 
        // but Next.js router.push will change the page.
        router.push(path);
    };

    return (
        <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end">

            {/* Chat Panel */}
            {isOpen && (
                <div
                    className="mb-4 w-[360px] flex flex-col shadow-2xl rounded-2xl overflow-hidden transition-all duration-300 ease-out transform translate-y-0 opacity-100"
                    style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', height: '480px' }}
                >
                    {/* Header */}
                    <div className="flex items-center justify-between px-4 py-3 border-b" style={{ background: 'var(--gradient-dark)', borderColor: 'var(--border-default)' }}>
                        <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8' }}>
                                <Icon name="support_agent" size={18} />
                            </div>
                            <div>
                                <h3 className="text-sm font-semibold text-white">Guidance Assistant</h3>
                                <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Platform Help & Navigation</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-1">
                            <button onClick={resetChat} className="p-1.5 rounded-md hover:bg-white/10 transition-colors" title="Reset Chat" style={{ color: 'var(--text-muted)' }}>
                                <Icon name="refresh" size={16} />
                            </button>
                            <button onClick={() => setIsOpen(false)} className="p-1.5 rounded-md hover:bg-white/10 transition-colors" title="Close" style={{ color: 'var(--text-muted)' }}>
                                <Icon name="close" size={18} />
                            </button>
                        </div>
                    </div>

                    {/* Messages Area */}
                    <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4" style={{ background: 'var(--bg-primary)' }}>
                        {messages.map((msg, idx) => {
                            const isUser = msg.role === 'user';

                            // Handle custom action tokens
                            if (msg.content === '[ACTION:CREATE_OPTIONS]') {
                                return (
                                    <div key={idx} className="flex flex-col gap-2 w-full mt-2">
                                        <button
                                            onClick={() => handleNavigate('/dashboard/policies/create/manual')}
                                            className="w-full flex items-center justify-between px-4 py-3 rounded-xl border border-transparent transition-all hover:scale-[1.02]"
                                            style={{ background: 'rgba(56, 189, 248, 0.1)', color: '#38bdf8', border: '1px solid rgba(56, 189, 248, 0.2)' }}
                                        >
                                            <span className="text-sm font-medium">Create Manual Policy</span>
                                            <Icon name="edit_document" size={16} />
                                        </button>
                                        <button
                                            onClick={() => handleNavigate('/dashboard/policies/create/chat')}
                                            className="w-full flex items-center justify-between px-4 py-3 rounded-xl border border-transparent transition-all hover:scale-[1.02]"
                                            style={{ background: 'rgba(168, 85, 247, 0.1)', color: '#a855f7', border: '1px solid rgba(168, 85, 247, 0.2)' }}
                                        >
                                            <span className="text-sm font-medium">Generate Policy with AI</span>
                                            <Icon name="auto_awesome" size={16} />
                                        </button>
                                    </div>
                                );
                            }

                            return (
                                <div key={idx} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
                                    {/* Bot avatar for assistant messages */}
                                    {!isUser && (
                                        <div className="w-8 h-8 rounded-full flex items-center justify-center mr-2 flex-shrink-0" style={{ background: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8' }}>
                                            <Icon name="smart_toy" size={16} />
                                        </div>
                                    )}
                                    <div
                                        className={`max-w-[75%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${isUser ? 'rounded-br-sm' : 'rounded-bl-sm'}`}
                                        style={isUser ? {
                                            background: 'var(--gradient-blue)',
                                            color: '#fff',
                                            boxShadow: 'var(--shadow-blue)'
                                        } : {
                                            background: 'var(--bg-secondary)',
                                            color: 'var(--text-secondary)',
                                            border: '1px solid var(--border-default)'
                                        }}
                                    >
                                        {msg.content}
                                    </div>
                                </div>
                            );
                        })}
                        {isTyping && (
                            <div className="flex justify-start">
                                <div className="max-w-[85%] rounded-2xl rounded-bl-sm px-4 py-3 border flex items-center gap-1.5" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-default)' }}>
                                    <div className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: '0ms' }}></div>
                                    <div className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: '150ms' }}></div>
                                    <div className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: '300ms' }}></div>
                                </div>
                            </div>
                        )}
                        <div ref={messagesEndRef} />
                    </div>

                    {/* Input Area */}
                    <div className="p-3 border-t" style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-default)' }}>
                        <div className="relative flex items-center w-full">
                            <input
                                type="text"
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                onKeyDown={handleKeyDown}
                                placeholder="Ask for guidance..."
                                className="w-full bg-transparent text-sm pl-4 pr-10 py-2.5 rounded-xl border focus:outline-none transition-colors"
                                style={{
                                    color: 'var(--text-primary)',
                                    borderColor: 'var(--border-strong)',
                                    background: 'var(--bg-primary)'
                                }}
                                disabled={isTyping}
                            />
                            <button
                                onClick={handleSend}
                                disabled={!input.trim() || isTyping}
                                className="absolute right-2 p-1.5 rounded-lg flex items-center justify-center transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                style={{ background: input.trim() ? 'var(--gradient-blue)' : 'transparent', color: input.trim() ? '#fff' : 'var(--text-muted)' }}
                            >
                                <Icon name="send" size={16} />
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Floating Button */}
            <button
                onClick={() => setIsOpen(!isOpen)}
                className={`w-14 h-14 rounded-full shadow-2xl flex items-center justify-center transition-all duration-300 hover:scale-105 ${isOpen ? 'rotate-90 scale-90 opacity-0' : 'rotate-0 scale-100 opacity-100'}`}
                style={{ background: 'var(--gradient-blue)', color: '#fff', boxShadow: '0 8px 32px rgba(56, 189, 248, 0.4)' }}
                title="Guidance Assistant"
            >
                <Icon name="smart_toy" size={28} />
            </button>

            {/* If open, the floating button actually morphs into the close button conceptually, 
                but we put the close button inside the header instead. To keep a button there 
                for strict toggling: */}
            {isOpen && (
                <button
                    onClick={() => setIsOpen(false)}
                    className="absolute bottom-0 right-0 w-14 h-14 rounded-full shadow-xl flex items-center justify-center transition-all duration-300 hover:scale-105"
                    style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border-default)' }}
                >
                    <Icon name="close" size={24} />
                </button>
            )}

        </div>
    );
}
