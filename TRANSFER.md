# 📦 Project Transfer Guide — DeshSubDispatch

এই গাইড অনুসরণ করে আপনি প্রজেক্টটি যেকোনো নতুন PC-তে ট্রান্সফার ও রান করতে পারবেন।

## 1. প্রয়োজনীয় সফটওয়্যার

| সফটওয়্যার | সংস্করণ | ইনস্টল |
|-----------|---------|--------|
| Node.js | ≥ 22 | https://nodejs.org |
| Git | latest | https://git-scm.com |
| (ঐচ্ছিক) npm | ≥ 10 | Node-এর সাথে আসে |

## 2. রিপো ক্লোন

```bash
git clone https://github.com/habibbrox2/desh-sub-dispatch-mcp.git
cd desh-sub-dispatch-mcp
```

## 3. ডিপেন্ডেন্সি ইনস্টল

```bash
npm install
```

## 4. বিল্ড

```bash
npm run build
```

এটি `dist/server.bundle.cjs` (self-contained) তৈরি করবে।

## 5. পরিবেশ চলক (Environment Variables)

`.env` ফাইল তৈরি করুন (ঐচ্ছিক):

```env
TRANSPORT=http
PORT=3000
MCP_AUTH_TOKEN=your-strong-token
DESH_DB_PATH=./desh-sub-dispatch.db
CORS_ORIGIN=*
RATE_LIMIT_PER_MIN=0
```

## 6. ডাটাবেজ ট্রান্সফার (যদি প্রয়োজন)

পুরনো PC থেকে `desh-sub-dispatch.db` ফাইলটি কপি করে নতুন PC-এর প্রজেক্ট রুটে রাখুন। `DESH_DB_PATH` সেই পাথে সেট করুন।

## 7. রান করুন

```bash
# stdio
node dist/server.bundle.cjs

# HTTP
node dist/server.bundle.cjs --http
```

## 8. যাচাই (Verification)

```bash
curl http://localhost:3000/health
node dist/server.bundle.cjs --print-config
```

## 9. কোডিং এজেন্টে কানেক্ট

আপনার পছন্দের এজেন্টের MCP কনফিগে যোগ করুন:

```json
{
  "mcpServers": {
    "DeshSubDispatch": {
      "command": "node",
      "args": ["/absolute/path/to/dist/server.bundle.cjs"]
    }
  }
}
```

## 10. ট্রাবলশুটিং

- **Port in use**: `PORT=3001 node dist/server.bundle.cjs --http`
- **DB lock error**: অন্য ইনস্ট্যান্স বন্ধ করুন
- **Module not found**: `npm install` আবার চালান
- **Permission error**: `chmod +x dist/server.bundle.cjs`

---

> **নোট**: বান্ডল ফাইল (`server.bundle.cjs`) সম্পূর্ণ self-contained, তাই শুধু এই একটি ফাইল কপি করলেও চলবে (Node.js থাকলে)।

## 11. Hosted (Fly.io) deployment

Live MCP endpoint: https://deshdsp.fly.dev/mcp
Health check: https://deshdsp.fly.dev/health
