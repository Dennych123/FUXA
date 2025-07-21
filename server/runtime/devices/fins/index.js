'use strict';

let fins;

try {
    fins = require('omron-fins');
} catch (err) {
    console.error('[FINS] ❌ Cannot load omron-fins:', err);
}

function DeviceFins(data, logger, events, runtime) {
    let client = null;
    let values = {};
    let isConnected = false;
    let tagMap = {};
    let lastTimestampValue = null;

    const deviceId = data.id;
    const deviceName = data.name;
    let deviceTags = Object.values(data.tags || {});
    const options = data.property || {};

    const host = options.address || '192.168.11.1';
    const port = parseInt(options.port) || 9600;
    const protocol = options.FinsProtocol || 'UDP';
    const SA1 = parseInt(options.SA1) || 234;
    const DA1 = parseInt(options.DA1) || 1;

    logger.debug(`[FINS] 💡 Configuration: IP=${host}, Protocol=${protocol}, SA1=${SA1}, DA1=${DA1}`);

    this.connect = function () {
        return new Promise((resolve, reject) => {
            if (!fins || !fins.FinsClient) {
                logger.error('[FINS] ❌ FinsClient not available. Check omron-fins module.');
                return reject('[FINS] Module unavailable');
            }

            try {
                if (client) {
                    client.removeAllListeners();
                    client = null;
                }

                client = new fins.FinsClient(port, host, {
                    protocol: protocol.toLowerCase(),
                    SA1: SA1,
                    DA1: DA1,
                    timeout: 2000
                });

                client.setMaxListeners(0); // 🔥 Hindari batas listener

                isConnected = true;
                logger.info(`[FINS] ✅ Connected to ${host}:${port}`);
                events.emit('device-status:changed', { id: deviceId, status: 'connect-ok' });
                resolve();

                client.on('error', (err) => {
                    logger.error(`[FINS] ❌ Error: ${err}`);
                    isConnected = false;
                    events.emit('device-status:changed', { id: deviceId, status: 'connect-error' });
                });

                client.on('timeout', () => {
                    logger.warn(`[FINS] ⏰ Timeout`);
                });

            } catch (err) {
                logger.error(`[FINS] ❌ Failed to create FinsClient: ${err}`);
                reject(err);
            }
        });
    };

    this.disconnect = function () {
        return new Promise((resolve) => {
            if (client && client.disconnect) {
                client.removeAllListeners();
                client.disconnect();
            }
            isConnected = false;
            events.emit('device-status:changed', { id: deviceId, status: 'connect-off' });
            resolve();
        });
    };

    this.stop = this.disconnect;

    this.isConnected = () => isConnected;

    this.polling = async function () {
        if (!isConnected || !client || !Array.isArray(deviceTags)) {
            logger.warn('[FINS] ❌ Polling aborted due to missing condition.');
            return;
        }

        let changed = [];

        for (let tag of deviceTags) {
            try {
                await new Promise((resolve) => {
                    const finsAddress = `${tag.memaddress}${tag.address}`;

                    // 🧹 Hapus listener sebelumnya
                    client.removeAllListeners('reply');
                    client.removeAllListeners('error');
                    client.removeAllListeners('timeout');

                    // ⏱️ Set listener one-time baru
                    client.once('reply', (msg) => {
                        const val = msg.response.values?.[0];
                        const now = Date.now();
                        if (val !== undefined && values[tag.id] !== val) {
                            values[tag.id] = val;
                            changed.push({ id: tag.id, value: val });
                            if (this.addDaq) {
                                this.addDaq({ [tag.id]: { id: tag.id, value: val, ts: now } }, deviceName, deviceId);
                            }
                        }
                        resolve();
                    });

                    client.once('error', () => resolve());
                    client.once('timeout', () => resolve());

                    client.read(finsAddress, 1, null, tag.name);
                });
            } catch (err) {
                logger.warn(`[FINS] Polling error for ${tag.name}: ${err}`);
            }
        }

        if (changed.length) {
            events.emit('device-value:changed', { id: deviceId, values: changed });
        }
    };

    this.getValues = () => {
        return Object.entries(values).map(([id, value]) => ({ id, value }));
    };

    this.getValue = (tagId) => {
        return {
            id: tagId,
            value: values[tagId],
            ts: Date.now()
        };
    };

    this.getStatus = () => isConnected ? 'connect-ok' : 'connect-off';

    this.load = (_data) => {
        if (_data.tags) {
            data.tags = _data.tags;
            deviceTags = Object.values(_data.tags);
        }
    };

    this.setValue = function (tagId, value) {
        const tag = deviceTags.find(t => t.id === tagId);
        if (!client || !tag) return;

        const finsAddress = `${tag.memaddress}${tag.address}`;
        client.write(finsAddress, [value], (err) => {
            if (err) {
                logger.warn(`[FINS] ❌ Failed to write ${value} to ${finsAddress}: ${err}`);
            } else {
                logger.debug(`[FINS] ✅ Wrote ${value} to ${finsAddress}`);
                values[tagId] = value;
            }
        });
    };

    this.getTagProperty = function (tagId) {
        return {};
    };

    this.bindAddDaq = function (fnc) {
        this.addDaq = fnc;
    };

    this.lastReadTimestamp = () => Date.now();

    this.getTagDaqSettings = () => ({});
    this.setTagDaqSettings = () => {};
}

module.exports = {
    init: function (settings) { },
    create: function (data, logger, events, manager, runtime) {
        return new DeviceFins(data, logger, events, runtime);
    }
};
