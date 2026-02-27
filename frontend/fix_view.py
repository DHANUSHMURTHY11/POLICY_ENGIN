import sys
import re

filepath = r"d:\POLICY_ENGIN\frontend\src\app\dashboard\policies\[id]\page.tsx"

with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

# Add isViewMode
old_params = 'const searchParams = useSearchParams();'
new_params = 'const searchParams = useSearchParams();\n    const isViewMode = searchParams.get(\'view\') === \'true\';'
if old_params in content and 'isViewMode =' not in content:
    content = content.replace(old_params, new_params)

# Hide Mobile Tabs if view mode
old_tabs_div = '<div className="mobile-tab-bar w-full border-b" style={{ borderColor: \'var(--border-default)\', background: \'var(--bg-secondary)\' }}>'
new_tabs_div = '{!isViewMode && <div className="mobile-tab-bar w-full border-b" style={{ borderColor: \'var(--border-default)\', background: \'var(--bg-secondary)\' }}>'
if old_tabs_div in content:
    content = content.replace(old_tabs_div, new_tabs_div)
    content = content.replace('</button>\n                ))}\n            </div>\n\n            {/* ═══ Split-Screen Layout ═══ */}', '</button>\n                ))}\n            </div>}\n\n            {/* ═══ Split-Screen Layout ═══ */}')

# Collapse Editor Box
old_editor = '<div className={`flex-1 flex flex-col min-w-0 ${mobileTab !== \'editor\' ? \'hidden md:flex\' : \'\'}`}>'
new_editor = '<div className={`flex-1 flex flex-col min-w-0 ${mobileTab !== \'editor\' ? \'hidden md:flex\' : \'\'} ${isViewMode ? \'!hidden\' : \'\'}`}>'
if old_editor in content:
    content = content.replace(old_editor, new_editor)

# Expand Preview Box
old_preview = '<div className={`flex-1 min-w-0 ${mobileTab !== \'preview\' ? \'hidden md:block\' : \'\'}`}'
new_preview = '<div className={`flex-1 min-w-0 ${mobileTab !== \'preview\' ? \'hidden md:block\' : \'\'} ${isViewMode ? \'!block !max-w-none w-full flex-1 mx-auto\' : \'\'}`}'
if old_preview in content:
    content = content.replace(old_preview, new_preview)

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(content)
print('Done applying View mode.')
