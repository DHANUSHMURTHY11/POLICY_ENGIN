import api from '../api';

export interface HelpMessage {
    role: 'user' | 'assistant';
    content: string;
}

export interface HelpChatRequest {
    message: string;
    history?: HelpMessage[];
}

export interface HelpChatResponse {
    message: string;
    suggested_navigation?: 'create_policy_options' | null;
    ai_provider: string;
    ai_model: string;
}

export const helpAssistantAPI = {
    chat: (data: HelpChatRequest) => api.post<HelpChatResponse>('/help-assistant/chat', data),
};
