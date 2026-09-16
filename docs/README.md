# Link Shortener - Self-Hosted URL Shortener

### Own your link shortener with a custom domain, free hosting forever.

---

## What You Get

```
link-shortener/
├── Full Source Code (Vue 3 + TypeScript)
├── docs/
│   ├── 01-PREREQUISITES.md        # Initial setup
│   ├── 02-CLOUDFLARE-SETUP.md     # Create account & database
│   ├── 03-WRANGLER-SETUP.md       # Install & configure CLI
│   ├── 04-DEPLOYMENT.md           # Deploy to production
│   ├── 05-CUSTOM-DOMAIN.md        # Set up your own domain
│   ├── 06-ZERO-TRUST.md           # Protect the admin dashboard and API
│   ├── 07-FEATURES.md             # Feature documentation
│   ├── 08-TROUBLESHOOTING.md      # Common error solutions
│   └── 09-MCP.md                  # Connect AI agents via MCP
```

---

## Why This Link Shortener?

| Feature | Benefit |
|---------|---------|
| **Free Forever** | Uses Cloudflare free tier, no hosting costs |
| **Super Fast** | Redirects served from 300+ edge locations worldwide |
| **Built-in Analytics** | Track click count, time, and referrer |
| **Custom Slugs** | Create links like `go.domain.com/promo` |
| **Admin Dashboard** | Modern UI to manage all links |
| **Secure** | Protected by Cloudflare Access (Zero Trust) |
| **AI-Ready** | MCP server lets AI agents create and manage links |
| **Your Own Domain** | Use your domain, not someone else's |

---

## Tech Stack

- **Frontend:** Vue 3 + TypeScript + Tailwind CSS v4
- **Backend:** Cloudflare Pages Functions (Serverless)
- **Database:** Cloudflare D1 (SQLite at the edge)
- **Hosting:** Cloudflare Pages (Global CDN)
- **Auth:** Cloudflare Access (Zero Trust)

---

## Estimated Cost

| Item | Cost |
|------|------|
| Cloudflare Account | **Free** |
| Cloudflare Pages | **Free** (100k requests/day) |
| Cloudflare D1 | **Free** (5GB storage) |
| Cloudflare Access | **Free** (50 users) |
| Domain (optional) | ~$10-15/year |
| **Total** | **$0 - $15/year** |

---

## Prerequisites

- Node.js 22 or later
- Cloudflare account (free)
- Domain (optional, you can use a free Cloudflare subdomain)
- Terminal / Command Prompt

---

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Login to Cloudflare
npx wrangler login

# 3. Create database
npx wrangler d1 create link-shortener-db

# 4. Update wrangler.toml with the database ID

# 5. Initialize database
npm run db:init:remote

# 6. Deploy!
npm run deploy
```

> For a complete step-by-step guide, read the documentation in the `docs/` folder.

---

## Documentation

| File | Contents |
|------|----------|
| [01-PREREQUISITES.md](./01-PREREQUISITES.md) | What you need before getting started |
| [02-CLOUDFLARE-SETUP.md](./02-CLOUDFLARE-SETUP.md) | How to create a Cloudflare account and D1 database |
| [03-WRANGLER-SETUP.md](./03-WRANGLER-SETUP.md) | Install and configure the Wrangler CLI |
| [04-DEPLOYMENT.md](./04-DEPLOYMENT.md) | Deploy the app to Cloudflare Pages |
| [05-CUSTOM-DOMAIN.md](./05-CUSTOM-DOMAIN.md) | Set up a custom domain |
| [06-ZERO-TRUST.md](./06-ZERO-TRUST.md) | Protect the admin dashboard and API with Cloudflare Access |
| [07-FEATURES.md](./07-FEATURES.md) | Full feature documentation |
| [08-TROUBLESHOOTING.md](./08-TROUBLESHOOTING.md) | Solutions for common errors |
| [09-MCP.md](./09-MCP.md) | Connect AI agents (Hermes, Claude, and more) via MCP |

---

## Support

Have a question or issue? Open an issue on [GitHub Issues](https://github.com/januarfonti/link-shortener/issues).

---

## License

MIT License - see the [LICENSE](../LICENSE) file for details.
