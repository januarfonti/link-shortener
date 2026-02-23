# 08 - Troubleshooting

Solutions for common issues.

---

## Wrangler & Authentication

### Error: "Not logged in"

**Solution:**
```bash
npx wrangler login
```

Follow the instructions in the browser.

---

### Error: "Multiple accounts found"

**Cause:** You have more than one Cloudflare account.

**Solution:** Add your Account ID:

```bash
CLOUDFLARE_ACCOUNT_ID=xxxxx npx wrangler d1 create link-shortener-db
```

Or set it as an environment variable:

```bash
export CLOUDFLARE_ACCOUNT_ID=xxxxx
```

Your Account ID can be found in the dashboard URL: `dash.cloudflare.com/ACCOUNT_ID/...`

---

### Error: "Authentication failed"

**Solution:**
1. Log out first:
```bash
npx wrangler logout
```

2. Log in again:
```bash
npx wrangler login
```

---

## Build Errors

### Error: "Cannot find module..."

**Solution:**
```bash
rm -rf node_modules
npm install
```

---

### Error: "TypeScript error"

**Solution:**
1. Check error details:
```bash
npm run build
```

2. Fix the errors in the files mentioned
3. Rebuild

---

### Error: "Vite build failed"

**Solution:**
1. Clear cache:
```bash
rm -rf dist
rm -rf node_modules/.vite
```

2. Rebuild:
```bash
npm run build
```

---

## Deployment Errors

### Error: "Project not found"

**Solution:** Create the project first:
```bash
npx wrangler pages project create link-shortener
```

Then deploy:
```bash
npm run deploy
```

---

### Error: "D1 binding not found"

**Cause:** `wrangler.toml` is not configured correctly.

**Solution:** Make sure the format is correct:
```toml
[[d1_databases]]
binding = "DB"
database_name = "link-shortener-db"
database_id = "your-database-id"
```

---

### Error: "Configuration file does not support account_id"

**Solution:** Remove `account_id` from `wrangler.toml`. Pages does not support this field.

---

## Database Errors

### Error: "Table not found"

**Cause:** Schema has not been initialized.

**Solution:**
```bash
npm run db:init:remote
```

---

### Error: "UNIQUE constraint failed"

**Cause:** The slug is already in use.

**Solution:** Use a different slug.

---

### How to Reset the Database

> **Warning:** This will delete all data!

```bash
npx wrangler d1 execute link-shortener-db --remote --command "DROP TABLE IF EXISTS clicks; DROP TABLE IF EXISTS links;"
npm run db:init:remote
```

---

## Domain & SSL

### Custom domain status "Pending"

**Solution:**
1. Wait 5-15 minutes
2. Make sure the domain is active on Cloudflare
3. Check DNS at https://dnschecker.org

---

### SSL certificate error

**Solution:**
1. Wait up to 24 hours for a new certificate
2. Make sure Cloudflare proxy (orange cloud) is active
3. In SSL/TLS settings, select "Full" or "Full (Strict)"

---

### "Too many redirects"

**Cause:** Usually an SSL misconfiguration.

**Solution:**
1. Open Cloudflare Dashboard > SSL/TLS
2. Set encryption mode to "Full"

---

## Cloudflare Access

### Not receiving OTP email

**Solution:**
1. Check the spam/junk folder
2. Make sure the email is correct (case-sensitive)
3. Wait a few minutes
4. Try again

---

### "Access Denied" even though the email is correct

**Solution:**
1. Clear browser cookies
2. Use an incognito/private window
3. Check the policy in the Zero Trust dashboard
4. Make sure the email matches exactly (including case)

---

### How to logout from Cloudflare Access

Open this URL:
```
https://your-team-name.cloudflareaccess.com/cdn-cgi/access/logout
```

---

## Application Errors

### Redirect not working

**Possible causes:**
1. Slug doesn't exist in the database
2. Typo in the URL
3. Slug is a reserved path

**Solution:** Check the admin dashboard to verify the link exists.

---

### Admin dashboard blank/error

**Solution:**
1. Clear browser cache
2. Hard refresh: `Ctrl + Shift + R` or `Cmd + Shift + R`
3. Check the browser console for errors
4. Make sure build & deploy succeeded

---

### Analytics not updating

**Info:** Analytics update in real-time, but there may be a 1-2 second delay.

**Solution:** Refresh the admin page.

---

## Performance

### Redirect is slow

**Possible causes:**
1. Cold start (rare on Cloudflare)
2. User location is far from the edge

**Info:** Normally redirects take < 100ms. Cloudflare has edges in 300+ locations worldwide.

---

### Database query timeout

**Solution:** Make sure queries are efficient. D1 has execution time limits.

For a normal link shortener, this should not happen.

---

## Getting Help

If the issue persists:

1. **Check Cloudflare Status:** https://cloudflarestatus.com
2. **Cloudflare Community:** https://community.cloudflare.com
3. **GitHub Issues:** https://github.com/januarfonti/link-shortener/issues

---

## Debugging Tips

### Check Wrangler Logs

```bash
npx wrangler pages deployment tail
```

### Check D1 Data

```bash
npx wrangler d1 execute link-shortener-db --remote --command "SELECT * FROM links"
```

### Test API Manually

```bash
curl https://go.yourdomain.com/api/links
```
