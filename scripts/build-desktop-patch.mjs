#!/usr/bin/env node
/**
 * Diff shell manifests and build a patch zip (changed install files only).
 *
 * Usage:
 *   node scripts/build-desktop-patch.mjs \
 *     --root release-ci/win-unpacked \
 *     --from-manifest prev.json \
 *     --to-manifest curr.json \
 *     --out-dir release-ci
 */
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';

const req = createRequire(import.meta.url);
const {
    diffManifests,
    shouldUseFullUpdate,
    patchZipName,
    updateMetaFileName,
    buildPatchZip,
    findUnpackedDir,
} = req('../desktop/electron-viewer/shell-patch-lib.js');

function parseArgs(argv) {
    const out = {};
    for (let i = 2; i < argv.length; i++) {
        const key = argv[i].replace(/^--/, '');
        out[key] = argv[++i];
    }
    return out;
}

function main() {
    const args = parseArgs(process.argv);
    const fromManifest = JSON.parse(fs.readFileSync(args['from-manifest'], 'utf8'));
    const toManifest = JSON.parse(fs.readFileSync(args['to-manifest'], 'utf8'));
    const from = fromManifest.version;
    const to = toManifest.version;
    const outDir = path.resolve(args['out-dir'] || path.dirname(args['to-manifest']));

    let rootDir = args.root;
    if (!rootDir && args['output-dir']) {
        rootDir = findUnpackedDir(path.resolve(args['output-dir']));
    }
    if (!rootDir) {
        console.error('Provide --root or --output-dir');
        process.exit(1);
    }
    rootDir = path.resolve(rootDir);

    const diff = diffManifests(fromManifest, toManifest);
    const meta = {
        version: to,
        from,
        to,
        shell_changed: diff.changed.length > 0,
        update_kind: 'full',
        changed_files: diff.changed.length,
        changed_bytes: diff.changedBytes,
        total_bytes: diff.totalBytes,
        patch_file: '',
        patch_sha256: '',
    };

    if (!diff.changed.length) {
        meta.update_kind = 'none';
        meta.shell_changed = false;
    } else if (shouldUseFullUpdate(diff)) {
        meta.update_kind = 'full';
    } else {
        const zipName = patchZipName(from, to);
        const outZip = path.join(outDir, zipName);
        const sha256 = buildPatchZip({rootDir, from, to, changed: diff.changed, outZip});
        meta.update_kind = 'patch';
        meta.patch_file = zipName;
        meta.patch_sha256 = sha256;
        console.log('Patch', outZip, `(${diff.changed.length} files, ${diff.changedBytes} bytes)`);
    }

    const metaPath = path.join(outDir, updateMetaFileName(to));
    fs.writeFileSync(metaPath, `${JSON.stringify(meta, null, 2)}\n`, 'utf8');
    console.log('Wrote', metaPath, JSON.stringify(meta));
}

main();
