const test = require('node:test');
const assert = require('node:assert/strict');
const {
  parseMcpPayload,
  COMPOSIO_MCP_URL,
  testAnthropic,
  testComposio,
  testConnections,
} = require('../electron/connections');

function response({ ok = true, status = 200, text = '{}', contentType = 'application/json' } = {}) {
  return {
    ok,
    status,
    text: async () => text,
    headers: {
      get: () => contentType,
    },
  };
}

test('Anthropic validation uses the models endpoint without returning the key', async () => {
  let request;
  const secret = 'anthropic-secret';
  const result = await testAnthropic(async (url, options) => {
    request = { url, options };
    return response();
  }, secret);
  assert.equal(request.url, 'https://api.anthropic.com/v1/models?limit=1');
  assert.equal(request.options.headers['x-api-key'], secret);
  assert.deepEqual(result, { ok: true, message: 'Anthropic connected.' });
  assert.equal(JSON.stringify(result).includes(secret), false);
});

test('Composio validation requires a token before making a request', async () => {
  let called = false;
  const result = await testComposio(async () => {
    called = true;
  }, '');
  assert.equal(called, false);
  assert.deepEqual(result, {
    ok: false,
    message: 'Enter the Composio MCP token.',
  });
});

test('Composio validation accepts a JSON-RPC initialize response', async () => {
  let requestedUrl;
  const result = await testComposio(
    async (url) => {
      requestedUrl = url;
      return response({ text: JSON.stringify({ jsonrpc: '2.0', id: 1, result: {} }) });
    },
    'token',
  );
  assert.equal(requestedUrl, COMPOSIO_MCP_URL);
  assert.deepEqual(result, { ok: true, message: 'Composio MCP connected.' });
});

test('event stream parsing returns the final MCP payload', () => {
  const payload = parseMcpPayload(
    'event: message\ndata: {"jsonrpc":"2.0","id":1,"result":{"ready":true}}\n\n',
    'text/event-stream',
  );
  assert.deepEqual(payload, {
    jsonrpc: '2.0',
    id: 1,
    result: { ready: true },
  });
});

test('combined results never include submitted credentials', async () => {
  const settings = {
    anthropicApiKey: 'anthropic-secret',
    composioMcpToken: 'composio-secret',
  };
  const result = await testConnections(async (url) => {
    if (url.includes('anthropic.com')) return response();
    return response({ text: JSON.stringify({ jsonrpc: '2.0', id: 1, result: {} }) });
  }, settings);
  const output = JSON.stringify(result);
  assert.equal(output.includes(settings.anthropicApiKey), false);
  assert.equal(output.includes(settings.composioMcpToken), false);
});
