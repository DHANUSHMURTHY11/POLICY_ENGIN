const fs = require('fs');
const path = require('path');
const frontendDir = 'd:/POLICY_ENGIN/frontend';
const srcDir = path.join(frontendDir, 'src');

const report = { layout_chain: [], page_chain: [], issues: [], source_maps: [], unbalanced: [], packages: {}, webpack_info: {} };

function getImports(filePath, visited = new Set()) {
    if (visited.has(filePath)) return [];
    visited.add(filePath);
    const results = [];
    let content;
    try { content = fs.readFileSync(filePath, 'utf8'); } catch (e) { return [{ file: filePath, error: e.message }]; }
    const stat = fs.statSync(filePath);
    const info = { file: filePath.replace(frontendDir, '.'), size: stat.size, lines: content.split('\n').length };
    if (content.charCodeAt(0) === 0xFEFF) info.issue = 'BOM';
    if (content.includes('\0')) info.issue = 'NULL_BYTES';
    results.push(info);
    const re = /(?:import|from)\s+['"]([^'"]+)['"]/g;
    let m;
    while ((m = re.exec(content)) !== null) {
        const imp = m[1];
        if (imp.startsWith('.') || imp.startsWith('@/')) {
            let resolved = imp.startsWith('@/') ? path.join(srcDir, imp.slice(2)) : path.resolve(path.dirname(filePath), imp);
            const exts = ['', '.ts', '.tsx', '.js', '.jsx', '/index.ts', '/index.tsx'];
            let found = false;
            for (const ext of exts) {
                const full = resolved + ext;
                if (fs.existsSync(full) && fs.statSync(full).isFile()) {
                    found = true;
                    results.push(...getImports(full, visited));
                    break;
                }
            }
            if (!found) results.push({ file: filePath.replace(frontendDir, '.'), import: imp, issue: 'UNRESOLVED' });
        }
    }
    return results;
}

report.layout_chain = getImports(path.join(srcDir, 'app/dashboard/layout.tsx'));
report.page_chain = getImports(path.join(srcDir, 'app/dashboard/policies/[id]/page.tsx'));

// source maps
function findMaps(dir) {
    try {
        fs.readdirSync(dir, { withFileTypes: true }).forEach(e => {
            const full = path.join(dir, e.name);
            if (e.isDirectory() && e.name !== 'node_modules' && e.name !== '.next') findMaps(full);
            else if (e.name.endsWith('.map')) report.source_maps.push(full);
        });
    } catch (e) { }
}
findMaps(srcDir);

// unbalanced braces
function checkBraces(dir) {
    try {
        fs.readdirSync(dir, { withFileTypes: true }).forEach(e => {
            const full = path.join(dir, e.name);
            if (e.isDirectory() && e.name !== 'node_modules' && e.name !== '.next') checkBraces(full);
            else if (e.name.match(/\.(tsx?|jsx?|css)$/)) {
                const c = fs.readFileSync(full, 'utf8');
                let b = 0, br = 0, p = 0, inStr = false, sc = '';
                for (let i = 0; i < c.length; i++) {
                    const ch = c[i];
                    if (inStr) { if (ch === sc && c[i - 1] !== '\\') inStr = false; continue }
                    if (ch === "'" || ch === '"' || ch === '`') { inStr = true; sc = ch; continue }
                    if (ch === '{') b++; else if (ch === '}') b--;
                    else if (ch === '[') br++; else if (ch === ']') br--;
                    else if (ch === '(') p++; else if (ch === ')') p--;
                }
                if (b !== 0 || br !== 0 || p !== 0) report.unbalanced.push({ file: full.replace(frontendDir, '.'), braces: b, brackets: br, parens: p });
            }
        });
    } catch (e) { }
}
checkBraces(srcDir);

// packages
['next', 'react', 'react-dom', 'axios', 'recharts'].forEach(pkg => {
    try {
        const p = JSON.parse(fs.readFileSync(path.join(frontendDir, 'node_modules', pkg, 'package.json'), 'utf8'));
        report.packages[pkg] = p.version;
    } catch (e) { report.packages[pkg] = 'BROKEN: ' + e.message }
});

// webpack
try {
    const np = JSON.parse(fs.readFileSync(path.join(frontendDir, 'node_modules/next/package.json'), 'utf8'));
    report.webpack_info.next_version = np.version;
    const cp = path.join(frontendDir, 'node_modules/next/dist/compiled/webpack');
    if (fs.existsSync(cp)) { report.webpack_info.compiled_dir = fs.readdirSync(cp) }
} catch (e) { report.webpack_info.error = e.message }

// Check for lock file integrity
try {
    const lockPath = path.join(frontendDir, 'package-lock.json');
    if (fs.existsSync(lockPath)) {
        const lock = fs.readFileSync(lockPath, 'utf8');
        JSON.parse(lock);
        report.lockfile = { valid: true, size: lock.length };
    } else {
        const yarnLock = path.join(frontendDir, 'yarn.lock');
        if (fs.existsSync(yarnLock)) {
            report.lockfile = { type: 'yarn', size: fs.statSync(yarnLock).size };
        } else {
            report.lockfile = { exists: false };
        }
    }
} catch (e) { report.lockfile = { valid: false, error: e.message }; }

// Check for .babelrc or babel.config
['babel.config.js', 'babel.config.json', '.babelrc', '.babelrc.json'].forEach(f => {
    const fp = path.join(frontendDir, f);
    if (fs.existsSync(fp)) report.babel = fs.readFileSync(fp, 'utf8');
});

// Check postcss.config
try {
    const pc = path.join(frontendDir, 'postcss.config.js');
    if (fs.existsSync(pc)) report.postcss = fs.readFileSync(pc, 'utf8');
    const pm = path.join(frontendDir, 'postcss.config.mjs');
    if (fs.existsSync(pm)) report.postcss = fs.readFileSync(pm, 'utf8');
} catch (e) { }

// Check for any tailwind config
try {
    const tw = path.join(frontendDir, 'tailwind.config.js');
    if (fs.existsSync(tw)) report.tailwind = fs.readFileSync(tw, 'utf8');
    const tw2 = path.join(frontendDir, 'tailwind.config.ts');
    if (fs.existsSync(tw2)) report.tailwind = fs.readFileSync(tw2, 'utf8');
} catch (e) { }

fs.writeFileSync('d:/diag2_report.json', JSON.stringify(report, null, 2), 'utf8');
