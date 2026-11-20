import http, { IncomingMessage, ServerResponse } from 'node:http';
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

export interface MockAdminServerHandle {
  url: string;
  port: number;
  close: () => Promise<void>;
}

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.json': 'application/json; charset=utf-8',
  '.woff2': 'font/woff2'
};

export function resolveMockPublicDir(): string {
  const candidates = [
    path.resolve(__dirname, 'public'),
    path.resolve(__dirname, '../mock-target/public'),
    path.resolve(process.cwd(), 'src/mock-target/public'),
    path.resolve(process.cwd(), 'dist/mock-target/public')
  ];
  for (const dir of candidates) {
    if (existsSync(path.join(dir, 'index.html'))) {
      return dir;
    }
  }
  throw new Error(`Unable to locate mock-target public directory. Checked: ${candidates.join(', ')}`);
}

export async function startMockAdminServer(options?: {
  port?: number;
  host?: string;
}): Promise<MockAdminServerHandle> {
  const host = options?.host ?? '127.0.0.1';
  const port = options?.port ?? 0;
  const publicDir = resolveMockPublicDir();

  const server = http.createServer(async (req: IncomingMessage, res: ServerResponse) => {
    try {
      const reqUrl = new URL(req.url ?? '/', `http://${host}`);

      if (req.method === 'POST' && reqUrl.pathname === '/api/networking') {
        const chunks: Buffer[] = [];
        for await (const chunk of req) {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        }
        res.writeHead(200, {
          'Content-Type': 'application/json; charset=utf-8',
          'X-Content-Type-Options': 'nosniff',
          'Cache-Control': 'no-store'
        });
        res.end(
          JSON.stringify({
            ok: true,
            appliedAt: new Date().toISOString(),
            bytesReceived: Buffer.concat(chunks).length
          })
        );
        return;
      }

      if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Method Not Allowed');
        return;
      }

      const rawPath = reqUrl.pathname === '/' ? '/index.html' : reqUrl.pathname;
      const decodedPath = decodeURIComponent(rawPath).replace(/^\/+/, '');
      const resolvedFile = path.resolve(publicDir, decodedPath);

      if (!resolvedFile.startsWith(publicDir + path.sep) && resolvedFile !== publicDir) {
        res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Forbidden');
        return;
      }

      const data = await fs.readFile(resolvedFile);
      const ext = path.extname(resolvedFile).toLowerCase();
      res.writeHead(200, {
        'Content-Type': MIME_TYPES[ext] ?? 'application/octet-stream',
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'no-cache'
      });
      if (req.method === 'HEAD') {
        res.end();
      } else {
        res.end(data);
      }
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === 'ENOENT' || code === 'EISDIR') {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Not Found');
        return;
      }
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Internal Server Error');
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => resolve());
  });

  const addr = server.address();
  if (!addr || typeof addr === 'string') {
    throw new Error('Failed to bind mock admin server address');
  }

  return {
    url: `http://${host}:${addr.port}/index.html`,
    port: addr.port,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      })
  };
}
