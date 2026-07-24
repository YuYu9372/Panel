const fs = require('fs');
const path = require('path');
const { RuntimeBootstrap } = require('./runtime-bootstrap');

const BOOTSTRAP_API_VERSION = 1;
const RUNTIME_API_VERSION = 1;
const RUNTIME_FEED_BASE_URL = 'https://raw.githubusercontent.com/YuYu9372/Panel/main/runtime';
const RUNTIME_FEED_URLS = Object.freeze({
  stable: `${RUNTIME_FEED_BASE_URL}/stable-feed.json`,
  developer: `${RUNTIME_FEED_BASE_URL}/developer-feed.json`,
});
const RUNTIME_TRUST = Object.freeze({
  stable: Object.freeze({
    keyId: 'panel-runtime-stable-2026-01',
    publicKeyFile: 'stable-public.pem',
  }),
  developer: Object.freeze({
    keyId: 'panel-runtime-developer-2026-01',
    publicKeyFile: 'developer-public.pem',
  }),
});

function runtimePaths({ app, channel, resourcesPath, projectRoot = path.join(__dirname, '..') }) {
  const trust = RUNTIME_TRUST[channel];
  if (!trust) throw new Error('Runtime channel is not valid.');
  const resources = app.isPackaged ? resourcesPath : projectRoot;
  return {
    executable: app.isPackaged
      ? path.join(resources, 'bootstrap', 'panel-bootstrap')
      : path.join(projectRoot, 'bootstrap-native', 'target', 'release', 'panel-bootstrap'),
    publicKey: path.join(resources, 'runtime-trust', trust.publicKeyFile),
    root: path.join(app.getPath('userData'), 'runtime-v1', channel),
    trust,
  };
}

function createRuntimeBootstrap({
  app,
  channel,
  resourcesPath,
  projectRoot,
  fsModule = fs,
  runner,
}) {
  const paths = runtimePaths({ app, channel, resourcesPath, projectRoot });
  if (!fsModule.existsSync(paths.executable) || !fsModule.existsSync(paths.publicKey)) {
    return null;
  }
  return new RuntimeBootstrap({
    executable: paths.executable,
    root: paths.root,
    publicKey: paths.publicKey,
    keyId: paths.trust.keyId,
    appVersion: app.getVersion(),
    channel,
    bootstrapApiVersion: BOOTSTRAP_API_VERSION,
    runtimeApiVersion: RUNTIME_API_VERSION,
    runner,
  });
}

module.exports = {
  BOOTSTRAP_API_VERSION,
  RUNTIME_API_VERSION,
  RUNTIME_FEED_URLS,
  RUNTIME_TRUST,
  createRuntimeBootstrap,
  runtimePaths,
};
