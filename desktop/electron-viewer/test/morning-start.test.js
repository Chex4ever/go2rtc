const {describe, it} = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const {pathToFileURL} = require('node:url');

async function loadMorningStart() {
    const modPath = path.join(__dirname, '..', '..', '..', 'www', 'viewer', 'morning-start.js');
    return import(pathToFileURL(modPath).href);
}

describe('planMorningStart — zero-click morning', () => {
    it('opens last stored layout when auto_open enabled', async () => {
        const {planMorningStart} = await loadMorningStart();
        const plan = planMorningStart({
            layouts: [{id: 'wall_6'}, {id: 'wall_25'}],
            user: 'operator',
            autoOpen: true,
            defaultLayoutId: '',
            storedLayoutId: 'wall_25',
        });
        assert.deepEqual(plan, {action: 'open', layoutId: 'wall_25'});
    });

    it('uses default_layout on first visit', async () => {
        const {planMorningStart} = await loadMorningStart();
        const plan = planMorningStart({
            layouts: [{id: 'lobby'}, {id: 'wall_25'}],
            user: 'operator',
            autoOpen: true,
            defaultLayoutId: 'wall_25',
        });
        assert.equal(plan.action, 'open');
        assert.equal(plan.layoutId, 'wall_25');
    });

    it('shows picker when autoOpen disabled', async () => {
        const {planMorningStart} = await loadMorningStart();
        assert.deepEqual(
            planMorningStart({
                layouts: [{id: 'a'}],
                user: 'x',
                autoOpen: false,
            }),
            {action: 'picker'},
        );
    });

    it('shows picker when no layouts', async () => {
        const {planMorningStart} = await loadMorningStart();
        assert.deepEqual(
            planMorningStart({layouts: [], user: 'x', autoOpen: true}),
            {action: 'picker'},
        );
    });
});
