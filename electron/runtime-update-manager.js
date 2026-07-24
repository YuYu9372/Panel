const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');
const { verifyRuntimeFeed } = require('./runtime-feed');

const MAX_FEED_BYTES = 128 * 1024;

function contentLength(response) {
  const value = response.headers.get('content-length');
  if (value === null) return null;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error('Content length is not valid.');
  return parsed;
}

class RuntimeUpdateManager extends EventEmitter {
  constructor({
    enabled,
    bootstrap,
    fetcher,
    feedUrl,
    publicKey,
    keyId,
    channel,
    currentVersion,
    bootstrapApiVersion,
    runtimeApiVersion,
    downloadDirectory,
    fsModule = fs,
  }) {
    super();
    this.enabled = Boolean(enabled);
    this.bootstrap = bootstrap;
    this.fetcher = fetcher;
    this.feedUrl = feedUrl;
    this.publicKey = publicKey;
    this.keyId = keyId;
    this.channel = channel;
    this.currentVersion = currentVersion;
    this.bootstrapApiVersion = bootstrapApiVersion;
    this.runtimeApiVersion = runtimeApiVersion;
    this.downloadDirectory = downloadDirectory;
    this.fs = fsModule;
    this.checkInFlight = null;
    this.operationInFlight = false;
    this.availableFeed = null;
    this.state = {
      status: this.enabled ? 'idle' : 'unavailable',
      currentRevision: 0,
      availableRevision: 0,
      progress: 0,
      releaseNotes: [],
      message: this.enabled
        ? 'Runtime updates are checked securely.'
        : 'Runtime Update is not available in this build.',
    };
  }

  snapshot() {
    return JSON.parse(JSON.stringify(this.state));
  }

  updateState(changes) {
    this.state = { ...this.state, ...changes };
    this.emit('state', this.snapshot());
  }

  transitionActive() {
    return this.operationInFlight
      || [
        'downloading',
        'verifying',
        'staged',
        'updating',
        'rollingBack',
        'recovery',
      ].includes(this.state.status);
  }

  async prepareForLaunch() {
    if (!this.enabled) return null;
    const runtimeState = await this.bootstrap.status();
    this.updateState({ currentRevision: runtimeState.runtimeRevision || 0 });
    if (!runtimeState.awaitingHealth) return runtimeState;
    this.operationInFlight = true;
    try {
      this.updateState({
        status: 'recovery',
        progress: 15,
        phase: 'Recovering',
        message: 'An unconfirmed Runtime was found. Restoring the previous Runtime…',
      });
      await this.bootstrap.rollback();
      const restored = await this.bootstrap.status();
      this.updateState({
        status: 'rolledBack',
        currentRevision: restored.runtimeRevision || 0,
        availableRevision: 0,
        progress: 100,
        phase: 'Recovered',
        releaseNotes: [],
        message: 'The previous Runtime was restored after an interrupted update.',
      });
      return restored;
    } finally {
      this.operationInFlight = false;
    }
  }

  verificationOptions() {
    return {
      keyId: this.keyId,
      publicKey: this.publicKey,
      channel: this.channel,
      currentVersion: this.currentVersion,
      bootstrapApiVersion: this.bootstrapApiVersion,
      runtimeApiVersion: this.runtimeApiVersion,
      now: Date.now(),
    };
  }

  async readFeed() {
    const response = await this.fetcher(this.feedUrl, {
      cache: 'no-store',
      headers: { Accept: 'application/json' },
      redirect: 'follow',
    });
    if (!response.ok) throw new Error('Runtime feed request failed.');
    const declaredLength = contentLength(response);
    if (declaredLength !== null && declaredLength > MAX_FEED_BYTES) {
      throw new Error('Runtime feed is too large.');
    }
    const text = await response.text();
    if (Buffer.byteLength(text) > MAX_FEED_BYTES) throw new Error('Runtime feed is too large.');
    let envelope;
    try {
      envelope = JSON.parse(text);
    } catch {
      throw new Error('Runtime feed is not valid JSON.');
    }
    return verifyRuntimeFeed(envelope, this.verificationOptions());
  }

  async check() {
    if (!this.enabled) return this.snapshot();
    if (this.state.status === 'staged') return this.snapshot();
    if (this.checkInFlight) return this.checkInFlight;
    this.checkInFlight = this.performCheck().finally(() => {
      this.checkInFlight = null;
    });
    return this.checkInFlight;
  }

  async performCheck() {
    this.updateState({
      status: 'checking',
      progress: 0,
      phase: null,
      message: 'Checking for Runtime updates…',
    });
    try {
      const runtimeState = await this.bootstrap.status();
      this.updateState({ currentRevision: runtimeState.runtimeRevision || 0 });
      if (runtimeState.pendingRevision) {
        this.availableFeed = null;
        this.updateState({
          status: 'staged',
          availableRevision: runtimeState.pendingRevision,
          progress: 100,
          releaseNotes: [],
          message: `Runtime r${runtimeState.pendingRevision} is verified and ready.`,
          phase: 'Ready',
        });
        return this.snapshot();
      }
      if (runtimeState.awaitingHealth) {
        this.availableFeed = null;
        this.updateState({
          status: 'recovery',
          availableRevision: runtimeState.runtimeRevision || 0,
          progress: 100,
          releaseNotes: [],
          message: 'Runtime health confirmation is pending.',
          phase: 'Recovery required',
        });
        return this.snapshot();
      }
      const feed = await this.readFeed();
      const usedRevision = feed.runtimeRevision <= (runtimeState.highestRuntimeRevision || 0);
      const usedSequence = feed.sequence <= (runtimeState.highestSequence || 0);
      if (usedRevision || usedSequence) {
        if (usedRevision !== usedSequence) throw new Error('Runtime feed history is inconsistent.');
        this.availableFeed = null;
        this.updateState({
          status: 'idle',
          availableRevision: 0,
          progress: 0,
          releaseNotes: [],
          phase: null,
          message: 'Runtime is up to date.',
        });
        return this.snapshot();
      }
      this.availableFeed = feed;
      this.updateState({
        status: 'available',
        availableRevision: feed.runtimeRevision,
        progress: 0,
        releaseNotes: feed.releaseNotes,
        phase: null,
        message: `Runtime r${feed.runtimeRevision} is available.`,
      });
    } catch {
      this.availableFeed = null;
      this.updateState({
        status: 'error',
        phase: null,
        message: 'The secure Runtime update check failed.',
      });
    }
    return this.snapshot();
  }

  async downloadAndStage() {
    if (this.operationInFlight) throw new Error('Another Runtime operation is active.');
    if (this.state.status !== 'available' || !this.availableFeed) {
      throw new Error('No Runtime update is ready to download.');
    }
    this.operationInFlight = true;
    const feed = this.availableFeed;
    let handle = null;
    let temporaryFile = '';
    try {
      this.updateState({
        status: 'downloading',
        progress: 0,
        phase: null,
        message: 'Downloading Runtime…',
      });
      const response = await this.fetcher(feed.package.url, {
        cache: 'no-store',
        headers: { Accept: 'application/zip' },
        redirect: 'follow',
      });
      if (!response.ok || !response.body) throw new Error('Runtime package request failed.');
      const declaredLength = contentLength(response);
      if (declaredLength !== null && declaredLength !== feed.package.size) {
        throw new Error('Runtime package size does not match the feed.');
      }
      await this.fs.promises.mkdir(this.downloadDirectory, { recursive: true, mode: 0o700 });
      await this.fs.promises.chmod(this.downloadDirectory, 0o700);
      temporaryFile = path.join(
        this.downloadDirectory,
        `runtime-r${feed.runtimeRevision}-${crypto.randomUUID()}.pending`,
      );
      handle = await this.fs.promises.open(temporaryFile, 'wx', 0o600);
      const reader = response.body.getReader();
      const hasher = crypto.createHash('sha256');
      let received = 0;
      let lastProgress = -1;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = Buffer.from(value);
        received += chunk.length;
        if (received > feed.package.size) throw new Error('Runtime package is larger than expected.');
        hasher.update(chunk);
        let offset = 0;
        while (offset < chunk.length) {
          const result = await handle.write(chunk, offset, chunk.length - offset);
          if (!result.bytesWritten) throw new Error('Runtime package write failed.');
          offset += result.bytesWritten;
        }
        const progress = Math.floor((received / feed.package.size) * 100);
        if (progress !== lastProgress) {
          lastProgress = progress;
          this.updateState({ progress: Math.min(99, progress) });
        }
      }
      await handle.sync();
      await handle.close();
      handle = null;
      if (received !== feed.package.size || hasher.digest('hex') !== feed.package.sha256) {
        throw new Error('Runtime package digest does not match the feed.');
      }
      this.updateState({ status: 'verifying', progress: 100, message: 'Verifying and staging Runtime…' });
      const staged = await this.bootstrap.stage(temporaryFile);
      await this.fs.promises.unlink(temporaryFile);
      temporaryFile = '';
      this.updateState({
        status: 'staged',
        progress: 100,
        availableRevision: staged.runtimeRevision,
        phase: 'Ready',
        message: `Runtime r${staged.runtimeRevision} is verified and ready.`,
      });
      return this.snapshot();
    } catch (error) {
      if (handle) await handle.close().catch(() => {});
      if (temporaryFile) await this.fs.promises.unlink(temporaryFile).catch(() => {});
      this.updateState({
        status: 'error',
        progress: 0,
        phase: null,
        message: 'Runtime download or verification failed.',
      });
      throw error;
    } finally {
      this.operationInFlight = false;
    }
  }

  async apply(restartRuntime) {
    if (this.operationInFlight) throw new Error('Another Runtime operation is active.');
    if (this.state.status !== 'staged') throw new Error('No staged Runtime is ready to apply.');
    if (typeof restartRuntime !== 'function') throw new Error('Runtime restart handler is not valid.');
    this.operationInFlight = true;
    let activated = false;
    try {
      this.updateState({
        status: 'updating',
        progress: 10,
        phase: 'Activating',
        message: 'Activating the verified Runtime…',
      });
      await this.bootstrap.activate();
      activated = true;
      const activeState = await this.bootstrap.status();
      await restartRuntime(activeState, (phase, progress, message) => {
        this.updateState({ status: 'updating', phase, progress, message });
      });
      this.updateState({
        status: 'updating',
        progress: 92,
        phase: 'Confirming',
        message: 'Confirming Runtime health…',
      });
      await this.bootstrap.confirm();
      const confirmed = await this.bootstrap.status();
      this.availableFeed = null;
      this.updateState({
        status: 'idle',
        currentRevision: confirmed.runtimeRevision || 0,
        availableRevision: 0,
        progress: 100,
        phase: 'Complete',
        releaseNotes: [],
        message: 'Runtime update completed successfully.',
      });
      return this.snapshot();
    } catch (error) {
      if (!activated) {
        this.updateState({
          status: 'staged',
          progress: 100,
          phase: 'Ready',
          message: 'Runtime activation did not start. The verified Runtime remains staged.',
        });
        throw error;
      }
      this.updateState({
        status: 'rollingBack',
        progress: 94,
        phase: 'Rolling back',
        message: 'Runtime health failed. Restoring the previous Runtime…',
      });
      try {
        await this.bootstrap.rollback();
        const restored = await this.bootstrap.status();
        await restartRuntime(restored, (phase, progress, message) => {
          this.updateState({
            status: 'rollingBack',
            phase,
            progress: Math.max(94, progress),
            message,
          });
        });
        this.updateState({
          status: 'rolledBack',
          currentRevision: restored.runtimeRevision || 0,
          availableRevision: 0,
          progress: 100,
          phase: 'Restored',
          releaseNotes: [],
          message: 'The Runtime update failed and the previous Runtime was restored.',
        });
      } catch {
        this.updateState({
          status: 'error',
          progress: 100,
          phase: 'Recovery failed',
          message: 'Automatic Runtime recovery failed. Restart Panel to retry recovery.',
        });
      }
      throw error;
    } finally {
      this.operationInFlight = false;
    }
  }
}

module.exports = {
  MAX_FEED_BYTES,
  RuntimeUpdateManager,
};
