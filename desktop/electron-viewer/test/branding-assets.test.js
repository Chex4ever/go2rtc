const {describe, it, before, after} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const {generateBrandingAssets, ICON_SIZES, writeBrandingKit} = require('../branding-assets');

const SRC = path.join(__dirname, '..', '..', '..', 'tesla.png');

describe('branding-assets', () => {
    /** @type {string} */
    let tmpDir;

    before(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'branding-test-'));
    });

    after(() => {
        fs.rmSync(tmpDir, {recursive: true, force: true});
    });

    it('generates logo, icons, and ico from source image', async () => {
        if (!fs.existsSync(SRC)) {
            return;
        }
        const out = path.join(tmpDir, 'gen');
        const result = await generateBrandingAssets(SRC, out);
        assert.equal(result.logoFile, 'logo.png');
        assert.ok(fs.existsSync(path.join(out, 'logo.png')));
        assert.ok(fs.existsSync(path.join(out, 'icon.ico')));
        assert.ok(fs.existsSync(path.join(out, 'favicon.ico')));
        for (const size of ICON_SIZES) {
            assert.ok(fs.existsSync(path.join(out, `icon-${size}.png`)), `missing icon-${size}.png`);
        }
    });

    it('writeBrandingKit includes json and deploy readme', () => {
        const kit = path.join(tmpDir, 'kit');
        writeBrandingKit(kit, {orgName: 'Test', logoFile: 'logo.png'}, path.join(__dirname, '..', 'branding'));
        assert.ok(fs.existsSync(path.join(kit, 'branding.json')));
        assert.ok(fs.existsSync(path.join(kit, 'DEPLOY.txt')));
        const json = JSON.parse(fs.readFileSync(path.join(kit, 'branding.json'), 'utf8'));
        assert.equal(json.orgName, 'Test');
    });
});
