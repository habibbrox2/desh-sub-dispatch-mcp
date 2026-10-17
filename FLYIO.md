# 🚀 Fly.io Deployment Guide — DeshSubDispatch

এই গাইড Fly.io-তে DeshSubDispatch MCP সার্ভার deploy করার সম্পূর্ণ ধাপ।

## 1. প্রয়োজনীয়

- Fly.io অ্যাকাউন্ট: https://fly.io
- `flyctl` CLI
- GitHub repo (ইতিমধ্যে আছে)

## 2. flyctl ইনস্টল

```bash
# Linux/macOS
curl -L https://fly.io/install.sh | sh

# Windows (PowerShell)
iwr https://fly.io/install.ps1 -useb | iex
```

PATH-এ যোগ করুন এবং টার্মিনাল রিস্টার্ট করুন।

## 3. লগইন

```bash
fly auth login
```

ব্রাউজার খুলবে — GitHub/Google দিয়ে লগইন করুন।

## 4. অ্যাপ তৈরি (প্রথমবার)

```bash
cd desh-sub-dispatch-mcp
fly launch --no-deploy
```

- App name: `desh-sub-dispatch` (বা আপনার পছন্দ)
- Region: `sin` (Singapore — বাংলাদেশের কাছাকাছি)
- Postgres/Redis: **No** (আমরা SQLite ব্যবহার করব)

## 5. সিক্রেট সেট করুন

```bash
fly secrets set MCP_AUTH_TOKEN="your-strong-random-token-here"
fly secrets set DESH_DB_PATH="/data/desh-sub-dispatch.db"
fly secrets set CORS_ORIGIN="*"
```

## 6. ভলিউম তৈরি (DB persistence)

```bash
fly volumes create desh_data --size 1 --region sin
```

## 7. fly.toml আপডেট করুন

`fly.toml`-এ ভলিউম মাউন্ট যোগ করুন:

```toml
[mounts]
  source = "desh_data"
  destination = "/data"
```

## 8. ডেপ্লয় করুন

```bash
fly deploy
```

প্রথম deploy-এ 2-3 মিনিট লাগতে পারে।

## 9. যাচাই

```bash
fly status
fly logs
curl https://desh-sub-dispatch.fly.dev/health
```

## 10. URL

আপনার সার্ভার এখন লাইভ:
```
https://desh-sub-dispatch.fly.dev
```

MCP endpoint: `https://desh-sub-dispatch.fly.dev/mcp`

## 11. আপডেট ডেপ্লয়

কোড পরিবর্তনের পর:

```bash
git pull
npm run build
fly deploy
```

## 12. ফ্রি টিয়ার সীমা

| রিসোর্স | ফ্রি লিমিট |
|---------|-----------|
| VM | 3 × shared-cpu-1x (256MB) |
| Outbound transfer | 160 GB/মাস |
| Storage | 3 GB (volumes) |

### Auto-stop কনফিগ

`fly.toml`-এ:
```toml
[http_service]
  auto_stop_machines = true
  auto_start_machines = true
  min_machines_running = 0
```

Idle হলে VM ঘুমাবে, request আসলে জেগে উঠবে (cold start ~2-5s)।

### ২৪/৭ চালাতে (ফ্রি নয়)
```toml
min_machines_running = 1
```
এতে ফ্রি allowance দ্রুত শেষ হবে।

## 13. ট্রাবলশুটিং

| সমস্যা | সমাধান |
|--------|--------|
| Build fail | `fly logs` দেখুন, Dockerfile চেক করুন |
| DB not persisting | ভলিউম মাউন্ট চেক করুন |
| Auth error | `fly secrets list` দিয়ে টোকেন আছে কিনা দেখুন |
| Cold start slow | `min_machines_running = 1` সেট করুন |

## 14. মনিটরিং

```bash
fly dashboard          # ব্রাউজারে ড্যাশবোর্ড
fly logs --tail        # লাইভ লগ
fly status             # অ্যাপ স্ট্যাটাস
```

---

> **GitHub Pages**: https://habibbrox2.github.io/desh-sub-dispatch-mcp/  
> **GitHub Repo**: https://github.com/habibbrox2/desh-sub-dispatch-mcp