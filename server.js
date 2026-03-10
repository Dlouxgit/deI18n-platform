import express from 'express';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createServer as createMcpServer } from './mcp-server/index.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { randomUUID } from 'node:crypto';

const PORT = process.env.PORT || 7999;
const app = express();

// ── MCP SSE sessions ────────────────────────────────────────────────
const sessions = {};

// ── MCP Streamable HTTP sessions ────────────────────────────────────
const streamableSessions = {};

const mcpJson = express.json({ limit: '4mb' });

async function handleStreamableHttp(req, res) {
  try {
    const sessionId = req.header('mcp-session-id') || undefined;
    const existing = sessionId ? streamableSessions[sessionId] : undefined;

    if (existing) {
      await existing.transport.handleRequest(req, res, req.body);
      return;
    }

    if (sessionId) {
      res.status(400).json({
        jsonrpc: '2.0',
        error: { code: -32000, message: 'Bad Request: Unknown session' },
        id: null,
      });
      return;
    }

    if (req.method !== 'POST' || !isInitializeRequest(req.body)) {
      res.status(400).json({
        jsonrpc: '2.0',
        error: { code: -32000, message: 'Bad Request: No valid session ID provided' },
        id: null,
      });
      return;
    }

    const mcpServer = createMcpServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (sid) => {
        streamableSessions[sid] = { transport, server: mcpServer };
      },
    });
    await mcpServer.connect(transport);

    transport.onclose = async () => {
      const sid = transport.sessionId;
      const session = sid ? streamableSessions[sid] : undefined;
      if (!sid || !session) return;
      try { await session.server?.close(); } catch {}
      delete streamableSessions[sid];
    };

    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error('[MCP] Streamable HTTP error:', error);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: '2.0',
        error: { code: -32603, message: 'Internal server error' },
        id: null,
      });
    }
  }
}

app.all('/mcp', mcpJson, handleStreamableHttp);

app.post('/mcp/sse', mcpJson, handleStreamableHttp);
app.delete('/mcp/sse', mcpJson, handleStreamableHttp);

app.get('/mcp/sse', async (req, res) => {
  if (req.header('mcp-session-id')) {
    await handleStreamableHttp(req, res);
    return;
  }
  const transport = new SSEServerTransport('/mcp/messages', res);
  const mcpServer = createMcpServer();

  sessions[transport.sessionId] = { transport, server: mcpServer };
  console.log(`[MCP] SSE client connected: ${transport.sessionId} (active: ${Object.keys(sessions).length})`);

  res.on('close', async () => {
    console.log(`[MCP] SSE client disconnected: ${transport.sessionId}`);
    try { await mcpServer.close(); } catch {}
    delete sessions[transport.sessionId];
  });

  await mcpServer.connect(transport);
});

app.post('/mcp/messages', async (req, res) => {
  const sessionId = req.query.sessionId;
  const session = sessions[sessionId];
  if (!session) {
    res.status(400).json({ error: 'Unknown session' });
    return;
  }
  await session.transport.handlePostMessage(req, res);
});

// ── Remix ───────────────────────────────────────────────────────────
async function startServer() {
  if (process.env.NODE_ENV === 'production') {
    // Production: serve static assets + prebuilt server bundle
    app.use('/assets', express.static('build/client/assets', { immutable: true, maxAge: '1y' }));
    app.use(express.static('build/client', { maxAge: '1h' }));

    const { createRequestHandler } = await import('@remix-run/express');
    const build = await import('./build/server/index.js');
    app.all('*', createRequestHandler({ build }));
  } else {
    // Development: Vite dev server as middleware
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({ server: { middlewareMode: true } });
    app.use(vite.middlewares);

    const { createRequestHandler } = await import('@remix-run/express');
    app.all('*', (req, res, next) => {
      vite
        .ssrLoadModule('virtual:remix/server-build')
        .then((build) => createRequestHandler({ build })(req, res, next))
        .catch(next);
    });
  }

  app.listen(PORT, () => {
    console.log(`[i18n-app] Server running at http://localhost:${PORT} (${process.env.NODE_ENV || 'development'})`);
    console.log(`[MCP] Streamable HTTP endpoint at http://localhost:${PORT}/mcp`);
    console.log(`[MCP] SSE endpoint at http://localhost:${PORT}/mcp/sse`);
  });
}

// ── Graceful shutdown ───────────────────────────────────────────────
async function shutdown() {
  console.log('[i18n-app] Shutting down...');
  for (const [id, session] of Object.entries(sessions)) {
    try { await session.server.close(); } catch {}
    delete sessions[id];
  }
  for (const [id, session] of Object.entries(streamableSessions)) {
    try { await session.server?.close(); } catch {}
    delete streamableSessions[id];
  }
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

startServer();
