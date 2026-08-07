# Argos SDK Express Example & Quick Demo

This repository is a live demonstration of the **Argos Security SDK** (`argos-sdk`) in an Express.js application. 

It allows you to test attack payloads (SQL Injection, XSS, Path Traversal) and see how Argos instantly detects and blocks threats—all in under 2 minutes.

---

## ⚡ 2-Minute Interactive Demo

You can run the server in two distinct modes without editing any code:

### Mode 1: Without Argos (Vulnerable)
Runs the server with security protection disabled so you can observe unhandled security vulnerabilities.

```bash
npm run dev:vulnerable
```

### Mode 2: With Argos (Protected)
Runs the server with full Argos SDK threat detection and auto-blocking enabled.

```bash
npm run dev:protected
```

---

## 🧪 Test Attack Payloads (Copy & Paste)

Open a new terminal tab and run these test commands against `http://localhost:3001`:

### 1. SQL Injection (SQLi) Test

```bash
curl -i -X POST http://localhost:3001/api/todos \
  -H "Content-Type: application/json" \
  -d '{"text": "Buy groceries'\'' OR 1=1 --"}'
```

- ⚠️ **Without Argos (`dev:vulnerable`)**: Returns `200 OK` (Payload accepted and stored).
- 🛡️ **With Argos (`dev:protected`)**: Returns `403 Forbidden` / Blocked by Argos Security.

---

### 2. Cross-Site Scripting (XSS) Test

```bash
curl -i -X POST http://localhost:3001/api/todos \
  -H "Content-Type: application/json" \
  -d '{"text": "<script>alert(\"XSS Attack\")</script>"}'
```

- ⚠️ **Without Argos (`dev:vulnerable`)**: Returns `200 OK` (Malicious script accepted).
- 🛡️ **With Argos (`dev:protected`)**: Returns `403 Forbidden` / Blocked by Argos Security.

---

### 3. Path Traversal Test

```bash
curl -i -X POST http://localhost:3001/api/todos \
  -H "Content-Type: application/json" \
  -d '{"text": "../../../etc/passwd"}'
```

- ⚠️ **Without Argos (`dev:vulnerable`)**: Returns `200 OK`.
- 🛡️ **With Argos (`dev:protected`)**: Returns `403 Forbidden` / Blocked by Argos Security.

---

## 🛠️ How to Add Argos SDK to Your Own App

### Step 1: Install the SDK

```bash
npm install argos-sdk
```

---

### Step 2: Add Argos Middleware to Express

In your `app.js` or `index.ts`:

```typescript
import 'dotenv/config';
import express from 'express';
import { createClient as createArgosClient, createExpressMiddleware } from 'argos-sdk';

const app = express();

// 1. Initialize Argos Client
const argosClient = await createArgosClient({
  apiKey: process.env.ARGOS_API_KEY || 'YOUR_ARGOS_API_KEY',
  autoBlockOnBlock: true,
});

// 2. Create and attach Express Middleware
const argosMiddleware = createExpressMiddleware(argosClient, {
  mode: 'sync',               // 'sync' or 'async'
  includeHeaders: true,
  includeBody: true,
  excludePaths: ['/health'], // Bypass specific paths
  checkBlocklist: true,
});

app.use(express.json());
app.use(argosMiddleware);

app.listen(3001, () => console.log('Server running on port 3001'));
```

---

## ⚙️ Configuration Reference

Options can be set via `.env` or passed directly to `createClient` / `createExpressMiddleware`:

| Parameter | Type | Default | Environment Variable | Description |
| :--- | :--- | :--- | :--- | :--- |
| `apiKey` | `string` | **Required** | `ARGOS_API_KEY` | Your Argos environment API key. |
| `autoBlockOnBlock` | `boolean` | `true` | `AUTO_BLOCK_ON_DETECT` | Auto-block malicious clients/requests. |
| `mode` | `'sync' \| 'async'` | `'sync'` | `ARGOS_MODE` | Inspection timing (`sync` before routing, `async` in background). |
| `includeHeaders` | `boolean` | `true` | — | Inspect incoming request headers. |
| `includeBody` | `boolean` | `true` | — | Inspect incoming JSON body payload. |
| `excludePaths` | `string[]` | `[]` | — | List of endpoints to bypass inspection. |
| `checkBlocklist` | `boolean` | `true` | — | Enable active IP/client blocklist checks. |
