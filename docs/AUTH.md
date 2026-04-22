# Authentication

> How to authenticate against the CDP API. Contains gotchas that differ from what the OpenAPI spec suggests.

## Correct Auth Flow

The **sign-in endpoint** is NOT `/api/auth/sign-in`. That route requires a Bearer token (middleware bug) and always returns `{"error":"missing token"}`.

**Use this:**
```bash
TOKEN=$(curl -s -X POST "https://cdpv2.ssd.uz/public/api/signin" \
  -H "Content-Type: application/json" \
  -d '{"username":"shop2025.11.12-13:04:00@cdp.ru","password":"qwerty123","domainName":"1762934640.cdp.com"}' \
  | grep -o '"jwtToken":"[^"]*"' | cut -d'"' -f4)
```

## Key Differences vs Wrong URL

| | Correct | Wrong |
|--|---------|-------|
| Path | `/public/api/signin` | `/api/auth/sign-in` |
| Body field | `username` + `domainName` | `email` |
| Response field | `jwtToken` | `token` |

## Token Usage

All `/api/*` endpoints require `Authorization: Bearer <token>` header.
Public endpoints (`/public/*`, `/cdp-ingest/*`) require no auth.

## .env Configuration

```env
CDP_BASE_URL=https://cdpv2.ssd.uz
CDP_DOMAIN=1762934640.cdp.com
CDP_EMAIL=shop2025.11.12-13:04:00@cdp.ru
CDP_PASSWORD=qwerty123
CDP_TENANT_ID=1762934640267
```
