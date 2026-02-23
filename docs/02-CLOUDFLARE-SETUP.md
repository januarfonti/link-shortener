# 02 - Cloudflare Setup

Guide to creating a Cloudflare account and setting up the D1 database.

---

## 1. Create a Cloudflare Account

If you don't have an account yet:

1. Go to https://dash.cloudflare.com/sign-up
2. Enter your email and password
3. Click **Create Account**
4. Verify your email

---

## 2. Getting Familiar with the Dashboard

After logging in, you'll see a dashboard with several important menus:

| Menu | Purpose |
|------|---------|
| **Workers & Pages** | Where you deploy applications |
| **D1** | SQLite database |
| **Zero Trust** | Security & Access Control |

---

## 3. About Cloudflare D1

D1 is a SQLite database that runs on the Cloudflare edge. Its advantages:

- **Free** up to 5GB storage
- **Fast** - database is close to users
- **Simple** - standard SQL, no need to learn new query languages
- **Serverless** - no server management needed

---

## 4. Create a D1 Database (Via Dashboard)

> **Note:** You can also create the database via the Wrangler CLI in the next step. This section is optional.

1. In the sidebar, click **Workers & Pages**
2. Select the **D1** tab
3. Click **Create database**
4. Enter the name: `link-shortener-db`
5. Click **Create**

---

## 5. Note the Database ID

After the database is created, you'll see a **Database ID**.

**Save this ID** - it will be used in the `wrangler.toml` file.

Example format: `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`

---

## 6. Cloudflare Free Tier Limits

Make sure you understand the free tier limits:

| Resource | Limit |
|----------|-------|
| D1 Storage | 5 GB |
| D1 Reads | 5 million/day |
| D1 Writes | 100k/day |
| Pages Requests | 100k/day |
| Pages Builds | 500/month |

> For personal use, these limits are more than enough!

---

## Checklist

- [ ] Cloudflare account is active
- [ ] Familiar with the dashboard
- [ ] (Optional) D1 Database created
- [ ] (Optional) Database ID noted

---

## Next

Continue to [03-WRANGLER-SETUP.md](./03-WRANGLER-SETUP.md) - Install and Configure Wrangler CLI
