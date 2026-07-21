function result(ok, message) {
  return { ok, message };
}

const COMPOSIO_MCP_URL = 'https://connect.composio.dev/mcp';

function serviceError(status) {
  if (status === 401 || status === 403) return 'Authentication failed.';
  if (status === 429) return 'The service rate limit was reached.';
  return `The service returned status ${status}.`;
}

async function testAnthropic(fetcher, apiKey) {
  if (!apiKey) return result(false, 'Enter an Anthropic API key.');
  try {
    const response = await fetcher('https://api.anthropic.com/v1/models?limit=1', {
      method: 'GET',
      headers: {
        'anthropic-version': '2023-06-01',
        'x-api-key': apiKey,
      },
      redirect: 'error',
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) return result(false, serviceError(response.status));
    return result(true, 'Anthropic connected.');
  } catch {
    return result(false, 'Anthropic could not be reached.');
  }
}

function parseMcpPayload(text, contentType) {
  if ((contentType || '').includes('text/event-stream')) {
    const messages = text
      .split(/\r?\n/)
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trim())
      .filter((line) => line && line !== '[DONE]');
    if (!messages.length) return null;
    return JSON.parse(messages[messages.length - 1]);
  }
  return JSON.parse(text);
}

async function testComposio(fetcher, mcpToken) {
  if (!mcpToken) return result(false, 'Enter the Composio MCP token.');
  try {
    const response = await fetcher(COMPOSIO_MCP_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json, text/event-stream',
        Authorization: `Bearer ${mcpToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-06-18',
          capabilities: {},
          clientInfo: { name: 'panel-settings', version: '0.5.2' },
        },
      }),
      redirect: 'error',
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) return result(false, serviceError(response.status));
    const payload = parseMcpPayload(
      await response.text(),
      response.headers.get('content-type'),
    );
    if (!payload || payload.error || !payload.result) {
      return result(false, 'The Composio MCP response was not valid.');
    }
    return result(true, 'Composio MCP connected.');
  } catch {
    return result(false, 'Composio MCP could not be reached.');
  }
}

async function testConnections(fetcher, settings) {
  const [anthropic, composio] = await Promise.all([
    testAnthropic(fetcher, settings.anthropicApiKey),
    testComposio(fetcher, settings.composioMcpToken),
  ]);
  return { anthropic, composio };
}

module.exports = {
  COMPOSIO_MCP_URL,
  parseMcpPayload,
  testAnthropic,
  testComposio,
  testConnections,
};
