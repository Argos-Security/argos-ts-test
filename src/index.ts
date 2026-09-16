import 'dotenv/config';
import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';
import { createClient as createArgosClient, createExpressMiddleware } from 'argos-sdk';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface TodoRow {
  id: number;
  text: string;
  completed: number;
}

const app = express();
const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3001;
const isVulnerableMode = process.env.DISABLE_ARGOS === 'true';

app.use(express.json());

// -----------------------------------------------------------------------------
// SQLite demo database
// -----------------------------------------------------------------------------

const dataDir = path.join(__dirname, '..', 'data');
fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(path.join(dataDir, 'argos-demo.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS todos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    text TEXT NOT NULL,
    completed INTEGER NOT NULL DEFAULT 0
  );
`);

const rowCount = db.prepare('SELECT COUNT(*) AS count FROM todos').get() as {
  count: number;
};

if (rowCount.count === 0) {
  const seed = db.prepare('INSERT INTO todos (text, completed) VALUES (?, ?)');
  seed.run('Learn Express', 0);
  seed.run('Build todo app', 1);
}

function serializeTodo(todo: TodoRow) {
  return {
    ...todo,
    completed: Boolean(todo.completed),
  };
}

// -----------------------------------------------------------------------------
// App startup
// -----------------------------------------------------------------------------

async function start() {
  let argosClient: any = null;

  if (isVulnerableMode) {
    // Vulnerable mode intentionally requires NO Argos account or API key.
    console.log('⚠️  [Argos] Protection is DISABLED (Vulnerable mode)');
    console.log('⚠️  This demo contains intentionally vulnerable code. Use locally only.');
  } else {
    const apiKey = process.env.ARGOS_API_KEY || process.env.argos_api_key;

    if (!apiKey) {
      throw new Error(
        'ARGOS_API_KEY is required in protected mode. ' +
        'Set it in .env, then run npm run dev:protected.',
      );
    }

    const autoBlockEnv =
      process.env.AUTO_BLOCK_ON_DETECT ?? process.env.autoBlockOnBlock;

    const autoBlockOnBlock =
      autoBlockEnv !== undefined
        ? autoBlockEnv === '1' || autoBlockEnv.toLowerCase() === 'true'
        : true;

    const mode = (
      process.env.ARGOS_MODE ||
      process.env.MODE ||
      process.env.mode ||
      'sync'
    ) as 'sync' | 'async';

    argosClient = await createArgosClient({
      apiKey,
      autoBlockOnBlock,
    });

    const argosMiddleware = createExpressMiddleware(argosClient, {
      mode,
      includeHeaders: true,
      includeBody: true,
      excludePaths: ['/health', '/metrics'],
      checkBlocklist: true,
    });

    // IMPORTANT: Argos is mounted before the API routes.
    // That way a malicious request is stopped before it reaches a vulnerable
    // handler such as /api/todos/search.
    app.use(argosMiddleware);

    console.log('🛡️  [Argos] Protection is ENABLED (Protected mode)');
  }

  // Static demo frontend
  const publicPath = path.join(__dirname, '..', 'public');
  app.use(express.static(publicPath));

  // Health endpoint
  app.get('/health', (_req, res) => {
    res.json({
      ok: true,
      mode: isVulnerableMode ? 'vulnerable' : 'protected',
    });
  });

  // ---------------------------------------------------------------------------
  // Normal Todo API (backed by SQLite)
  // ---------------------------------------------------------------------------

  app.get('/api/todos', (_req, res) => {
    const todos = db
      .prepare('SELECT id, text, completed FROM todos ORDER BY id ASC')
      .all() as TodoRow[];

    res.json(todos.map(serializeTodo));
  });

  app.post('/api/todos', (req, res) => {
    const { text } = req.body ?? {};

    if (typeof text !== 'string' || text.length === 0) {
      return res.status(400).json({ error: 'text is required' });
    }

    // Parameterized on purpose.
    // SQLi is demonstrated separately in /api/todos/search.
    // Stored XSS can still be demonstrated if the demo frontend renders this
    // value unsafely (for example with innerHTML).
    const result = db
      .prepare('INSERT INTO todos (text, completed) VALUES (?, 0)')
      .run(text);

    const todo = db
      .prepare('SELECT id, text, completed FROM todos WHERE id = ?')
      .get(result.lastInsertRowid) as TodoRow;

    return res.json(serializeTodo(todo));
  });

  app.delete('/api/todos/:id', (req, res) => {
    const id = Number.parseInt(req.params.id, 10);

    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: 'Invalid todo id' });
    }

    db.prepare('DELETE FROM todos WHERE id = ?').run(id);
    return res.json({ success: true });
  });

  app.patch('/api/todos/:id', (req, res) => {
    const id = Number.parseInt(req.params.id, 10);
    const { completed } = req.body ?? {};

    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: 'Invalid todo id' });
    }

    const result = db
      .prepare('UPDATE todos SET completed = ? WHERE id = ?')
      .run(completed ? 1 : 0, id);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Not found' });
    }

    const todo = db
      .prepare('SELECT id, text, completed FROM todos WHERE id = ?')
      .get(id) as TodoRow;

    return res.json(serializeTodo(todo));
  });

  // ---------------------------------------------------------------------------
  // REAL SQL injection demo
  // ---------------------------------------------------------------------------
  //
  // This endpoint is INTENTIONALLY vulnerable for a local security demo.
  // Never build SQL strings from user input like this in production.
  //
  // Normal:
  //   curl -i "http://localhost:3001/api/todos/search?q=Learn"
  //
  // SQLi:
  //   curl -i "http://localhost:3001/api/todos/search?q=%27%20OR%201%3D1%20--%20"
  //
  // Vulnerable mode:
  //   The injected OR 1=1 changes the SQL query and returns all rows.
  //
  // Protected mode:
  //   Argos should intercept the same request before this handler executes.
  // ---------------------------------------------------------------------------

  app.get('/api/todos/search', (req, res) => {
    const q = String(req.query.q ?? '');

    // INTENTIONALLY VULNERABLE:
    const sql = `SELECT id, text, completed
                 FROM todos
                 WHERE text LIKE '%${q}%'
                 ORDER BY id ASC`;

    try {
      const todos = db.prepare(sql).all() as TodoRow[];

      return res.json({
        demo: 'INTENTIONALLY VULNERABLE SQL QUERY — LOCAL TESTING ONLY',
        query: sql,
        count: todos.length,
        todos: todos.map(serializeTodo),
      });
    } catch (error) {
      return res.status(500).json({
        error: 'SQLite query failed',
        details: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // ---------------------------------------------------------------------------
  // Argos-only demo/admin endpoints
  // ---------------------------------------------------------------------------

  if (argosClient) {
    app.get('/api/argos/spec-status', (_req, res) => {
      const sv = argosClient.specValidator;
      res.json({
        loaded: sv.isLoaded,
        last_fetch: sv.lastFetchMs
          ? new Date(sv.lastFetchMs).toISOString()
          : null,
        ttl_seconds: Math.floor(sv.ttlMs / 1000),
        path_count: sv.pathCount,
      });
    });

    app.post('/api/argos/validate', async (req, res) => {
      const {
        method = 'GET',
        path: reqPath = '/',
        body,
      } = req.body ?? {};

      const sv = argosClient.specValidator;
      const result = await sv.validate(method, reqPath, {}, {}, body);

      res.json(
        result ?? {
          skipped: true,
          reason: 'spec not loaded',
        },
      );
    });
  }

  app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
  });
}

start().catch(error => {
  console.error(error);
  process.exit(1);
});
