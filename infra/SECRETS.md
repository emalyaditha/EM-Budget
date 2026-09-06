# Secrets management

## SESSION_SECRET

- Required by the server for signing/verifying session tokens, device tokens and OTP-linked auth flows.
- Generate a fresh value with:
  ```
  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  ```
- Stored ONLY in:
  - your local `.env` (gitignored),
  - the Vercel project environment (Production + Preview/Development scopes),
  - `public.vault.session_secret` in Supabase, which the server re-seeds on boot via `upsert` from `SESSION_SECRET`.
- Never commit the literal value. `.env.example` carries a placeholder only.

## Rotating SESSION_SECRET

1. Generate a new 32-byte hex value.
2. Update `.env` and the Vercel env value (Production/Preview/Development).
3. Restart/redeploy the server — on boot `seedVaultSessionSecret` upserts `public.vault.session_secret`.
4. Expect a clean break: HMAC rotation invalidates every issued session/device token, so all users must re-login. This is intentional.

## Burned values

The following literal was committed to git history and must be treated as **compromised**:

```
a492f8b1c7dc4a82b95c06feee482810
```

- Do not reuse it anywhere.
- Anyone with repository (or GitHub history) access could forge signed tokens while it was live.
- The current value was rotated away from it on 2026-09-06; if you have any doubt about exposure window, rotate again now.

## Vercel environment variables

| Variable | Purpose | Required |
| --- | --- | --- |
| `SESSION_SECRET` | HMAC master key (see above) | yes |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-side Supabase access (vault, auth, RPC) | yes (server 500s without it) |
| `VITE_SUPABASE_URL` | Client Supabase project URL | yes |
| `VITE_SUPABASE_ANON_KEY` | Client Supabase public key | yes |
| `APP_ORIGIN` | Canonical origin for CSRF/WebAuthn checks | yes (server refuses to boot without it) |
| `SMTP_HOST/PORT/USER/PASS/FROM` | OTP email delivery | yes for real emails (dev can use `DEV_OTP_RESPONSE=true`) |
| `GEMINI_API_KEY` | AI features (if used) | no |
| `SENTRY_DSN` | Error reporting (no-op when empty) | no |

Note: `APP_ORIGIN` in the codebase is sometimes referenced as `APP_URL` in older config comments — the enforced key is **`APP_ORIGIN`** (see `server.ts` boot validation).

## Dev-mode OTP bypass

`DEV_OTP_RESPONSE=true` makes the send-OTP endpoint return the passcode in the JSON response so local testing can log in without SMTP. It is hard-gated by `IS_PRODUCTION` (`NODE_ENV === "production"`), so a production deploy can never expose it even if the env var is set. Never set it in Vercel envs.