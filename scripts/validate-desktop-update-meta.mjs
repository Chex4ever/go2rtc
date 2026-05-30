#!/usr/bin/env node
/**
 * CI guard: desktop-update-meta must match manifest diff (no fake changed_files: 0).
 *
 * Usage:
 *   node scripts/validate-desktop-update-meta.mjs \
 *     --meta desktop/electron-viewer/release-ci/desktop-update-meta-X.json \
 *     --from-manifest prev.json \
 *     --to-manifest curr.json \
 *     --out-dir desktop/electron-viewer/release-ci
 */
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';

const req = createRequire(import.meta.url);
const {diffManifests, shouldUseFullUpdate, patchZipName} = req('../desktop/electron-viewer/shell-patch-lib.js');

function parseArgs(argv) {
    const out = {};
    for (let i = 2; i < argv.length; i++) {
        const key = argv[i].replace(/^--/, '');
        out[key] = argv[++i];
    }
    return out;
}

function fail(msg) {
    console.error('validate-desktop-update-meta:', msg);
    process.exit(1);
}

function main() {
    const args = parseArgs(process.argv);
    const metaPath = path.resolve(args.meta);
    const fromPath = path.resolve(args['from-manifest']);
    const toPath = path.resolve(args['to-manifest']);
    const outDir = path.resolve(args['out-dir'] || path.dirname(metaPath));

    if (!fs.existsSync(metaPath)) {
        fail(`meta file not found: ${metaPath}`);
    }
    if (!fs.existsSync(fromPath)) {
        fail(`from-manifest not found: ${fromPath}`);
    }
    if (!fs.existsSync(toPath)) {
        fail(`to-manifest not found: ${toPath}`);
    }

    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    if (meta.patch_skip_reason) {
        console.log('Skip validation:', meta.patch_skip_reason);
        return;
    }

    const fromManifest = JSON.parse(fs.readFileSync(fromPath, 'utf8'));
    const toManifest = JSON.parse(fs.readFileSync(toPath, 'utf8'));
    const diff = diffManifests(fromManifest, toManifest);
    const from = String(meta.from || fromManifest.version || '').trim();
    const to = String(meta.to || toManifest.version || meta.version || '').trim();

    if (typeof meta.changed_files === 'number' && meta.changed_files !== diff.changed.length) {
        fail(
            `changed_files=${meta.changed_files} but manifest diff has ${diff.changed.length} file(s)`,
        );
    }

    if (!diff.changed.length) {
        if (meta.update_kind !== 'none') {
            fail(`no shell diff but update_kind=${meta.update_kind} (expected none)`);
        }
        if (meta.shell_changed !== false) {
            fail('no shell diff but shell_changed is not false');
        }
        console.log('OK viewer-only release (update_kind: none)');
        return;
    }

    if (shouldUseFullUpdate(diff)) {
        if (meta.update_kind !== 'full') {
            fail(`large shell diff but update_kind=${meta.update_kind} (expected full)`);
        }
        if (meta.patch_file) {
            fail('full update must not set patch_file');
        }
        console.log(`OK full update (${diff.changed.length} files, ${diff.changedBytes} bytes)`);
        return;
    }

    if (meta.update_kind !== 'patch') {
        fail(`small shell diff but update_kind=${meta.update_kind} (expected patch)`);
    }
    const zipName = patchZipName(from, to);
    if (meta.patch_file && meta.patch_file !== zipName) {
        fail(`patch_file=${meta.patch_file} expected ${zipName}`);
    }
    const zipPath = path.join(outDir, zipName);
    if (!fs.existsSync(zipPath)) {
        fail(`patch zip missing: ${zipPath}`);
    }
    if (!meta.patch_sha256) {
        fail('patch update missing patch_sha256');
    }
    console.log(`OK patch ${zipName} (${diff.changed.length} files)`);
}

main();
