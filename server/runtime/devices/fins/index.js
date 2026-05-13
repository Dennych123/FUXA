'use strict';

const path = require('path');
const deviceUtils = require('../device-utils');
let FinsLib = null;

const MAX_BATCH_GAP = 10; // max empty words between tags before splitting into separate batch

function tryLoadFins(manager) {
    try { return require(path.resolve(process.cwd(), '_pkg/mok-omron-fins/omron-fins.cjs')); } catch {}
    try { return require('omron-fins'); } catch {}
    if (manager) {
        try { return manager.require('omron-fins'); } catch {}
    }
    return null;
}

/** Number of 16-bit words needed for each type */
function wordCount(type, stringLength) {
    switch (type) {
        case 'DInt': case 'DWord': case 'Real': return 2;
        case 'LReal': return 4;
        case 'String': return Math.ceil((stringLength || 20) / 2);
        default: return 1; // Bool, Int16, UInt16
    }
}

/**
 * Convert raw word array to typed JS value.
 * Omron double-word layout: words[0] = low word, words[1] = high word.
 */
function parseTypedValue(words, type, bit, stringLength) {
    if (!words || words.length === 0) return undefined;
    switch (type) {
        case 'Bool':
            return bit !== undefined && bit !== null ? (words[0] >> bit) & 1 : words[0];
        case 'UInt16':
            return words[0];
        case 'Int16': {
            const v = words[0];
            return v >= 0x8000 ? v - 0x10000 : v;
        }
        case 'DWord':
            return (((words[1] & 0xFFFF) * 0x10000) + (words[0] & 0xFFFF)) >>> 0;
        case 'DInt': {
            const u = (((words[1] & 0xFFFF) * 0x10000) + (words[0] & 0xFFFF)) >>> 0;
            return u >= 0x80000000 ? u - 0x100000000 : u;
        }
        case 'Real': {
            const buf = Buffer.allocUnsafe(4);
            buf.writeUInt16BE(words[1] & 0xFFFF, 0);
            buf.writeUInt16BE(words[0] & 0xFFFF, 2);
            return buf.readFloatBE(0);
        }
        case 'LReal': {
            const buf = Buffer.allocUnsafe(8);
            buf.writeUInt16BE((words[3] || 0) & 0xFFFF, 0);
            buf.writeUInt16BE((words[2] || 0) & 0xFFFF, 2);
            buf.writeUInt16BE((words[1] || 0) & 0xFFFF, 4);
            buf.writeUInt16BE((words[0] || 0) & 0xFFFF, 6);
            return buf.readDoubleBE(0);
        }
        case 'String': {
            let str = '';
            const maxChars = stringLength || 20;
            for (const w of words) {
                const hi = (w >> 8) & 0xFF;
                const lo = w & 0xFF;
                if (hi === 0) break;
                str += String.fromCharCode(hi);
                if (str.length >= maxChars) break;
                if (lo === 0) break;
                str += String.fromCharCode(lo);
                if (str.length >= maxChars) break;
            }
            return str;
        }
        default:
            return words[0];
    }
}

/**
 * Group tags into contiguous read batches per memory area.
 * Tags within MAX_BATCH_GAP words of each other are merged into one read.
 */
function buildBatches(deviceTags) {
    const byArea = {};
    for (const tag of deviceTags) {
        const area = tag.memaddress || 'D';
        if (!byArea[area]) byArea[area] = [];
        byArea[area].push({ tag, addr: parseInt(tag.address) || 0 });
    }

    const batches = [];
    for (const area of Object.keys(byArea)) {
        const sorted = byArea[area].sort((a, b) => a.addr - b.addr);
        let batch = null;

        for (const item of sorted) {
            const wc = wordCount(item.tag.type, item.tag.format);
            if (!batch) {
                batch = { area, startAddr: item.addr, endAddr: item.addr + wc - 1, items: [item] };
            } else {
                const gap = item.addr - batch.endAddr - 1;
                if (gap <= MAX_BATCH_GAP) {
                    batch.items.push(item);
                    batch.endAddr = Math.max(batch.endAddr, item.addr + wc - 1);
                } else {
                    batches.push(batch);
                    batch = { area, startAddr: item.addr, endAddr: item.addr + wc - 1, items: [item] };
                }
            }
        }
        if (batch) batches.push(batch);
    }
    return batches;
}

function DeviceFins(data, logger, events, manager, runtime) {
    let client = null;
    let values = {};
    let isConnected = false;
    let working = false;
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
                    working = false;
                    this.disconnect();
                    this.scheduleReconnect();
                });

                client.on('timeout', () => {
                    logger.warn('[FINS] Timeout');
                    isConnected = false;
                    isConnecting = false;
                    working = false;
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
            working = false;
            events.emit('device-status:changed', { id: deviceId, status: 'connect-off' });
            resolve();
        });
    };

    this.stop = this.disconnect;
    this.isConnected = () => isConnected;

    this.polling = async function () {
        // task #5: working flag — skip if previous poll still running
        if (working) {
            logger.warn(`'${data.name}' polling overload, skipping`);
            return;
        }
        if (!isConnected || !client || !Array.isArray(deviceTags)) {
            return;
        }

        working = true;
        const changed = [];

        try {
            // task #4: batch reads grouped by memory area
            const batches = buildBatches(deviceTags);

            for (const batch of batches) {
                const totalWords = batch.endAddr - batch.startAddr + 1;
                const finsAddress = `${batch.area}${batch.startAddr}`;

                await new Promise((resolve) => {
                    let timeout = setTimeout(() => {
                        logger.warn(`[FINS] Timeout reading batch ${finsAddress}+${totalWords}`);
                        isConnected = false;
                        working = false;
                        this.scheduleReconnect();
                        resolve();
                    }, 2500);

                    client.read(finsAddress, totalWords, null, finsAddress);

                    client.once('reply', (msg) => {
                        clearTimeout(timeout);
                        const allWords = msg.response.values;
                        if (!allWords) { resolve(); return; }

                        const now = Date.now();
                        lastTimestampValue = now;

                        for (const item of batch.items) {
                            const offset = item.addr - batch.startAddr;
                            const wc = wordCount(item.tag.type, item.tag.format);
                            const words = allWords.slice(offset, offset + wc);
                            const val = parseTypedValue(words, item.tag.type, item.tag.bit, item.tag.format);

                            if (val !== undefined) {
                                const prevVal = values[item.tag.id];
                                item.tag.changed = prevVal !== val;
                                values[item.tag.id] = val;

                                if (item.tag.changed) {
                                    changed.push({ id: item.tag.id, value: val });
                                }
                                // task #6: respect DAQ interval/changed settings
                                if (this.addDaq && deviceUtils.tagDaqToSave(item.tag, now)) {
                                    this.addDaq({ [item.tag.id]: { id: item.tag.id, value: val, ts: now } }, deviceName, deviceId);
                                }
                            }
                        }
                        resolve();
                    });

                    client.once('error', (err) => {
                        clearTimeout(timeout);
                        logger.warn(`[FINS] Error reading batch ${finsAddress}: ${err}`);
                        isConnected = false;
                        working = false;
                        this.scheduleReconnect();
                        resolve();
                    });
                });

                if (!isConnected) break;
            }
        } finally {
            working = false;
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
        let words;

        switch (tag.type) {
            case 'DInt':
            case 'DWord': {
                const u = (Math.trunc(Number(value)) >>> 0);
                words = [u & 0xFFFF, (u >> 16) & 0xFFFF];
                break;
            }
            case 'Real': {
                const buf = Buffer.allocUnsafe(4);
                buf.writeFloatBE(Number(value), 0);
                words = [buf.readUInt16BE(2), buf.readUInt16BE(0)];
                break;
            }
            case 'LReal': {
                const buf = Buffer.allocUnsafe(8);
                buf.writeDoubleBE(Number(value), 0);
                words = [buf.readUInt16BE(6), buf.readUInt16BE(4), buf.readUInt16BE(2), buf.readUInt16BE(0)];
                break;
            }
            case 'String': {
                const str = String(value);
                const count = wordCount('String', tag.format);
                words = new Array(count).fill(0);
                for (let i = 0; i < str.length && i < (tag.format || 20); i++) {
                    const wi = Math.floor(i / 2);
                    if (i % 2 === 0) words[wi] = (str.charCodeAt(i) << 8);
                    else words[wi] |= str.charCodeAt(i);
                }
                break;
            }
            default:
                words = [Math.trunc(Number(value)) & 0xFFFF];
        }

        client.write(finsAddress, words, (err) => {
            if (err) {
                logger.warn(`[FINS] Failed to write to ${finsAddress}: ${err}`);
            } else {
                logger.debug(`[FINS] Wrote to ${finsAddress}`);
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
