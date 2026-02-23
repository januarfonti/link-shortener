# 07 - Feature Documentation

Complete guide to all link shortener features.

---

## Overview

This link shortener includes:

1. **Link Redirect** - Short URLs that redirect to a destination
2. **Custom Slugs** - Create custom slugs like `/promo`
3. **Auto-generated Slugs** - Random 6-character slugs
4. **Click Analytics** - Track click count and referrer
5. **Admin Dashboard** - UI to manage all links
6. **Root Redirect** - Redirect the root domain to a specific URL

---

## 1. Admin Dashboard

### Access

```
https://go.yourdomain.com/admin
```

### Features

| Feature | Description |
|---------|-------------|
| List all links | Table with slug, URL, and click count |
| Search | Filter links by slug or URL |
| Sort | Sort by date or clicks |
| Quick copy | Click to copy the short URL |

---

## 2. Create Link

### Auto-generated Slug

1. Click **Create New Link**
2. Enter the destination URL
3. Leave "Use custom slug" unchecked
4. Click **Create**

A random slug will be generated, e.g., `aB3xY9`

### Custom Slug

1. Click **Create New Link**
2. Enter the destination URL
3. Check **Use custom slug**
4. Enter a slug: `promo-2024`
5. Click **Create**

### Slug Rules

| Rule | Details |
|------|---------|
| Length | 3-50 characters |
| Characters | Letters, numbers, and `-` (dash) |
| Case | Case-sensitive (`Promo` ≠ `promo`) |
| Unique | No duplicates allowed |

---

## 3. Edit Link

1. In the table, click the **Edit** icon on a link
2. Modify the destination URL or slug
3. Click **Update**

> **Note:** Changing a slug will make the old URL stop working.

---

## 4. Delete Link

1. In the table, click the **Delete** icon on a link
2. Confirm the deletion

> **Warning:** Deletion is permanent and will remove all associated analytics data.

---

## 5. Analytics

### View Analytics

1. In the table, click the **Analytics** icon on a link
2. A modal will appear with:
   - Total clicks
   - Recent clicks (time & referrer)

### Tracked Data

| Data | Details |
|------|---------|
| Click count | Total number of clicks |
| Timestamp | Time of each click |
| Referrer | Where the user came from |

---

## 6. Copy Short URL

Click the **Copy** button next to a link to copy the short URL to your clipboard.

Copied format:
```
https://go.yourdomain.com/slug
```

---

## 7. Root Redirect

By default, visiting the root domain serves the SPA. You can configure it to redirect to a specific URL using the `ROOT_REDIRECT_URL` environment variable.

### Configuration

Set the `ROOT_REDIRECT_URL` environment variable via the Cloudflare dashboard or CLI:

```bash
npx wrangler pages secret put ROOT_REDIRECT_URL
# Enter your URL when prompted, e.g., https://yourwebsite.com
```

### Behavior

- Without `ROOT_REDIRECT_URL`: `https://go.yourdomain.com` serves the app
- With `ROOT_REDIRECT_URL`: `https://go.yourdomain.com` redirects to the configured URL

---

## 8. Reserved Paths

The following paths cannot be used as slugs:

- `admin` - Admin dashboard
- `api` - API endpoints
- `static` - Static files
- `assets` - Asset files

---

## 9. API Endpoints

For advanced users, you can access the API directly:

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `GET` | `/api/links` | List all links |
| `POST` | `/api/links` | Create a new link |
| `GET` | `/api/links/:id` | Link details + analytics |
| `PUT` | `/api/links/:id` | Update a link |
| `DELETE` | `/api/links/:id` | Delete a link |

### Example: Create Link via API

```bash
curl -X POST https://go.yourdomain.com/api/links \
  -H "Content-Type: application/json" \
  -d '{"destination_url": "https://google.com", "slug": "test"}'
```

---

## 10. Customization

### Change Branding

Edit `src/views/AdminDashboard.vue` to modify:
- App name
- Logo
- Theme colors

### Add Analytics (Umami, etc.)

Edit `index.html` and add your tracking script.

---

## Next

Continue to [08-TROUBLESHOOTING.md](./08-TROUBLESHOOTING.md) - Common Error Solutions
