// Diagnostic script: run next build and capture full error output
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const frontendDir = 'd:/POLICY_ENGIN/frontend';
const outputFile = 'd:/diag_report.json';

// 1. Capture build output
let stdout = '', stderr = '', exitCode = 0;
try {
    stdout = execSync('npx next build --no-lint 2>&1', {
        cwd: frontendDir,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1', COLUMNS: '500' },
        timeout: 120000,
    });
} catch (e) {
    stdout = e.stdout || '';
    stderr = e.stderr || '';
    exitCode = e.status || 1;
}

// 2. Get environment
let nodeVersion = '', nextVersion = '', webpackVersion = '';
try { nodeVersion = execSync('node --version', { encoding: 'utf8' }).trim(); } catch (e) { }
try {
    const pkg = JSON.parse(fs.readFileSync(path.join(frontendDir, 'package.json'), 'utf8'));
    nextVersion = pkg.dependencies?.next || pkg.devDependencies?.next || 'unknown';
} catch (e) { }
try {
    const wpPkg = path.join(frontendDir, 'node_modules', 'webpack', 'package.json');
    if (fs.existsSync(wpPkg)) {
        webpackVersion = JSON.parse(fs.readFileSync(wpPkg, 'utf8')).version;
    }
} catch (e) { }

// 3. Check for potentially corrupt JSON files
const suspectFiles = [];
function checkJsonFiles(dir, depth = 0) {
    if (depth > 3) return;
    try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
            if (entry.name === 'node_modules' || entry.name === '.next') continue;
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                checkJsonFiles(full, depth + 1);
            } else if (entry.name.endsWith('.json')) {
                try {
                    const content = fs.readFileSync(full, 'utf8');
                    JSON.parse(content);
                } catch (e) {
                    suspectFiles.push({ file: full, error: e.message });
                }
            }
        }
    } catch (e) { }
}
checkJsonFiles(path.join(frontendDir, 'src'));
checkJsonFiles(frontendDir); // top-level jsons

// 4. Check next.config
let nextConfig = '';
try {
    const cfgPath = path.join(frontendDir, 'next.config.js');
    if (fs.existsSync(cfgPath)) nextConfig = fs.readFileSync(cfgPath, 'utf8');
    const cfgPath2 = path.join(frontendDir, 'next.config.mjs');
    if (fs.existsSync(cfgPath2)) nextConfig = fs.readFileSync(cfgPath2, 'utf8');
    const cfgPath3 = path.join(frontendDir, 'next.config.ts');
    if (fs.existsSync(cfgPath3)) nextConfig = fs.readFileSync(cfgPath3, 'utf8');
} catch (e) { }

// 5. Check tsconfig.json
let tsConfig = '';
try {
    tsConfig = fs.readFileSync(path.join(frontendDir, 'tsconfig.json'), 'utf8');
} catch (e) { }

// 6. Check package.json validity
let pkgJsonValid = false;
try {
    JSON.parse(fs.readFileSync(path.join(frontendDir, 'package.json'), 'utf8'));
    pkgJsonValid = true;
} catch (e) { }

// 7. List all files in src/app/dashboard/policies (the suspect area)
const policyFiles = [];
function listFiles(dir) {
    try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) listFiles(full);
            else policyFiles.push({ path: full, size: fs.statSync(full).size });
        }
    } catch (e) { }
}
listFiles(path.join(frontendDir, 'src', 'app', 'dashboard', 'policies'));

const report = {
    build_stdout: stdout,
    build_stderr: stderr,
    exit_code: exitCode,
    environment: {
        node: nodeVersion,
        next: nextVersion,
        webpack: webpackVersion,
        os: process.platform,
        arch: process.arch,
    },
    package_json_valid: pkgJsonValid,
    suspect_json_files: suspectFiles,
    next_config: nextConfig,
    tsconfig: tsConfig,
    policy_dir_files: policyFiles,
};

fs.writeFileSync(outputFile, JSON.stringify(report, null, 2), 'utf8');
console.log('Report written to', outputFile);
console.log('File size:', fs.statSync(outputFile).size, 'bytes');
