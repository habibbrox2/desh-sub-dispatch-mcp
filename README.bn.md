# 🇧🇩 DeshSubDispatch — বাংলাদেশের Open Source MCP সার্ভার

> **DeshSubDispatch** হলো একটি সম্পূর্ণ স্বয়ংসম্পূর্ণ (self-contained) Model Context Protocol (MCP) সার্ভার, যা যেকোনো কোডিং এজেন্টের সাথে কানেক্ট করে হাইব্রিড সাব-এজেন্ট (LLM, প্রসেস, HTTP) ডিসপ্যাচ ও অর্কেস্ট্রেশন করতে পারে।

![License](https://img.shields.io/badge/license-MIT-green)
![Node](https://img.shields.io/badge/node-%3E%3D22-brightgreen)
![MCP](https://img.shields.io/badge/MCP-compatible-blue)
![Made in Bangladesh](https://img.shields.io/badge/Made%20in-Bangladesh-red)

---

> 🌐 [GitHub Pages](https://habibbrox2.github.io/desh-sub-dispatch-mcp/)

## ✨ বৈশিষ্ট্যসমূহ

- 🔀 **হাইব্রিড এজেন্ট**: LLM (OpenAI/Anthropic/Generic), প্রসেস (child process), HTTP (remote endpoint)
- 🧠 **সম্পূর্ণ অর্কেস্ট্রেশন**: প্রায়োরিটি কিউ, কনকারেন্সি লিমিট, ডিপেন্ডেন্সি (DAG ওয়ার্কফ্লো), রিট্রাই, টাইমআউট, ক্যান্সেল
- 🧩 **স্কিল প্রিসেট**: রেডিমেড স্কিল (coder, researcher, summarizer, claude-coder ইত্যাদি)
- 🌐 **সর্বজনীন কম্প্যাটিবিলিটি**: stdio, Streamable HTTP, এবং লেগাসি SSE ট্রান্সপোর্ট
- 📦 **সম্পূর্ণ স্বয়ংসম্পূর্ণ**: একটি মাত্র bundle ফাইল, কোনো `node_modules` প্রয়োজন নেই
- 🇧🇩 **বাংলাদেশের প্রেক্ষাপটে তৈরি**: বাংলাদেশি ডেভেলপারদের জন্য, বাংলাদেশের নামে

---

## 🚀 দ্রুত শুরু

```bash
# বিল্ড
npm install
npm run build

# stdio (ডিফল্ট)
node dist/server.bundle.cjs

# HTTP
TRANSPORT=http PORT=3000 node dist/server.bundle.cjs

# রেডি-টু-পেস্ট কনফিগ
node dist/server.bundle.cjs --print-config
```

---

## 🔌 যেকোনো কোডিং এজেন্টের সাথে কানেক্ট

Cursor / Windsurf / Cline / Continue / Zed / VS Code / Claude Code / OpenCode — সবার জন্য stdio কনফিগ:

```json
{
  "mcpServers": {
    "DeshSubDispatch": {
      "command": "node",
      "args": ["/path/to/dist/server.bundle.cjs"]
    }
  }
}
```

HTTP মোডে কানেক্ট করতে (endpoint: `/mcp`, `/sse`, `/messages`, `/health`):

```json
{
  "mcpServers": {
    "DeshSubDispatch": {
      "type": "http",
      "url": "http://localhost:3000/mcp"
    }
  }
}
```

---

## 🛠️ প্রধান টুলসমূহ

| টুল | বর্ণনা |
|-----|--------|
| `register_agent` | নতুন এজেন্ট নিবন্ধন |
| `register_agent_from_skill` | স্কিল প্রিসেট থেকে এজেন্ট তৈরি |
| `list_skills` / `get_skill` | স্কিল তালিকা/বিস্তারিত |
| `dispatch_task` | একটি টাস্ক ডিসপ্যাচ |
| `dispatch_batch` | একাধিক টাস্ক একসাথে |
| `dispatch_workflow` | DAG ওয়ার্কফ্লো |
| `get_task_status` / `get_task_result` | স্ট্যাটাস ও ফলাফল (wait সাপোর্ট) |
| `cancel_task` / `retry_task` | ক্যান্সেল ও রিট্রাই |
| `list_tasks` / `get_dispatcher_stats` | টাস্ক তালিকা ও পরিসংখ্যান |

---

## 🧩 এজেন্ট টাইপ

- **llm**: `{ kind, provider: openai|anthropic|generic, model, apiKey?, baseUrl?, systemPrompt?, temperature?, maxTokens? }`
- **process**: `{ kind, command, args?, cwd?, env?, shell? }`
- **http**: `{ kind, url, method?, headers?, timeoutMs? }`

---

## 🇧🇩 বাংলাদেশের Open Source অবদান

DeshSubDispatch বাংলাদেশের ডেভেলপার কমিউনিটির জন্য একটি Open Source উদ্যোগ। আমরা বিশ্বাস করি প্রযুক্তি সবার জন্য উন্মুক্ত হওয়া উচিত। আপনার অবদান, ইস্যু রিপোর্ট, এবং পুল রিকোয়েস্ট স্বাগত।

### অবদান রাখতে

1. রিপোজিটরি ফর্ক করুন
2. ফিচার ব্রাঞ্চ তৈরি করুন (`git checkout -b feature/amazing`)
3. কমিট করুন (`git commit -m 'Add amazing feature'`)
4. পুশ করুন (`git push origin feature/amazing`)
5. পুল রিকোয়েস্ট খুলুন

---

## 📜 লাইসেন্স

MIT © Habibur Rahman — বাংলাদেশ 🇧🇩

---

> *"প্রযুক্তি সবার জন্য, সবার হাতে"* — DeshSubDispatch