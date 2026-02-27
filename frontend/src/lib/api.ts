/**
 * Axios API client with JWT interceptor.
 * All policy engine API methods in one place.
 */
import axios, { AxiosInstance } from 'axios';
import type {
    PolicyCreateRequest,
    PolicyUpdateRequest,
    PolicyListResponse,
    PolicyDetail,
    ManualStructureRequest,
    AIStructureRequest,
    StructureResponse,
    AIValidationResult,
    AuthResponse,
    LoginRequest,
} from '@/types/policy';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

const api: AxiosInstance = axios.create({
    baseURL: `${API_BASE}/api`,
    headers: { 'Content-Type': 'application/json' },
    timeout: 30000,
});

// ── JWT Interceptor ──────────────────────────────────────────────
api.interceptors.request.use((config) => {
    if (typeof window !== 'undefined') {
        const token = localStorage.getItem('access_token');
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }
    }
    return config;
});

api.interceptors.response.use(
    (response) => response,
    (error) => {
        if (error.response?.status === 401 && typeof window !== 'undefined') {
            localStorage.removeItem('access_token');
            localStorage.removeItem('user');
            window.location.href = '/login';
        }
        return Promise.reject(error);
    }
);

// ── Auth API ─────────────────────────────────────────────────────
export const authAPI = {
    login: (data: LoginRequest) =>
        api.post<AuthResponse>('/auth/login', data),

    register: (data: { email: string; password: string; full_name: string }) =>
        api.post('/auth/register', data),

    me: () => api.get('/auth/me'),
};

// ── Policy API ───────────────────────────────────────────────────
export const policyAPI = {
    create: (data: PolicyCreateRequest) =>
        api.post<PolicyDetail>('/policies', data),

    list: (params?: Record<string, string>) =>
        api.get<PolicyListResponse>('/policies', { params }),

    get: (id: string) =>
        api.get<PolicyDetail>(`/policies/${id}`),

    update: (id: string, data: PolicyUpdateRequest) =>
        api.put(`/policies/${id}`, data),

    delete: (id: string) =>
        api.delete(`/policies/${id}`),

    saveManualStructure: (id: string, data: ManualStructureRequest) =>
        api.post<StructureResponse>(`/policies/${id}/structure/manual`, data),

    generateAIStructure: (id: string, data: AIStructureRequest) =>
        api.post<StructureResponse>(`/policies/${id}/structure/ai`, data),

    validateStructure: (id: string, data: ManualStructureRequest) =>
        api.post<AIValidationResult>(`/policies/${id}/structure/validate`, data),

    enhanceStructure: (id: string, data: { instruction: string }) =>
        api.post<StructureResponse>(`/policies/${id}/structure/enhance`, data),

    rewriteSection: (id: string, data: {
        section_id: string;
        action: string;
        current_content?: string;
        section_title?: string;
        section_description?: string;
        tone?: string;
    }) => api.post(`/policies/${id}/rewrite-section`, data),
};

// ── Document Composer API ────────────────────────────────────────
export const documentAPI = {
    generateWord: (id: string) =>
        api.post(`/documents/${id}/word`, {}, { responseType: 'blob' }),

    generatePDF: (id: string) =>
        api.post(`/documents/${id}/pdf`, {}, { responseType: 'blob' }),

    generateJSON: (id: string) =>
        api.post(`/documents/${id}/json`, {}, { responseType: 'blob' }),

    enhanceStructure: (id: string, instruction: string) =>
        api.post(`/documents/${id}/enhance`, { instruction }),
};

// ── Workflow API ─────────────────────────────────────────────────
export const workflowAPI = {
    // Template CRUD
    createTemplate: (data: { name: string; type: string; levels: { level_number: number; role_id: string; role_name?: string; is_parallel: boolean }[] }) =>
        api.post('/workflow/templates', data),

    listTemplates: () =>
        api.get('/workflow/templates'),

    getTemplate: (id: string) =>
        api.get(`/workflow/templates/${id}`),

    deleteTemplate: (id: string) =>
        api.delete(`/workflow/templates/${id}`),

    // Submit / Approve / Reject
    submit: (policyId: string, templateId: string, comments?: string) =>
        api.post(`/workflow/${policyId}/submit`, { template_id: templateId, comments }),

    approve: (instanceId: string, comments?: string) =>
        api.post(`/workflow/instances/${instanceId}/approve`, { comments }),

    reject: (instanceId: string, comments?: string) =>
        api.post(`/workflow/instances/${instanceId}/reject`, { comments }),

    // Status & Queue
    getStatus: (policyId: string) =>
        api.get(`/workflow/${policyId}/status`),

    getQueue: () =>
        api.get('/workflow/queue'),

    // Roles
    getRoles: () =>
        api.get('/workflow/roles'),

    // AI-powered endpoints
    getApprovalSummary: (policyId: string) =>
        api.get(`/workflow/${policyId}/approval-summary`),

    createTemplateNatural: (description: string) =>
        api.post('/workflow/templates/natural', { description }),

    validateTemplate: (data: { name: string; type: string; levels: { level_number: number; role_id: string; role_name?: string; is_parallel: boolean }[] }) =>
        api.post('/workflow/templates/validate', data),
};
// ── Version API ──────────────────────────────────────────────────
export const versionAPI = {
    list: (policyId: string) =>
        api.get(`/versioning/policies/${policyId}/versions`),

    get: (policyId: string, versionNumber: number) =>
        api.get(`/versioning/policies/${policyId}/versions/${versionNumber}`),

    compare: (policyId: string, base: number, compare: number) =>
        api.get(`/versioning/policies/${policyId}/versions/compare`, { params: { base, compare } }),

    create: (policyId: string, changeSummary?: string) =>
        api.post(`/versioning/policies/${policyId}/versions`, { change_summary: changeSummary || '' }),

    lock: (policyId: string, versionNumber: number) =>
        api.post(`/versioning/policies/${policyId}/versions/${versionNumber}/lock`),

    rollback: (policyId: string, versionNumber: number) =>
        api.post(`/versioning/policies/${policyId}/versions/${versionNumber}/rollback`),

    aiDiff: (policyId: string, base: number, compare: number) =>
        api.get(`/versioning/policies/${policyId}/versions/ai-diff`, { params: { base, compare } }),
};
// ── Audit API ────────────────────────────────────────────────────
export const auditAPI = {
    list: (params?: Record<string, string>) =>
        api.get('/audit', { params }),
};
// ── AI Provider API ──────────────────────────────────────────────
export const aiAPI = {
    getProviderInfo: () =>
        api.get<{ provider: string; model: string; strict_mode: boolean }>('/ai/provider-info'),
};
// ── Query Runtime API ────────────────────────────────────────────
export const queryAPI = {
    execute: (policyId: string, data: { user_query: string; structured_inputs: Record<string, any> }) =>
        api.post(`/query/policies/${policyId}/query`, data),
};
// ── Chat API ─────────────────────────────────────────────────────
export const chatAPI = {
    sendMessage: (data: { session_id?: string; message: string; policy_id?: string }) =>
        api.post('/ai/chat', data),

    generate: (data: { session_id: string; policy_id?: string; policy_name: string; policy_description?: string; tone?: string }) =>
        api.post(`/ai/generate-structure`, data),

    getSession: (sessionId: string) =>
        api.get(`/ai/chat/${sessionId}`),
};

// ── Help Assistant API ───────────────────────────────────────────
export { helpAssistantAPI } from './api/helpAssistant';

export default api;
