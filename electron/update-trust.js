const UPDATE_REPOSITORY = Object.freeze({
  owner: 'YuYu9372',
  repo: 'Panel',
});

const PATCH_MANIFEST_BASE_URL = 'https://raw.githubusercontent.com/YuYu9372/Panel/main/patches/';

const PATCH_TRUST = Object.freeze({
  stable: Object.freeze({
    keyId: 'panel-stable-2026-01',
    publicKey: `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAgwplszTqC0TjJazuRDhEsHt1TOQZvr/kKCzsgYxj2r0=
-----END PUBLIC KEY-----`,
  }),
  developer: Object.freeze({
    keyId: 'panel-developer-2026-01',
    publicKey: `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAEhjP9Qe/w+AcW3ErywQ7oklSDmZ2WYzSzryVjdGGIGY=
-----END PUBLIC KEY-----`,
  }),
});

module.exports = {
  PATCH_MANIFEST_BASE_URL,
  PATCH_TRUST,
  UPDATE_REPOSITORY,
};
