const {describe, it} = require('node:test');
const assert = require('node:assert/strict');
const notify = require('../update-notify');

describe('update-notify', () => {
    it('detects version upgrade', () => {
        assert.equal(notify.shouldNotifyVersionUpgrade('1.2.20', '1.2.21'), true);
        assert.equal(notify.shouldNotifyVersionUpgrade('1.2.21', '1.2.21'), false);
        assert.equal(notify.shouldNotifyVersionUpgrade('', '1.2.21'), false);
    });

    it('forwards events to renderer sender', () => {
        const events = [];
        notify.setUpdateEventSender((event) => events.push(event));
        notify.emitUpdateEvent({kind: 'ready', version: '1.2.21'});
        assert.ok(events.some((e) => e.kind === 'ready' && e.version === '1.2.21'));
        assert.ok(events.some((e) => e.kind === 'state' && e.status === 'ready'));
    });
});
