const fs = require('fs');
const fp = 'd:/POLICY_ENGIN/frontend/src/app/dashboard/policies/[id]/query/page.tsx';
let code = fs.readFileSync(fp, 'utf8');
const lines = code.split('\n');

// Find the corrupted section (lines around 336-357, 0-indexed 335-356)
// Replace lines 335-356 with the correct JSX
const fixedLines = [
    '                                        {result.warnings.length > 0 && (\r',
    '                                            <Icon name="warning" size={16} color="#fbbf24" />\r',
    '                                        )}\r',
    '                                    </div>\r',
    '                                );\r',
    '                            })()}\r',
    '\r',
    '                            {/* Result tabs */}\r',
    '                            <div className="flex border-b" style={{ borderColor: \'var(--border-default)\' }}>\r',
    '                                {([\r',
    '                                    { key: \'decision\' as const, label: \'Decision\', icon: \'check_circle\' },\r',
    '                                    { key: \'ai\' as const, label: \'AI Explanation\', icon: \'smart_toy\' },\r',
    '                                    { key: \'rules\' as const, label: `Rules (${totalRules})`, icon: \'list\' },\r',
    '                                    { key: \'trace\' as const, label: \'Trace\', icon: \'history\' },\r',
    '                                ]).map(tab => (\r',
    '                                    <button\r',
    '                                        key={tab.key}\r',
    '                                        onClick={() => setActiveTab(tab.key)}\r',
    '                                        className="flex-1 py-2.5 text-[10px] font-semibold text-center transition-all flex items-center justify-center gap-1"\r',
    '                                        style={{\r',
    '                                            background: activeTab === tab.key ? \'rgba(139,92,246,.06)\' : \'transparent\',\r',
    '                                            color: activeTab === tab.key ? \'#a78bfa\' : \'var(--text-muted)\',\r',
    '                                            borderBottom: activeTab === tab.key ? \'2px solid #a78bfa\' : \'2px solid transparent\',\r',
    '                                        }}\r',
    '                                    >\r',
    '                                        <Icon name={tab.icon} size={14} />\r',
    '                                        {tab.label}\r',
    '                                    </button>\r',
    '                                ))}\r',
    '                            </div>\r',
];

// Replace lines 336-357 (0-indexed: 335-356)
lines.splice(335, 22, ...fixedLines);

code = lines.join('\n');
fs.writeFileSync(fp, code, 'utf8');
console.log('Fixed query/page.tsx - replaced lines 336-357');
