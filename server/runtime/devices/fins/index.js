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
    let reconnectTimer = null;
    let isConnecting = false;
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

    this.scheduleReconnect = function () {
    if (isConnected || isConnecting) return;

    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(() => {
        logger.info('[FINS] 🔄 Trying to reconnect...');
        this.connect().catch((err) => {
            logger.warn('[FINS] ❌ Reconnect failed:', err);
        });
    }, 3000);
}.bind(this);

    this.connect = function () {
    return new Promise((resolve, reject) => {
        if (!fins || !fins.FinsClient) {
            logger.error('[FINS] ❌ FinsClient not available.');
            return reject('[FINS] Module unavailable');
        }

        isConnecting = true;

        try {
            if (client) {
                client.removeAllListeners();
                if (client.disconnect) client.disconnect();
                if (client.close) client.close();
                client = null;
            }

            client = new fins.FinsClient(port, host, {
                protocol: protocol.toLowerCase(),
                SA1: SA1,
                DA1: DA1,
                timeout: 2000
            });

            client.setMaxListeners(0);

            client.on('error', (err) => {
                logger.error(`[FINS] ❌ Error: ${err}`);

                isConnected = false;
                isConnecting = false;
                this.disconnect(); // paksa bersihkan
                this.scheduleReconnect();
            });

            client.on('timeout', () => {
                logger.warn(`[FINS] ⏰ Timeout`);
                isConnected = false;
                isConnecting = false;
                this.disconnect(); // paksa bersihkan
                this.scheduleReconnect();
            });

            isConnected = true;
            isConnecting = false;
            logger.info(`[FINS] ✅ Connected to ${host}:${port}`);
            events.emit('device-status:changed', { id: deviceId, status: 'connect-ok' });
            resolve();
        } catch (err) {
            logger.error(`[FINS] ❌ Failed to connect: ${err}`);
            isConnected = false;
            isConnecting = false;
            this.scheduleReconnect();
            reject(err);
        }
    });
};


    this.disconnect = () => {
        return new Promise((resolve) => {
            if (client) {
                client.removeAllListeners();
                if (client.disconnect) client.disconnect();
                client = null;
            }
            if (reconnectTimer) {
                clearTimeout(reconnectTimer);
                reconnectTimer = null;
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
        logger.warn('[FINS] ❌ Polling skipped.');
        return;
    }

    const changed = [];

    for (const tag of deviceTags) {
        try {
            await new Promise((resolve) => {
                const finsAddress = `${tag.memaddress}${tag.address}`;


                let timeout = setTimeout(() => {
                    logger.warn(`[FINS] ⏰ Timeout saat polling tag ${tag.name}`);
                    isConnected = false;
                    this.scheduleReconnect();
                    resolve();
                }, 2500);

                client.read(finsAddress, 1, null, tag.name);

                client.once('reply', (msg) => {
                    clearTimeout(timeout);
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

                client.once('error', (err) => {
                    clearTimeout(timeout);
                    logger.warn(`[FINS] ❌ Error saat polling tag ${tag.name}: ${err}`);
                    isConnected = false;
                    this.scheduleReconnect();
                    resolve();
                });
            });
        } catch (err) {
            logger.warn(`[FINS] ❌ Polling exception on ${tag.name}: ${err}`);
        }
    }

    if (changed.length) {
        events.emit('device-value:changed', { id: deviceId, values: changed });
    }
};

    this.getValues = () => Object.entries(values).map(([id, value]) => ({ id, value }));

    this.getValue = (tagId) => ({
        id: tagId,
        value: values[tagId],
        ts: Date.now()
    });

    this.getStatus = () => isConnected ? 'connect-ok' : 'connect-off';

    this.load = (_data) => {
        if (_data.tags) {
            data.tags = _data.tags;
            deviceTags = Object.values(_data.tags);
        }
    };

    this.setValue = (tagId, value) => {
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

    this.getTagProperty = () => ({});
    this.bindAddDaq = (fnc) => this.addDaq = fnc;
    this.lastReadTimestamp = () => Date.now();
    this.getTagDaqSettings = () => ({});
    this.setTagDaqSettings = () => {};
}

module.exports = {
    init: function () { },
    create: function (data, logger, events, manager, runtime) {
        return new DeviceFins(data, logger, events, runtime);
    }
};