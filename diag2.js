// Focused diagnostic: check what modules layout.tsx and [id]/page.tsx import
// and look for any JSON/source-map issues in the dependency chain
const fs = require('fs');
const path = require('path');

const frontendDir = 'd:/POLICY_ENGIN/frontend';
const srcDir = path.join(frontendDir, 'src');

// Recursively resolve imports from a file
function getImports(filePath, visited = new Set()) {
    if (visited.has(filePath)) return [];
    visited.add(filePath);

    let content;
    try { content = fs.readFileSync(filePath, 'utf8'); }
    catch (e) { return [{ file: filePath, error: 'CANNOT_READ: ' + e.message }]; }

    const results = [];

    // Check for BOM
    if (content.charCodeAt(0) === 0xFEFF) {
        results.push({ file: filePath, issue: 'HAS_BOM' });
    }

    // Check for null bytes
    if (content.includes('\0')) {
        results.push({ file: filePath, issue: 'HAS_NULL_BYTES' });
    }

    // Check file size
    const stat = fs.statSync(filePath);
    results.push({ file: filePath, size: stat.size, lines: content.split('\n').length });

    // Extract imports
    const importRegex = /(?:import|from)\s+['"]([^'"]+)['"]/g;
    let match;
    while ((match = importRegex.exec(content)) !== null) {
        const importPath = match[1];

        // Resolve relative imports
        if (importPath.startsWith('.') || importPath.startsWith('@/')) {
            let resolved;
            if (importPath.startsWith('@/')) {
                resolved = path.join(srcDir, importPath.slice(2));
            } else {
                resolved = path.resolve(path.dirname(filePath), importPath);
            }

            // Try extensions
            const extensions = ['', '.ts', '.tsx', '.js', '.jsx', '/index.ts', '/index.tsx'];
            let found = false;
            for (const ext of extensions) {
                const fullPath = resolved + ext;
                if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
                    found = true;
                    // Check if the resolved file has issues
                    const subResults = getImports(fullPath, visited);
                    results.push(...subResults);
                    break;
                }
            }
            if (!found) {
                results.push({ file: filePath, import: importPath, issue: 'UNRESOLVED_IMPORT', tried: resolved });
            }
        }
    }

    return results;
}

// Check layout.tsx
console.log('=== LAYOUT.TSX IMPORT CHAIN ===');
const layoutResults = getImports(path.join(srcDir, 'app/dashboard/layout.tsx'));
layoutResults.forEach(r => {
    if (r.issue) console.log('  ISSUE:', JSON.stringify(r));
    else if (r.error) console.log('  ERROR:', JSON.stringify(r));
});
console.log('  Total files in chain:', layoutResults.filter(r => r.size).length);

console.log('\n=== [ID]/PAGE.TSX IMPORT CHAIN ===');
const pageResults = getImports(path.join(srcDir, 'app/dashboard/policies/[id]/page.tsx'));
pageResults.forEach(r => {
    if (r.issue) console.log('  ISSUE:', JSON.stringify(r));
    else if (r.error) console.log('  ERROR:', JSON.stringify(r));
});
console.log('  Total files in chain:', pageResults.filter(r => r.size).length);

// Check for any .map files that might be corrupt
console.log('\n=== SOURCE MAP CHECK ===');
const { execSync } = require('child_process');
try {
    // Check if there are any .map files in src
    const mapFiles = [];
    function findMaps(dir) {
        try {
            fs.readdirSync(dir, { withFileTypes: true }).forEach(e => {
                const full = path.join(dir, e.name);
                if (e.isDirectory() && e.name !== 'node_modules' && e.name !== '.next') findMaps(full);
                else if (e.name.endsWith('.map')) mapFiles.push(full);
            });
        } catch (e) { }
    }
    findMaps(srcDir);
    console.log('  .map files in src:', mapFiles.length);
    mapFiles.forEach(f => console.log('    ', f));
} catch (e) { console.log('  Error checking maps:', e.message); }

// Check node_modules integrity for key packages
console.log('\n=== CRITICAL PACKAGE CHECKS ===');
const criticalPackages = ['next', 'react', 'react-dom', 'axios', 'recharts'];
criticalPackages.forEach(pkg => {
    const pkgJson = path.join(frontendDir, 'node_modules', pkg, 'package.json');
    try {
        const content = fs.readFileSync(pkgJson, 'utf8');
        const parsed = JSON.parse(content);
        console.log(`  ${pkg}: v${parsed.version} (OK)`);
    } catch (e) {
        console.log(`  ${pkg}: BROKEN - ${e.message}`);
    }
});

// Check if there are truncated files
console.log('\n=== TRUNCATED FILE CHECK (files ending without newline or with partial content) ===');
function checkTruncation(dir) {
    try {
        fs.readdirSync(dir, { withFileTypes: true }).forEach(e => {
            const full = path.join(dir, e.name);
            if (e.isDirectory() && e.name !== 'node_modules' && e.name !== '.next') {
                checkTruncation(full);
            } else if (e.name.match(/\.(tsx?|jsx?|css)$/)) {
                const content = fs.readFileSync(full, 'utf8');
                // Check if file appears truncated (unmatched braces/brackets)
                let braces = 0, brackets = 0, parens = 0;
                let inString = false, stringChar = '';
                for (let i = 0; i < content.length; i++) {
                    const c = content[i];
                    if (inString) {
                        if (c === stringChar && content[i - 1] !== '\\') inString = false;
                        continue;
                    }
                    if (c === "'" || c === '"' || c === '`') { inString = true; stringChar = c; continue; }
                    if (c === '{') braces++;
                    else if (c === '}') braces--;
                    else if (c === '[') brackets++;
                    else if (c === ']') brackets--;
                    else if (c === '(') parens++;
                    else if (c === ')') parens--;
                }
                if (braces !== 0 || brackets !== 0 || parens !== 0) {
                    console.log(`  UNBALANCED: ${full.replace(frontendDir, '.')}`);
                    console.log(`    braces=${braces} brackets=${brackets} parens=${parens}`);
                }
            }
        });
    } catch (e) { }
}
checkTruncation(srcDir);

// Check for any JSON.parse calls with potentially bad data
console.log('\n=== WEBPACK VERSION ===');
try {
    // Next.js bundles webpack internally
    const nextPkg = JSON.parse(fs.readFileSync(path.join(frontendDir, 'node_modules/next/package.json'), 'utf8'));
    console.log('  Next.js:', nextPkg.version);
    // Check if next has webpack5 dependency
    const deps = { ...nextPkg.dependencies, ...nextPkg.peerDependencies };
    if (deps.webpack) console.log('  Webpack (declared):', deps.webpack);

    // Try to find actual bundled webpack
    const wpPath = path.join(frontendDir, 'node_modules/next/node_modules/webpack/package.json');
    if (fs.existsSync(wpPath)) {
        const wp = JSON.parse(fs.readFileSync(wpPath, 'utf8'));
        console.log('  Webpack (bundled):', wp.version);
    }

    // Check compiled webpack
    const compiledPath = path.join(frontendDir, 'node_modules/next/dist/compiled/webpack');
    if (fs.existsSync(compiledPath)) {
        console.log('  Compiled webpack dir exists:', true);
        const files = fs.readdirSync(compiledPath);
        console.log('  Files:', files.join(', '));
    }
} catch (e) { console.log('  Error:', e.message); }
