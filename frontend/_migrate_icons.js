const fs = require('fs');
const path = require('path');

const files = [
    'src/app/dashboard/workflow/page.tsx',
    'src/app/dashboard/policies/page.tsx',
    'src/app/dashboard/policies/create/page.tsx',
    'src/app/dashboard/policies/[id]/page.tsx',
    'src/app/dashboard/policies/[id]/compose/page.tsx',
    'src/app/dashboard/policies/[id]/query/page.tsx',
    'src/app/dashboard/policies/[id]/versions/page.tsx',
    'src/app/dashboard/policies/[id]/_components/LeftPanel.tsx',
    'src/app/dashboard/policies/[id]/_components/FieldModal.tsx',
    'src/app/dashboard/admin/workflows/page.tsx',
    'src/components/ai/AIValidationBanner.tsx',
    'src/components/ai/AILoadingOverlay.tsx',
    'src/components/ai/AIExecutionLogDrawer.tsx',
    'src/components/ai/AIAssistantPanel.tsx',
];

const base = 'd:/POLICY_ENGIN/frontend';
let totalReplacements = 0;

const textSizeMap = {
    'text-xs': 12, 'text-sm': 14, 'text-base': 16, 'text-lg': 18,
    'text-xl': 20, 'text-2xl': 24, 'text-3xl': 30, 'text-4xl': 36
};

for (const rel of files) {
    const fp = path.join(base, rel);
    if (!fs.existsSync(fp)) { console.log('SKIP (not found):', rel); continue; }
    let code = fs.readFileSync(fp, 'utf8');

    if (!code.includes('material-symbols-outlined')) {
        console.log('SKIP (no matches):', rel);
        continue;
    }

    let count = 0;

    // Add import if not already there
    if (!code.includes("import Icon from") && !code.includes("import Icon from")) {
        const lines = code.split('\n');
        let lastImportIdx = -1;
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].trim().startsWith('import ')) lastImportIdx = i;
        }
        if (lastImportIdx >= 0) {
            lines.splice(lastImportIdx + 1, 0, "import Icon from '@/components/ui/Icon';");
            code = lines.join('\n');
        }
    }

    // Replace all <span className="material-symbols-outlined ..." style={{...}}>icon</span>
    // This handles both single-line and multi-line variants
    const regex = /<span\s+className="material-symbols-outlined([^"]*)"\s*(?:aria-hidden="true"\s*)?(?:style=\{\{([\s\S]*?)\}\}\s*)?(?:aria-hidden="true"\s*)?>([\s\S]*?)<\/span>/g;

    code = code.replace(regex, (match, extraClasses, styleStr, iconName) => {
        iconName = iconName.trim();
        // Skip if iconName contains JSX (like {s.icon} or {style.icon})
        if (iconName.includes('{') || iconName.includes('}') || iconName.includes('<')) {
            // Dynamic icon name - use pattern: <Icon name={expr} .../>
            const expr = iconName.replace(/[{}]/g, '').trim();
            let size = 20;
            let colorProp = '';
            let filled = '';
            let cls = (extraClasses || '').trim();

            if (styleStr) {
                const sizeMatch = styleStr.match(/fontSize:\s*(\d+)/);
                if (sizeMatch) size = parseInt(sizeMatch[1]);
                const colorMatch = styleStr.match(/color:\s*'([^']+)'/);
                if (colorMatch) colorProp = ` color="${colorMatch[1]}"`;
                if (styleStr.includes("'FILL' 1")) filled = ' filled';
            }

            // Extract size from text classes
            for (const [k, v] of Object.entries(textSizeMap)) {
                if (cls.includes(k)) { size = v; cls = cls.replace(k, '').trim(); break; }
            }
            cls = cls.replace(/text-white/g, '').replace(/\s+/g, ' ').trim();
            const clsProp = cls ? ` className="${cls}"` : '';

            count++;
            return `<Icon name={${expr}} size={${size}}${colorProp}${filled}${clsProp} />`;
        }

        // Static icon name
        let size = 20;
        let colorProp = '';
        let filled = '';
        let cls = (extraClasses || '').trim();

        if (styleStr) {
            const sizeMatch = styleStr.match(/fontSize:\s*(\d+)/);
            if (sizeMatch) size = parseInt(sizeMatch[1]);
            const colorMatch = styleStr.match(/color:\s*'([^']+)'/);
            if (colorMatch) colorProp = ` color="${colorMatch[1]}"`;
            if (styleStr.includes("'FILL' 1")) filled = ' filled';
        }

        // Extract size from text classes
        for (const [k, v] of Object.entries(textSizeMap)) {
            if (cls.includes(k)) { size = v; cls = cls.replace(k, '').trim(); break; }
        }
        cls = cls.replace(/text-white/g, '').replace(/\s+/g, ' ').trim();
        const clsProp = cls ? ` className="${cls}"` : '';

        count++;
        return `<Icon name="${iconName}" size={${size}}${colorProp}${filled}${clsProp} />`;
    });

    totalReplacements += count;
    fs.writeFileSync(fp, code, 'utf8');
    console.log('Updated:', rel, '(' + count + ' replacements)');
}

console.log('\nTotal replacements:', totalReplacements);
