#!/usr/bin/env node
/**
 * Build desktop-shell-manifest-{version}.json from electron-builder win-unpacked output.
 *
 * Usage:
 *   node scripts/desktop-shell-manifest.mjs --dir release-ci/win-unpacked --version 1.2.11 --out manifest.json
 */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';

const req = createRequire(import.meta.url);
const {buildManifest, findUnpackedDir} = req('../desktop/electron-viewer/shell-patch-lib.js');

function parseArgs(argv) {
    const out = {dir: '', version: '', out: ''};
    for (let i = 2; i < argv.length; i++) {
        if (argv[i] === '--dir') {
            out.dir = argv[++i];
        } else if (argv[i] === '--output-dir') {
            out.outputDir = argv[++i];
        } else if (argv[i] === '--version') {
            out.version = argv[++i];
        } else if (argv[i] === '--out') {
            out.out = argv[++i];
        }
    }
    return out;
}

async function main() {
    const args = parseArgs(process.argv);
    if (!args.version) {
        console.error('Usage: --version X.Y.Z (--dir win-unpacked | --output-dir release-ci) [--out file.json]');
        process.exit(1);
    }

    let rootDir = args.dir;
    if (!rootDir) {
        if (!args.outputDir) {
            console.error('Provide --dir or --output-dir');
            process.exit(1);
        }
        rootDir = findUnpackedDir(path.resolve(args.outputDir));
    }

    const manifest = await buildManifest(args.version, path.resolve(rootDir));
    const json = `${JSON.stringify(manifest, null, 2)}\n`;
    if (args.out) {
        fs.writeFileSync(args.out, json, 'utf8');
        console.log('Wrote', args.out, `(${manifest.files.length} files)`);
    } else {
        process.stdout.write(json);
    }
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
