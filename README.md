# Argos SDK Express Example & Quick Demo

This repository is a live demonstration of the **Argos Security SDK** (`argos-sdk`) inside an Express.js application.

It includes intentionally vulnerable demo flows so you can compare the exact same application **without Argos** and **with Argos enabled**.

> ⚠️ This repository contains intentionally vulnerable code for local security testing and demonstration purposes only. Do not deploy the vulnerable mode to production.

---

## ⚡ Quick Start

### 1. Clone the repository

```bash
git clone https://github.com/Argos-Security/argos-js-test.git
cd argos-js-test
```

### 2. Install dependencies

```bash
npm install
```

That's all you need to run the vulnerable demo.

---

# 🧪 1. Run Without Argos

Vulnerable mode does **not** require an Argos account or API key.

```bash
npm run dev:vulnerable
```

The server should start on:

```text
http://localhost:3001
```

You should see:

```text
[Argos] Protection is DISABLED (Vulnerable mode)
```

---

# 🛡️ 2. Run With Argos Protection

Create a `.env` file in the project root:

```env
ARGOS_API_KEY=YOUR_ARGOS_API_KEY
```

Then run:

```bash
npm run dev:protected
```

You should see:

```text
[Argos] Protection is ENABLED (Protected mode)
```

Argos middleware is mounted before the API routes so malicious requests can be inspected and blocked before they reach vulnerable application code.

---

# 🔥 Real SQL Injection Demo

The demo uses SQLite and includes an **intentionally vulnerable search endpoint**:

```http
GET /api/todos/search?q=
```

The endpoint intentionally interpolates user input directly into a SQL query.

This is insecure by design and exists only to demonstrate the difference between the application with and without Argos.

## Normal request

```bash
curl -i "http://localhost:3001/api/todos/search?q=Learn"
```

This performs a normal search.

---

## SQL Injection attack

Run:

```bash
curl -i "http://localhost:3001/api/todos/search?q=%27%20OR%201%3D1%20--%20"
```

Decoded payload:

```sql
' OR 1=1 --
```

### Without Argos

With:

```bash
npm run dev:vulnerable
```

the injected payload reaches the vulnerable SQL query and changes its behavior.

Expected result:

```text
HTTP/1.1 200 OK
```

The response returns multiple Todo rows because the injected:

```sql
OR 1=1
```

makes the SQL condition true.

### With Argos

Stop the vulnerable server and run:

```bash
npm run dev:protected
```

Send the **exact same request** again:

```bash
curl -i "http://localhost:3001/api/todos/search?q=%27%20OR%201%3D1%20--%20"
```

Expected result:

```text
403 Forbidden
```

Argos should detect the SQL injection attempt and block the request before it reaches the vulnerable route handler.

The event should also appear in the Argos dashboard with details such as:

- Action: `BLOCK`
- Attack type: SQL Injection
- Endpoint: `/api/todos/search`
- Request / payload details

---

# 💥 Stored XSS Demo

The Todo frontend intentionally renders Todo text in an unsafe way for demonstration purposes.

Use this payload:

```html
<img src=x onerror=alert('XSS')>
```

Send it with:

```bash
curl -i -X POST http://localhost:3001/api/todos \
  -H "Content-Type: application/json" \
  -d '{"text":"<img src=x onerror=alert('\''XSS'\'')>"}'
```

## Without Argos

Run:

```bash
npm run dev:vulnerable
```

The malicious Todo is accepted and stored in SQLite.

When the vulnerable frontend renders the stored Todo, the injected JavaScript can execute.

## With Argos

Run:

```bash
npm run dev:protected
```

Send the same malicious request again.

Expected result:

```text
403 Forbidden
```

Argos should detect and block the XSS payload before the request reaches the Todo creation handler.

---

# 🧭 Path Traversal Payload Detection

You can also test a common path traversal payload:

```bash
curl -i -X POST http://localhost:3001/api/todos \
  -H "Content-Type: application/json" \
  -d '{"text":"../../../etc/passwd"}'
```

In this Todo demo, the value is not used as an actual filesystem path, so this is a **payload-detection test**, not a real path traversal exploit.

### Without Argos

The application accepts the payload.

### With Argos

Argos should detect and block the malicious traversal pattern.

---

# 🗄️ SQLite Storage

The Todo application uses SQLite instead of an in-memory array.

The local demo database is created automatically at:

```text
data/argos-demo.db
```

The application creates the `todos` table automatically when it starts.

Normal Todo creation uses parameterized SQL queries.

The SQL injection vulnerability is intentionally isolated to:

```http
GET /api/todos/search
```

so the SQLi demonstration remains explicit and easy to understand.

---

# 🛠️ Add Argos to Your Own Express App

Install the SDK:

```bash
npm install argos-sdk
```

Set your API key:

```env
ARGOS_API_KEY=YOUR_ARGOS_API_KEY
```

Then initialize Argos and mount the middleware **before your API routes**:

```typescript
import 'dotenv/config';
import express from 'express';
import {
  createClient as createArgosClient,
  createExpressMiddleware,
} from 'argos-sdk';

const app = express();

app.use(express.json());

const argosClient = await createArgosClient({
  apiKey: process.env.ARGOS_API_KEY!,
  autoBlockOnBlock: true,
});

const argosMiddleware = createExpressMiddleware(argosClient, {
  mode: 'sync',
  includeHeaders: true,
  includeBody: true,
  excludePaths: ['/health'],
  checkBlocklist: true,
});

app.use(argosMiddleware);

// Register your application routes after Argos middleware.
app.get('/api/example', (req, res) => {
  res.json({ ok: true });
});

app.listen(3001, () => {
  console.log('Server running on http://localhost:3001');
});
```

---

# ⚙️ Configuration Reference

| Parameter | Type | Default | Environment Variable | Description |
| :--- | :--- | :--- | :--- | :--- |
| `apiKey` | `string` | **Required in protected mode** | `ARGOS_API_KEY` | Argos environment API key |
| `autoBlockOnBlock` | `boolean` | `true` | `AUTO_BLOCK_ON_DETECT` | Automatically block malicious requests / clients |
| `mode` | `'sync' \| 'async'` | `'sync'` | `ARGOS_MODE` | Inspection timing |
| `includeHeaders` | `boolean` | `true` | — | Inspect incoming request headers |
| `includeBody` | `boolean` | `true` | — | Inspect incoming request body |
| `excludePaths` | `string[]` | `[]` | — | Paths that bypass Argos inspection |
| `checkBlocklist` | `boolean` | `true` | — | Enable active blocklist checks |

---

# 🎯 What This Demo Proves

The goal of this repository is simple:

```text
Same application
Same request
Same vulnerable code
        +
Argos enabled
        =
Attack blocked before vulnerable code executes
```

The vulnerable mode shows the application behavior without protection.

The protected mode shows how Argos can inspect and block malicious requests at runtime from inside the application layer.

---

## Argos SecOps

Runtime security for modern APIs and web applications.

https://argossecops.com
