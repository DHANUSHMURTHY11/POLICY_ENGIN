/**
 * TypeScript type definitions for the Policy Engine.
 * Mirrors backend Pydantic schemas exactly.
 */

// ── Field Types ──────────────────────────────────────────────────
export const FIELD_TYPES = [
    'text', 'number', 'dropdown', 'multi_select', 'date',
    'boolean', 'textarea', 'email', 'phone', 'currency', 'percentage',
] as const;

export type FieldType = (typeof FIELD_TYPES)[number];

// ── Document Structure ───────────────────────────────────────────

export interface PolicyField {
    id: string;
    field_name: string;
    field_type: FieldType;
    validation_rules: Record<string, unknown>;
    conditional_logic: Record<string, unknown>;
    notes: string;
    display_label?: string;
    rule_description?: string;
    _aiSource?: 'ai' | 'manual' | 'enhanced';
}

export interface Subsection {
    id: string;
    title: string;
    order: number;
    fields: PolicyField[];
}

export interface Section {
    id: string;
    title: string;
    description: string;
    order: number;
    subsections: Subsection[];
    // Narrative / Hybrid fields
    narrative_content?: string;
    ai_generated?: boolean;
    tone?: string;         // formal | regulatory | internal | customer_facing
    communication_style?: string;
    _aiSource?: 'ai' | 'manual' | 'enhanced';
}

export interface VersionControlEntry {
    version_number: number;
    created_by: string;
    created_at: string;
    change_summary: string;
}

export interface PolicyHeader {
    title: string;
    organization: string;
    effective_date: string | null;
    expiry_date: string | null;
}

export interface DocumentStructure {
    header: PolicyHeader;
    version_control: VersionControlEntry[];
    sections: Section[];
    annexures: Record<string, unknown>[];
    attachments: Record<string, unknown>[];
}

// ── Policy Metadata ─────────────────────────────────────────────

export type PolicyStatus = 'draft' | 'submitted' | 'approved' | 'rejected' | 'pending_approval' | 'validation_failed';

export interface Policy {
    id: string;
    name: string;
    description: string | null;
    created_by: string | null;
    current_version: number;
    status: PolicyStatus;
    created_at: string;
    updated_at: string;
}

export interface PolicyDetail extends Policy {
    document_structure: DocumentStructure | null;
}

export interface PolicyListResponse {
    policies: Policy[];
    total: number;
    page: number;
    page_size: number;
}

// ── Request Types ───────────────────────────────────────────────

export interface PolicyCreateRequest {
    name: string;
    description?: string;
}

export interface PolicyUpdateRequest {
    name?: string;
    description?: string;
    status?: PolicyStatus;
}

export interface ManualStructureRequest {
    header: PolicyHeader;
    sections: Section[];
    annexures?: Record<string, unknown>[];
    attachments?: Record<string, unknown>[];
}

export interface AIStructureRequest {
    prompt: string;
}

export interface StructureResponse {
    policy_id: string;
    version: number;
    document_structure: DocumentStructure;
    message: string;
}

// ── Auth ────────────────────────────────────────────────────────

export interface LoginRequest {
    email: string;
    password: string;
}

export interface User {
    id: string;
    email: string;
    full_name: string;
    role_name: string | null;
    is_active: boolean;
    created_at: string;
}

export interface AuthResponse {
    access_token: string;
    user: User;
}

// ── AI Types ────────────────────────────────────────────────────

export interface AIValidationIssue {
    severity: 'error' | 'warning' | 'suggestion';
    category: string;
    message: string;
    path: string;
}

export interface AIValidationResult {
    ai_validation_failed: boolean;
    issues: AIValidationIssue[];
    suggestions: string[];
    normalized_field_names: Record<string, string>;
    message: string;
}

export interface AICallMetadata {
    provider: string;
    model: string;
    duration_ms: number;
    tokens: number;
    operation: string;
    timestamp: string;
    success: boolean;
    error?: string;
}

// ── Chat Types ──────────────────────────────────────────────────

export interface ChatMessage {
    role: 'user' | 'assistant';
    content: string;
    timestamp: string;
}

export interface ChatSession {
    session_id: string;
    phase: 'collecting' | 'confirming' | 'generating' | 'complete';
    collected_params: Record<string, unknown>;
    missing_params: string[];
    is_complete: boolean;
    messages: ChatMessage[];
}

export interface ChatMessageRequest {
    session_id?: string;
    message: string;
    policy_id?: string;
}

export interface ChatMessageResponse {
    session_id: string;
    ai_response: string;
    phase: 'collecting' | 'confirming' | 'generating' | 'complete';
    collected_params: Record<string, unknown>;
    missing_params: string[];
    is_complete: boolean;
    suggested_actions: string[];
    ai_provider?: string;
    ai_model?: string;
    ai_duration_ms?: number;
}

export interface ChatGenerateRequest {
    policy_name: string;
    policy_description?: string;
    tone?: string;
}

export interface ChatGenerateResponse {
    policy_id: string;
    version: number;
    message: string;
    ai_provider?: string;
    ai_model?: string;
}
