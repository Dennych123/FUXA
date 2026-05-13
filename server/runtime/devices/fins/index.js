'use strict';

const path = require('path');
let FinsLib = null;

function tryLoadFins(manager) {
    try { return require(path.resolve(process.cwd(), '_pkg/mok-omron-fins/omron-fins.cjs')); } catch {}
    try { return require('omron-fins'); } catch {}
    if (manager) {
        try { return manager.require('omron-fins'); } catch {}
    }
    return null;
}

function DeviceFins(data, logger, events, manager, runtime) {
    let client = null;
    let values = {};
    let isConnected = false;
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

    logger.debug(`[FINS] Configuration: IP=${host}, Protocol=${protocol}, SA1=${SA1}, DA1=${DA1}`);

    this.scheduleReconnect = function () {
        if (isConnected || isConnecting) return;
        if (reconnectTimer) clearTimeout(reconnectTimer);
        reconnectTimer = setTimeout(() => {
            logger.info('[FINS] Trying to reconnect...');
            this.connect().catch((err) => {
                logger.warn('[FINS] Reconnect failed:', err);
            });
        }, 3000);
    }.bind(this);

    this.connect = function () {
        return new Promise((resolve, reject) => {
            if (!FinsLib) FinsLib = tryLoadFins(manager);
            if (!FinsLib || !FinsLib.FinsClient) {
                logger.error(`'${data.name}' omron-fins not available`);
                events.emit('device-status:changed', { id: deviceId, status: 'connect-error' });
                return reject(new Error('omron-fins not available'));
            }

            isConnecting = true;

            try {
                if (client) {
                    client.removeAllListeners();
                    if (client.disconnect) client.disconnect();
                    if (client.close) client.close();
                    client = null;
                }

                client = new FinsLib.FinsClient(port, host, {
                    protocol: protocol.toLowerCase(),
                    SA1: SA1,
                    DA1: DA1,
                    timeout: 2000
                });

                client.setMaxListeners(0);

                client.on('error', (err) => {
                    logger.error(`[FINS] Error: ${err}`);
                    isConnected = false;
                    isConnecting = false;
                    this.disconnect();
                    this.scheduleReconnect();
                });

                client.on('timeout', () => {
                    logger.warn('[FINS] Timeout');
                    isConnected = false;
                    isConnecting = false;
                    this.disconnect();
                    this.scheduleReconnect();
                });

                isConnected = true;
                isConnecting = false;
                logger.info(`'${data.name}' connected to ${host}:${port}`, true);
                events.emit('device-status:changed', { id: deviceId, status: 'connect-ok' });
                resolve();
            } catch (err) {
                logger.error(`[FINS] Failed to connect: ${err}`);
                isConnected = false;
                isConnecting = false;
                events.emit('device-status:changed', { id: deviceId, status: 'connect-error' });
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
            logger.warn('[FINS] Polling skipped: not connected');
            return;
        }

        const changed = [];

        for (const tag of deviceTags) {
            try {
                await new Promise((resolve) => {
                    const finsAddress = `${tag.memaddress}${tag.address}`;

                    let timeout = setTimeout(() => {
                        logger.warn(`[FINS] Timeout polling tag ${tag.name}`);
                        isConnected = false;
                        this.scheduleReconnect();
                        resolve();
                    }, 2500);

                    client.read(finsAddress, 1, null, tag.name);

                    client.once('reply', (msg) => {
                        clearTimeout(timeout);
                        let val = msg.response.values?.[0];
                        const now = Date.now();
                        lastTimestampValue = now;

                        if (val !== undefined) {
                            if (tag.type === 'Bool' && tag.bit !== undefined && tag.bit !== null) {
                                val = (val >> tag.bit) & 1;
                            }
                            if (tag.divisor && tag.divisor !== 1) {
                                val = val / tag.divisor;
                            }
                            if (values[tag.id] !== val) {
                                values[tag.id] = val;
                                changed.push({ id: tag.id, value: val });
                                if (this.addDaq) {
                                    this.addDaq({ [tag.id]: { id: tag.id, value: val, ts: now } }, deviceName, deviceId);
                                }
                            }
                        }
                        resolve();
                    });

                    client.once('error', (err) => {
                        clearTimeout(timeout);
                        logger.warn(`[FINS] Error polling tag ${tag.name}: ${err}`);
                        isConnected = false;
                        this.scheduleReconnect();
                        resolve();
                    });
                });
            } catch (err) {
                logger.warn(`[FINS] Polling exception on ${tag.name}: ${err}`);
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
                logger.warn(`[FINS] Failed to write ${value} to ${finsAddress}: ${err}`);
            } else {
                logger.debug(`[FINS] Wrote ${value} to ${finsAddress}`);
                values[tagId] = value;
            }
        });
    };

    this.getTagProperty = (id) => {
        if (data.tags[id]) {
            return { id, name: data.tags[id].name, type: data.tags[id].type, format: data.tags[id].format };
        }
        return null;
    };

    this.bindAddDaq = function (fnc) { this.addDaq = fnc; };
    this.addDaq = null;

    this.lastReadTimestamp = () => lastTimestampValue;

    this.getTagDaqSettings = (tagId) => data.tags[tagId] ? data.tags[tagId].daq : null;

    this.setTagDaqSettings = (tagId, settings) => {
        if (data.tags[tagId]) {
            data.tags[tagId].daq = { ...data.tags[tagId].daq, ...settings };
        }
    };
}

module.exports = {
    init: function () { },
    create: function (data, logger, events, manager, runtime) {
        return new DeviceFins(data, logger, events, manager, runtime);
    }
};
