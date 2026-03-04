import express from 'express';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { createServer as createMcpServer } from './mcp-server/index.js';

const PORT = process.env.PORT || 7999;
const app = express();

// ── MCP SSE sessions ────────────────────────────────────────────────
const sessions = {};

app.get('/mcp/sse', async (req, res) => {
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
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

startServer();
