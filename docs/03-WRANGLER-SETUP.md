# 03 - Wrangler Setup

Wrangler is Cloudflare's CLI tool for deploying and managing applications.

---

## 1. Install Dependencies

First, open a terminal and navigate to the project folder:

```bash
cd link-shortener
```

Install all dependencies:

```bash
npm install
```

---

## 2. Log In to Cloudflare

Run the command:

```bash
npx wrangler login
```

Your browser will open automatically. Click **Allow** to grant access.

---

## 3. Verify Login

Check if the login was successful:

```bash
npx wrangler whoami
```

Expected output:

```
Getting User settings...
👋 You are logged in with an OAuth Token, associated with the email: youremail@gmail.com!
```

---

## 4. Create D1 Database

If you haven't created the database in the previous step:

```bash
npx wrangler d1 create link-shortener-db
```

Output:

```
✅ Successfully created DB 'link-shortener-db'

[[d1_databases]]
binding = "DB"
database_name = "link-shortener-db"
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

**Note the `database_id`!**

---

## 5. Update wrangler.toml

Copy the example config and update the `database_id`:

```bash
cp wrangler.toml.example wrangler.toml
```

Edit `wrangler.toml`:

```toml
name = "link-shortener"
compatibility_date = "2024-12-01"
pages_build_output_dir = "./dist"

[[d1_databases]]
binding = "DB"
database_name = "link-shortener-db"
database_id = "REPLACE_WITH_YOUR_DATABASE_ID"
```

---

## 6. Initialize Database Schema

Run the migration to create the tables:

```bash
npm run db:init:remote
```

Successful output:

```
🌀 Executing on remote database link-shortener-db:
🌀 To execute on your local development database, remove the --remote flag.
✔ OK
```

---

## 7. Verify Database

Check if the tables were created:

```bash
npx wrangler d1 execute link-shortener-db --remote --command "SELECT name FROM sqlite_master WHERE type='table'"
```

The output should show:

```
┌────────┐
│ name   │
├────────┤
│ links  │
├────────┤
│ clicks │
└────────┘
```

---

## Troubleshooting

### Error: "Multiple accounts found"

If you have more than one Cloudflare account, add your Account ID:

```bash
CLOUDFLARE_ACCOUNT_ID=your_account_id npx wrangler d1 create link-shortener-db
```

Your Account ID can be found in the dashboard URL: `dash.cloudflare.com/ACCOUNT_ID_HERE/...`

### Error: "Not logged in"

Run again:

```bash
npx wrangler login
```

---

## Checklist

- [ ] Dependencies installed (`npm install`)
- [ ] Logged in to Cloudflare
- [ ] D1 Database created
- [ ] `wrangler.toml` updated with database ID
- [ ] Database schema initialized

---

## Next

Continue to [04-DEPLOYMENT.md](./04-DEPLOYMENT.md) - Deploy to Production
