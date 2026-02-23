# Link Shortener

A self-hosted URL shortener built with Vue 3, Cloudflare Pages, and D1. Free hosting forever on Cloudflare's free tier.

## Features

- Custom and auto-generated short slugs
- Click tracking with referrer analytics
- Admin dashboard for managing links
- Edge-powered redirects (300+ locations worldwide, <50ms)
- Protected admin via Cloudflare Access (Zero Trust)
- SQLite database on Cloudflare D1

## Tech Stack

- **Frontend:** Vue 3 + TypeScript + Tailwind CSS v4
- **Backend:** Cloudflare Pages Functions
- **Database:** Cloudflare D1 (SQLite at the edge)
- **Auth:** Cloudflare Access (Zero Trust)
- **Hosting:** Cloudflare Pages

## Quick Start

```bash
# Install dependencies
npm install

# Copy config template
cp wrangler.toml.example wrangler.toml

# Login to Cloudflare
npx wrangler login

# Create the D1 database
npx wrangler d1 create link-shortener-db

# Update wrangler.toml with the database_id from the previous step

# Initialize the database schema
npm run db:init:remote

# Deploy
npm run deploy
```

## Local Development

```bash
# Initialize local database
npm run db:init

# Start dev server with Wrangler (includes D1 binding)
npm run dev:wrangler
```

## Project Structure

```
link-shortener/
├── src/                    # Vue 3 frontend
├── functions/              # Cloudflare Pages Functions (API + redirect handler)
│   ├── api/links/          # CRUD API for links
│   └── [[slug]].ts         # Catch-all redirect handler
├── db/                     # Database schema
├── docs/                   # Documentation
├── public/                 # Static assets
├── wrangler.toml.example   # Wrangler config template
└── package.json
```

## Configuration

### `wrangler.toml`

Copy `wrangler.toml.example` and fill in your D1 database ID:

```toml
name = "link-shortener"
compatibility_date = "2024-12-01"
pages_build_output_dir = "./dist"

[[d1_databases]]
binding = "DB"
database_name = "link-shortener-db"
database_id = "YOUR_DATABASE_ID"
```

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `ROOT_REDIRECT_URL` | URL to redirect when visiting the root path (`/`) | Serves the SPA |

Set environment variables via the Cloudflare dashboard or `wrangler pages secret put`.

## API Endpoints

All endpoints are under `/api/links`.

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/links` | List all links |
| `POST` | `/api/links` | Create a new link |
| `GET` | `/api/links/:id` | Get link details with click analytics |
| `PUT` | `/api/links/:id` | Update a link |
| `DELETE` | `/api/links/:id` | Delete a link |

### Create Link

```json
POST /api/links
{
  "destination_url": "https://example.com",
  "slug": "my-link"          // optional, auto-generated if omitted
}
```

## Protecting the Admin Dashboard

Use Cloudflare Access (Zero Trust) to restrict access to the `/admin` path. See `docs/06-ZERO-TRUST.md` for a step-by-step guide.

## Contributing

Contributions are welcome! Please open an issue or submit a pull request.

## License

[MIT](LICENSE)
