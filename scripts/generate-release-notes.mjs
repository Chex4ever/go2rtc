#!/usr/bin/env node
/**
 * Build GitHub Release notes: changelog section + assets table (Furnace-style).
 *
 * Usage:
 *   node scripts/generate-release-notes.mjs \
 *     --dist dist --version 1.2.34 --tag v1.2.34 \
 *     --changelog docs/CHANGELOG_VIEWER.md \
 *     --out release-notes.md \
 *     [--prev-tag v1.2.33] [--repo owner/repo]
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {crc32} from 'node:zlib';

const KB = 1024;

function parseArgs(argv) {
    const opts = {
        dist: 'dist',
        version: '',
        tag: '',
        changelog: 'docs/CHANGELOG_VIEWER.md',
        out: 'release-notes.md',
        repo: process.env.GITHUB_REPOSITORY || 'Chex4ever/go2rtc',
        prevTag: '',
    };
    for (let i = 2; i < argv.length; i++) {
        const a = argv[i];
        if (a === '--dist') {
            opts.dist = argv[++i];
        } else if (a === '--version') {
            opts.version = argv[++i];
        } else if (a === '--tag') {
            opts.tag = argv[++i];
        } else if (a === '--changelog') {
            opts.changelog = argv[++i];
        } else if (a === '--out') {
            opts.out = argv[++i];
        } else if (a === '--repo') {
            opts.repo = argv[++i];
        } else if (a === '--prev-tag') {
            opts.prevTag = argv[++i];
        }
    }
    if (!opts.version) {
        throw new Error('--version is required');
    }
    if (!opts.tag) {
        opts.tag = `v${opts.version}`;
    }
    return opts;
}

/** @param {string} changelogPath @param {string} version */
export function extractChangelogSection(changelogPath, version) {
    const text = fs.readFileSync(changelogPath, 'utf8');
    const header = `## ${version}`;
    const start = text.indexOf(header);
    if (start < 0) {
        return '';
    }
    const after = text.slice(start + header.length);
    const next = after.search(/\r?\n## \d+\.\d+\.\d+/);
    const body = (next >= 0 ? after.slice(0, next) : after).trim();
    return body.replace(/^\s+/, '');
}

function readSha256Sidecar(filePath) {
    const sidecar = `${filePath}.sha256`;
    if (!fs.existsSync(sidecar)) {
        return '';
    }
    const line = fs.readFileSync(sidecar, 'utf8').trim().split(/\s+/)[0] || '';
    return line.toLowerCase();
}

function hashFile(filePath) {
    const buf = fs.readFileSync(filePath);
    const sha256 = crypto.createHash('sha256').update(buf).digest('hex');
    const crc = (crc32(buf) >>> 0).toString(16).toUpperCase().padStart(8, '0');
    return {sha256, crc32: crc};
}

function formatSizeKb(bytes) {
    return `${Math.round(bytes / KB)} KB`;
}

function assetRank(name) {
    if (/Camera\.Wall\.Setup/i.test(name)) {
        return 0;
    }
    if (name === 'go2rtc-updater.exe') {
        return 1;
    }
    if (/^go2rtc_.*\.exe$/i.test(name) || /^go2rtc_.*_windows_/i.test(name)) {
        return 2;
    }
    if (/^go2rtc_.*_linux_/i.test(name) || /^go2rtc_.*_arm64$/i.test(name)) {
        return 3;
    }
    if (/Patch.*\.zip$/i.test(name)) {
        return 4;
    }
    return 5;
}

function isReleaseAsset(name) {
    if (name.endsWith('.sha256')) {
        return false;
    }
    if (name === 'release-manifest.json') {
        return false;
    }
    if (/^desktop-(shell-manifest|update-meta)-/.test(name) && name.endsWith('.json')) {
        return false;
    }
    return true;
}

function isMetadataAsset(name) {
    return (
        name === 'release-manifest.json' ||
        (/^desktop-(shell-manifest|update-meta)-/.test(name) && name.endsWith('.json'))
    );
}

/** @param {string} distDir */
export function collectReleaseAssets(distDir) {
    const files = [];
    function walk(dir, prefix = '') {
        for (const ent of fs.readdirSync(dir, {withFileTypes: true})) {
            const rel = prefix ? `${prefix}/${ent.name}` : ent.name;
            const full = path.join(dir, rel);
            if (ent.isDirectory()) {
                walk(full, rel);
                continue;
            }
            if (!isReleaseAsset(ent.name)) {
                if (isMetadataAsset(ent.name)) {
                    const st = fs.statSync(full);
                    files.push({
                        name: ent.name,
                        rel,
                        bytes: st.size,
                        sha256: '',
                        crc32: '',
                        meta: true,
                    });
                }
                continue;
            }
            const st = fs.statSync(full);
            let sha256 = readSha256Sidecar(full);
            let crc = '';
            if (!sha256) {
                const h = hashFile(full);
                sha256 = h.sha256;
                crc = h.crc32;
            } else {
                const buf = fs.readFileSync(full);
                crc = (crc32(buf) >>> 0).toString(16).toUpperCase().padStart(8, '0');
            }
            files.push({
                name: ent.name,
                rel,
                bytes: st.size,
                sha256,
                crc32: crc,
                meta: false,
            });
        }
    }
    if (!fs.existsSync(distDir)) {
        return {downloads: [], metadata: []};
    }
    walk(distDir);
    const downloads = files
        .filter((f) => !f.meta)
        .sort((a, b) => assetRank(a.name) - assetRank(b.name) || a.name.localeCompare(b.name));
    const metadata = files
        .filter((f) => f.meta)
        .sort((a, b) => a.name.localeCompare(b.name));
    return {downloads, metadata};
}

function markdownTable(rows, headers) {
    const lines = [
        `| ${headers.join(' | ')} |`,
        `| ${headers.map(() => '---').join(' | ')} |`,
    ];
    for (const row of rows) {
        lines.push(`| ${row.join(' | ')} |`);
    }
    return lines.join('\n');
}

/** @param {ReturnType<typeof parseArgs>} opts @param {{downloads: object[], metadata: object[]}} assets */
export function buildReleaseNotes(opts, assets) {
    const changelog = extractChangelogSection(opts.changelog, opts.version);
    const prevTag = opts.prevTag || findPreviousTag(opts.version);
    const compareUrl = `https://github.com/${opts.repo}/compare/${prevTag}...${opts.tag}`;

    const parts = [];
    if (changelog) {
        parts.push(changelog);
        parts.push('');
    } else {
        parts.push(`Release **${opts.tag}**.`);
        parts.push('');
    }

    parts.push('## Downloads');
    parts.push('');
    if (assets.downloads.length === 0) {
        parts.push('_No release binaries found._');
    } else {
        const rows = assets.downloads.map((f) => [
            `\`${f.name}\``,
            formatSizeKb(f.bytes),
            `\`${f.crc32}\``,
            `\`${f.sha256.slice(0, 16)}…\``,
        ]);
        parts.push(markdownTable(rows, ['File', 'Size', 'CRC32', 'SHA-256']));
        parts.push('');
        parts.push('<details>');
        parts.push('<summary>Full SHA-256 checksums</summary>');
        parts.push('');
        for (const f of assets.downloads) {
            parts.push(`- \`${f.name}\`: \`${f.sha256}\``);
        }
        parts.push('');
        parts.push('</details>');
    }

    if (assets.metadata.length > 0) {
        parts.push('## Autoupdate metadata');
        parts.push('');
        const rows = assets.metadata.map((f) => [`\`${f.name}\``, formatSizeKb(f.bytes)]);
        parts.push(markdownTable(rows, ['File', 'Size']));
        parts.push('');
    }

    parts.push(`**Full changelog:** ${compareUrl}`);
    parts.push('');
    return parts.join('\n');
}

/** @param {string} version */
function findPreviousTag(version) {
    try {
        const tags = fs
            .readdirSync('.git/refs/tags')
            .filter((t) => /^v\d+\.\d+\.\d+$/.test(t))
            .map((t) => t.slice(1))
            .sort((a, b) => compareSemver(b, a) - compareSemver(a, b));
        const idx = tags.indexOf(version);
        if (idx >= 0 && idx + 1 < tags.length) {
            return `v${tags[idx + 1]}`;
        }
    } catch {
        /* ignore */
    }
    return `v${version.split('.').map((n, i) => (i < 2 ? n : '0')).join('.')}`;
}

function compareSemver(a, b) {
    const pa = a.split('.').map(Number);
    const pb = b.split('.').map(Number);
    for (let i = 0; i < 3; i++) {
        if ((pa[i] || 0) !== (pb[i] || 0)) {
            return (pa[i] || 0) - (pb[i] || 0);
        }
    }
    return 0;
}

function main() {
    const opts = parseArgs(process.argv);
    const assets = collectReleaseAssets(opts.dist);
    const notes = buildReleaseNotes(opts, assets);
    fs.writeFileSync(opts.out, notes, 'utf8');
    console.log(`Wrote ${opts.out} (${assets.downloads.length} binaries)`);
}

if (import.meta.url === new URL(process.argv[1], 'file:').href) {
    main();
}
