# Cloudflare Worker Deployment Guide

## Setup KV Namespace

Before deploying, you need to create a KV namespace for caching:

```bash
# Navigate to the api directory
cd api

# Create a KV namespace for production
npx wrangler kv namespace create "COURTS_CACHE"

# This will output something like:
# 🌀 Creating namespace with title "itec-cors-proxy-COURTS_CACHE"
# ✨ Success!
# Add the following to your wrangler.toml:
# [[kv_namespaces]]
# binding = "COURTS_CACHE"
# id = "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
```

Copy the `id` value from the output and replace `YOUR_KV_NAMESPACE_ID` in `wrangler.toml`.

## Deploy the Worker

```bash
# Deploy to Cloudflare
npm run deploy
```

## Features

### 1. Batch Court Search API

**Endpoint:** `POST /api/search-courts`

**Description:** Makes a single request from the frontend to Cloudflare Worker, which then batches all court availability searches for a given date and tennis center.

**Request Body:**
```json
{
  "unitId": "12",
  "date": "04/12/2024",
  "timeSlots": ["08:00", "09:00", "10:00", ...],
  "sessionId": "_session_id=xxx",
  "authenticityToken": "xxx"
}
```

**Response:**
```json
{
  "unitId": "12",
  "date": "04/12/2024",
  "results": {
    "08:00": {
      "status": "available",
      "courts": [1, 2, 3],
      "slots": [...]
    },
    "09:00": {
      "status": "no-courts",
      "courts": [],
      "slots": []
    }
  },
  "cached": false
}
```

### 2. Caching

- **Cache Key:** `courts:{unitId}:{date}` (e.g., `courts:12:04/12/2024`)
- **TTL:** 10 minutes (600 seconds)
- **What's Cached:** Court availability data for a specific date and tennis center
- **What's NOT Cached:** User authentication details (session cookies, authenticity tokens)

The cache reduces the number of requests to `center.tennis.org.il` by storing court availability results. Each unique combination of tennis center and date is cached separately.

## Testing

### Local Development

```bash
# Start local development server
npm run dev
```

The worker will be available at `http://localhost:8787`.

### Test the Batch Endpoint

```bash
curl -X POST http://localhost:8787/api/search-courts \
  -H "Content-Type: application/json" \
  -d '{
    "unitId": "12",
    "date": "04/12/2024",
    "timeSlots": ["08:00", "09:00"],
    "sessionId": "_session_id=xxx",
    "authenticityToken": "xxx"
  }'
```

## Environment Variables

Configure in `wrangler.toml`:

- `ALLOWED_ORIGIN`: GitHub Pages origin (default: `https://adielbm.github.io`)
- `TARGET_BASE_URL`: Tennis center API URL (default: `https://center.tennis.org.il`)

## Benefits

1. **Reduced Requests:** One request from frontend instead of dozens
2. **Faster Response:** Parallel processing on the edge
3. **Caching:** 10-minute cache reduces load on tennis center servers
4. **Fallback:** If batch endpoint fails, frontend falls back to individual requests
