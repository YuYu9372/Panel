const crypto = require('crypto');
const { EventEmitter } = require('events');
const fs = require('fs');
const path = require('path');
const { verifyPatchEnvelope } = require('./patch-security');

const MAX_MANIFEST_BYTES = 128 * 1024;

async function readLimitedText(response) {
  if (!response.body || typeof response.body.getReader !== 'function') {
    const text = await response.text();
    if (Buffer.byteLength(text, 'utf8') > MAX_MANIFEST_BYTES) {
      throw new Error('Live patch manifest is too large.');
    }
    return text;
  }
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_MANIFEST_BYTES) {
      await reader.cancel();
      throw new Error('Live patch manifest is too large.');
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks).toString('utf8');
}

class PatchManager extends EventEmitter {
  constructor({
    appVersion,
    userDataPath,
    fetcher,
    manifestBaseUrl,
    trust,
    fsModule = fs,
    now = () => Date.now(),
    allowHttp = false,
  }) {
    super();
    this.appVersion = appVersion;
    this.fetcher = fetcher;
    this.manifestBaseUrl = manifestBaseUrl;
    this.trust = trust;
    this.fs = fsModule;
    this.now = now;
    this.allowHttp = allowHttp;
    this.directory = path.join(userDataPath, 'ui-patches');
    this.file = path.join(this.directory, 'state.json');
    this.runtimeStatus = 'idle';
    this.runtimeMessage = '';
    this.state = this.loadState();
  }

  defaultState() {
    return {
      schemaVersion: 1,
      active: null,
      previous: null,
      pendingPatchId: null,
      channelSequences: { stable: 0, developer: 0 },
    };
  }

  loadState() {
    let state = this.defaultState();
    try {
      if (this.fs.existsSync(this.file)) {
        state = JSON.parse(this.fs.readFileSync(this.file, 'utf8'));
      }
      if (state.schemaVersion !== 1
          || !state.channelSequences
          || typeof state.channelSequences !== 'object') {
        throw new Error('Unsupported live patch state.');
      }
      for (const channel of ['stable', 'developer']) {
        if (!Number.isSafeInteger(state.channelSequences[channel])
            || state.channelSequences[channel] < 0) {
          state.channelSequences[channel] = 0;
        }
      }
      if (state.pendingPatchId) {
        state.active = state.previous || null;
        state.previous = null;
        state.pendingPatchId = null;
        this.writeState(state);
      }
      if (state.active) this.verifyStoredEnvelope(state.active);
      if (state.previous) this.verifyStoredEnvelope(state.previous);
      return state;
    } catch {
      this.runtimeStatus = 'error';
      this.runtimeMessage = 'Saved live patch was rejected.';
      return this.defaultState();
    }
  }

  verifyStoredEnvelope(envelope) {
    const channel = envelope && envelope.signed && envelope.signed.channel;
    const trustedKey = this.trust[channel];
    if (!trustedKey) throw new Error('Stored patch uses an unknown channel.');
    return verifyPatchEnvelope(envelope, {
      channel,
      currentVersion: this.appVersion,
      now: this.now(),
      ...trustedKey,
    });
  }

  writeState(state = this.state) {
    this.fs.mkdirSync(this.directory, { recursive: true, mode: 0o700 });
    this.fs.chmodSync(this.directory, 0o700);
    const temporary = path.join(this.directory, `state-${crypto.randomUUID()}.tmp`);
    this.fs.writeFileSync(temporary, `${JSON.stringify(state, null, 2)}\n`, {
      encoding: 'utf8',
      flag: 'wx',
      mode: 0o600,
    });
    this.fs.renameSync(temporary, this.file);
    this.fs.chmodSync(this.file, 0o600);
  }

  patchForChannel(channel) {
    if (!this.state.active || this.state.active.signed.channel !== channel) return null;
    try {
      const signed = this.verifyStoredEnvelope(this.state.active);
      const patch = { patchId: signed.patchId, sequence: signed.sequence };
      if (signed.ui) patch.ui = signed.ui;
      if (signed.statusColors) patch.statusColors = signed.statusColors;
      if (signed.refreshPolicy) patch.refreshPolicy = signed.refreshPolicy;
      return patch;
    } catch {
      return null;
    }
  }

  snapshot(channel) {
    return {
      status: this.runtimeStatus,
      message: this.runtimeMessage,
      patch: this.patchForChannel(channel),
    };
  }

  publish(channel) {
    this.emit('state', this.snapshot(channel));
  }

  async check(channel) {
    const trustedKey = this.trust[channel];
    if (!trustedKey || !this.manifestBaseUrl) {
      this.runtimeStatus = 'unconfigured';
      this.runtimeMessage = 'Live patch feed is not configured.';
      this.publish(channel);
      return this.snapshot(channel);
    }
    this.runtimeStatus = 'checking';
    this.runtimeMessage = 'Checking signed live patches…';
    this.publish(channel);
    try {
      const manifestUrl = new URL(`${channel}-live-patch.json`, this.manifestBaseUrl);
      const localDevelopmentFeed = this.allowHttp
        && ['127.0.0.1', 'localhost', '::1'].includes(manifestUrl.hostname);
      if (manifestUrl.protocol !== 'https:' && !localDevelopmentFeed) {
        throw new Error('Live patch feed must use HTTPS.');
      }
      const response = await this.fetcher(manifestUrl.href, {
        method: 'GET',
        redirect: 'follow',
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) throw new Error(`Live patch feed returned ${response.status}.`);
      const text = await readLimitedText(response);
      const envelope = JSON.parse(text);
      const signed = verifyPatchEnvelope(envelope, {
        channel,
        currentVersion: this.appVersion,
        now: this.now(),
        ...trustedKey,
      });
      const currentSequence = this.state.channelSequences[channel] || 0;
      if (signed.sequence <= currentSequence) {
        this.runtimeStatus = 'idle';
        this.runtimeMessage = 'Live configuration is up to date.';
        this.publish(channel);
        return this.snapshot(channel);
      }
      this.state.previous = this.state.active;
      this.state.active = envelope;
      this.state.pendingPatchId = signed.patchId;
      this.state.channelSequences[channel] = signed.sequence;
      this.writeState();
      this.runtimeStatus = 'applied';
      this.runtimeMessage = 'Signed live patch applied.';
      this.publish(channel);
      return this.snapshot(channel);
    } catch {
      this.runtimeStatus = 'error';
      this.runtimeMessage = 'Signed live patch check failed.';
      this.publish(channel);
      return this.snapshot(channel);
    }
  }

  confirm(patchId, channel) {
    if (!patchId || this.state.pendingPatchId !== patchId) return false;
    if (!this.state.active || this.state.active.signed.channel !== channel) return false;
    this.state.pendingPatchId = null;
    this.state.previous = null;
    this.writeState();
    this.runtimeStatus = 'idle';
    this.runtimeMessage = 'Live patch health check passed.';
    this.publish(channel);
    return true;
  }

  reportFailure(patchId, channel) {
    if (!patchId
        || this.state.pendingPatchId !== patchId
        || !this.state.active
        || this.state.active.signed.patchId !== patchId) return false;
    this.state.active = this.state.previous || null;
    this.state.previous = null;
    this.state.pendingPatchId = null;
    this.writeState();
    this.runtimeStatus = 'rolled-back';
    this.runtimeMessage = 'Live patch failed its health check and was rolled back.';
    this.publish(channel);
    return true;
  }
}

module.exports = { PatchManager, readLimitedText };
