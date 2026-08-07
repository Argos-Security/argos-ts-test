import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createExpressMiddleware } from 'argos-sdk';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface Todo {
  id: number;
  text: string;
  completed: boolean;
}

const app = express();

// Port can be configured via .env (PORT) or hardcoded directly
const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3001;

let todos: Todo[] = [
  { id: 1, text: 'Learn Express', completed: false },
  { id: 2, text: 'Build todo app', completed: true },
];
let nextId = 3;

// API key can be configured via .env (ARGOS_API_KEY / argos_api_key) or hardcoded directly
const apiKey = process.env.ARGOS_API_KEY || process.env.argos_api_key;

if (!apiKey) {
  throw new Error('ARGOS_API_KEY environment variable is required');
}

// autoBlockOnBlock can be configured via .env (1 = true, 0 = false) or hardcoded directly
const autoBlockEnv = process.env.AUTO_BLOCK_ON_DETECT ?? process.env.autoBlockOnBlock;
const autoBlockOnBlock = autoBlockEnv !== undefined
  ? (autoBlockEnv === '1' || autoBlockEnv.toLowerCase() === 'true')
  : true;

// Mode can be configured via .env ('sync' or 'async') or hardcoded directly
const mode = (process.env.ARGOS_MODE || process.env.MODE || process.env.mode || 'sync') as 'sync' | 'async';

import('argos-sdk').then(({ createClient: createArgosClient }) => {
  createArgosClient({
    apiKey,
    autoBlockOnBlock,
  }).then(argosClient => {
    const argosMiddleware = createExpressMiddleware(argosClient, {
      mode,
      includeHeaders: true,
      includeBody: true,
      excludePaths: ['/health', '/metrics'],
      checkBlocklist: true,
    });

    app.use(express.json());

    const isVulnerableMode = process.env.DISABLE_ARGOS === 'true';
    if (isVulnerableMode) {
      console.log('⚠️ [Argos] Protection is DISABLED (Vulnerable mode)');
    } else {
      console.log('🛡️ [Argos] Protection is ENABLED (Protected mode)');
      app.use(argosMiddleware);
    }

    const publicPath = path.join(__dirname, '..', 'public');
    app.use(express.static(publicPath));

    app.get('/api/todos', (req, res) => {
      res.json(todos);
    });

    app.post('/api/todos', (req, res) => {
      const { text } = req.body;
      const todo: Todo = { id: nextId++, text, completed: false };
      todos.push(todo);
      res.json(todo);
    });

    app.delete('/api/todos/:id', (req, res) => {
      const id = parseInt(req.params.id);
      todos = todos.filter(t => t.id !== id);
      res.json({ success: true });
    });

    app.patch('/api/todos/:id', (req, res) => {
      const id = parseInt(req.params.id);
      const { completed } = req.body;
      const todo = todos.find(t => t.id === id);
      if (todo) {
        todo.completed = completed;
        res.json(todo);
      } else {
        res.status(404).json({ error: 'Not found' });
      }
    });

    // Argos admin: spec validator status
    app.get('/api/argos/spec-status', (req, res) => {
      const sv = (argosClient as any).specValidator;
      res.json({
        loaded: sv.isLoaded,
        last_fetch: sv.lastFetchMs ? new Date(sv.lastFetchMs).toISOString() : null,
        ttl_seconds: Math.floor(sv.ttlMs / 1000),
        path_count: sv.pathCount,
      });
    });

    // Argos admin: run a manual spec validation
    app.post('/api/argos/validate', async (req, res) => {
      const { method = 'GET', path: reqPath = '/', body } = req.body ?? {};
      const sv = (argosClient as any).specValidator;
      const result = await sv.validate(method, reqPath, {}, {}, body);
      res.json(result ?? { skipped: true, reason: 'spec not loaded' });
    });

    app.listen(port, () => {
      console.log(`Server running on http://localhost:${port}`);
    });
  });
});
