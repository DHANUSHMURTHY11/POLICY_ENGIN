'use client';

import React from 'react';
import {
    LayoutDashboard,
    FileText,
    GitBranch,
    History,
    Settings,
    Shield,
    LogOut,
    Terminal,
    Bot,
    Loader,
    ChevronLeft,
    X,
    AlertCircle,
    AlertTriangle,
    Lightbulb,
    RefreshCw,
    Sparkles,
    Eye,
    BadgeCheck,
    Check,
    Info,
    BarChart3,
    Plus,
    PlusSquare,
    GripVertical,
    ArrowLeft,
    Lock,
    Undo2,
    ArrowLeftRight,
    Diff,
    Brain,
    Code,
    Flag,
    Timer,
    CheckCircle,
    XCircle,
    ExternalLink,
    Inbox,
    Pointer,
    Trash2,
    FolderX,
    CirclePlus,
    LogIn,
    Search,
    Filter,
    Download,
    Mail,
    Calendar,
    User,
    Users,
    Copy,
    MoreVertical,
    ChevronRight,
    ChevronDown,
    ChevronUp,
    Edit,
    Save,
    Send,
    Archive,
    Bookmark,
    Tag,
    Hash,
    Type,
    ToggleLeft,
    List,
    ListOrdered,
    SlidersHorizontal,
    FileDown,
    FileUp,
    Paperclip,
    Link,
    Unlink,
    Eye as EyeIcon,
    EyeOff,
    Eraser,
    Wand2,
    Zap,
    Target,
    TrendingUp,
    TrendingDown,
    ArrowUpRight,
    ArrowDownRight,
    RotateCcw,
    Upload,
    CloudUpload,
    Database,
    Server,
    Activity,
    Bell,
    HelpCircle,
    // New additions for the refactor
    Moon,
    Sun,
    Clock,
    FileEdit,
    AlignJustify,
    StickyNote,
    Percent,
    Phone,
    Banknote,
    ListChecks,
    CircleChevronDown,
    Braces,
    FileImage,
    ChevronsUpDown,
    Minimize2,
    Gavel,
    WandSparkles,
    Cpu,
    Coins,
    MessageSquare,
    CloudOff,
    Trash,
    MousePointerClick,
} from 'lucide-react';
import type { LucideProps } from 'lucide-react';

/**
 * Maps Material Symbols icon names → Lucide React components.
 * This gives us proper SVG icons instead of relying on a font that may not load.
 */
const ICON_MAP: Record<string, React.FC<LucideProps>> = {
    // Sidebar / Navigation
    dashboard: LayoutDashboard,
    policy: FileText,
    account_tree: GitBranch,
    history: History,
    admin_panel_settings: Settings,
    shield: Shield,
    logout: LogOut,
    terminal: Terminal,
    smart_toy: Bot,
    login: LogIn,

    // Actions
    close: X,
    check: Check,
    add: Plus,
    add_box: PlusSquare,
    add_circle: CirclePlus,
    refresh: RefreshCw,
    delete_sweep: Trash2,
    delete: Trash,
    search: Search,
    filter_list: Filter,
    download: Download,
    upload: Upload,
    save: Save,
    send: Send,
    edit: Edit,
    content_copy: Copy,
    more_vert: MoreVertical,
    drag_indicator: GripVertical,
    open_in_new: ExternalLink,
    touch_app: Pointer,
    undo: Undo2,

    // Navigation arrows
    chevron_left: ChevronLeft,
    chevron_right: ChevronRight,
    arrow_back: ArrowLeft,
    expand_more: ChevronDown,
    expand_less: ChevronUp,

    // Status / Alerts
    error: AlertCircle,
    warning: AlertTriangle,
    info: Info,
    check_circle: CheckCircle,
    cancel: XCircle,
    gpp_bad: AlertCircle,
    verified: BadgeCheck,

    // AI / Intelligence
    auto_awesome: Sparkles,
    psychology: Brain,
    lightbulb: Lightbulb,
    tips_and_updates: Lightbulb,
    analytics: BarChart3,
    badge: BadgeCheck,
    approval: CheckCircle,
    wand: Wand2,

    // Progress
    progress_activity: Loader,

    // Versioning / Diff
    compare_arrows: ArrowLeftRight,
    difference: Diff,
    lock: Lock,
    code: Code,
    flag: Flag,
    timer: Timer,

    // Content
    inbox: Inbox,
    folder_off: FolderX,
    preview: Eye,
    visibility: Eye,
    visibility_off: EyeOff,
    mail: Mail,
    calendar_today: Calendar,
    person: User,
    people: Users,
    description: FileText,
    article: FileText,
    tag: Tag,
    label: Tag,

    // Data types
    text_fields: Type,
    toggle_on: ToggleLeft,
    list: List,
    format_list_numbered: ListOrdered,
    tune: SlidersHorizontal,
    numbers: Hash,
    attach_file: Paperclip,
    link: Link,
    link_off: Unlink,

    // File operations
    file_download: FileDown,
    file_upload: FileUp,
    archive: Archive,
    bookmark: Bookmark,

    // Charts / Analytics
    trending_up: TrendingUp,
    trending_down: TrendingDown,
    arrow_upward: ArrowUpRight,
    arrow_downward: ArrowDownRight,
    target: Target,
    bolt: Zap,

    // System
    rotate_left: RotateCcw,
    cloud_upload: CloudUpload,
    cloud_off: CloudOff,
    database: Database,
    dns: Server,
    monitoring: Activity,
    notifications: Bell,
    help: HelpCircle,

    // ── New icon mappings for UI refactor ──
    moon: Moon,
    sun: Sun,
    schedule: Clock,
    edit_note: FileEdit,
    segment: AlignJustify,
    notes: StickyNote,
    percent: Percent,
    phone: Phone,
    payments: Banknote,
    checklist: ListChecks,
    arrow_drop_down_circle: CircleChevronDown,
    data_object: Braces,
    picture_as_pdf: FileImage,
    unfold_more: ChevronsUpDown,
    compress: Minimize2,
    gavel: Gavel,
    auto_fix_high: WandSparkles,
    magic_button: WandSparkles,
    memory: Cpu,
    token: Coins,
    forum: MessageSquare,
    mouse_click: MousePointerClick,
};

interface IconProps {
    /** Material Symbols icon name (e.g. "dashboard", "account_tree") */
    name: string;
    /** Size in pixels, default 20 */
    size?: number;
    /** CSS color string */
    color?: string;
    /** Extra className */
    className?: string;
    /** Inline style overrides */
    style?: React.CSSProperties;
    /** Whether to use filled variant (increases stroke width slightly) */
    filled?: boolean;
}

/**
 * Universal Icon component. Pass the old Material Symbols name and it
 * renders the matching Lucide SVG icon.
 */
export default function Icon({ name, size = 20, color, className = '', style, filled }: IconProps) {
    const Component = ICON_MAP[name];

    if (!Component) {
        // Fallback: just show nothing instead of broken text
        if (process.env.NODE_ENV === 'development') {
            console.warn(`[Icon] No mapping for "${name}"`);
        }
        return (
            <span
                className={className}
                style={{ display: 'inline-flex', width: size, height: size, ...style }}
            />
        );
    }

    return (
        <Component
            size={size}
            color={color}
            className={className}
            style={style}
            strokeWidth={filled ? 2.5 : 2}
        />
    );
}
