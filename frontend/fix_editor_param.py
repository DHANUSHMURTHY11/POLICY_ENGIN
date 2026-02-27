import sys
import re

filepath = r"d:\POLICY_ENGIN\frontend\src\app\dashboard\policies\[id]\page.tsx"

with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

# Replace imports
old_import = "import { useParams, useRouter } from 'next/navigation';"
new_import = "import { useParams, useRouter, useSearchParams } from 'next/navigation';"
if old_import in content:
    content = content.replace(old_import, new_import)

# Replace function body and add searchParams
old_func_start = """export default function PolicyEditor() {
    const params = useParams();
    const router = useRouter();
    const [policy, setPolicy] = useState<PolicyDetail | null>(null);"""

new_func_start = """export default function PolicyEditor() {
    const params = useParams();
    const router = useRouter();
    const searchParams = useSearchParams();
    const [policy, setPolicy] = useState<PolicyDetail | null>(null);"""
if old_func_start in content:
    content = content.replace(old_func_start, new_func_start)


# Replace mobileTab state
old_tab_state = "const [mobileTab, setMobileTab] = useState<'editor' | 'preview'>('editor');"
new_tab_state = "const [mobileTab, setMobileTab] = useState<'editor' | 'preview'>(searchParams.get('view') === 'true' ? 'preview' : 'editor');"
if old_tab_state in content:
    content = content.replace(old_tab_state, new_tab_state)

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(content)
print("Finished patching [id]/page.tsx")
