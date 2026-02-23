# 04 - Deployment

Guide to deploying the link shortener to Cloudflare Pages.

---

## 1. Build the Project

First, build the project for production:

```bash
npm run build
```

Successful output:

```
vite v7.x.x building for production...
✓ 39 modules transformed.
dist/index.html                   0.60 kB
dist/assets/index-xxxxx.css      15.90 kB
dist/assets/index-xxxxx.js       90.49 kB
✓ built in 500ms
```

---

## 2. Deploy to Cloudflare Pages

Run the deploy command:

```bash
npm run deploy
```

Or manually:

```bash
npx wrangler pages deploy ./dist
```

### First Time Deploy

If this is your first deploy, Wrangler will ask:

```
No project selected. Would you like to create one or use an existing project?
❯ Create a new project
  Use an existing project
```

Select **Create a new project** and name it `link-shortener`.

---

## 3. Note the Deployment URL

After a successful deploy, you'll receive a URL:

```
✨ Deployment complete! Take a peek over at https://xxxxx.link-shortener-xxx.pages.dev
```

Open that URL to test!

---

## 4. Test the Application

### Test Admin Dashboard

Open: `https://your-project.pages.dev/admin`

You should see the admin dashboard (no links yet).

### Test Create Link

1. Click **Create New Link**
2. Enter a destination URL: `https://google.com`
3. (Optional) Enter a custom slug: `test`
4. Click **Create**

### Test Redirect

Open: `https://your-project.pages.dev/test`

It should redirect to Google.

---

## 5. Re-deploy

Whenever you make code changes, run:

```bash
npm run deploy
```

Deployment usually completes in 10-30 seconds.

---

## 6. Check the Cloudflare Dashboard

1. Go to https://dash.cloudflare.com
2. Select **Workers & Pages**
3. Click the `link-shortener` project

Here you can see:
- Deployment history
- Analytics
- Settings

---

## Troubleshooting

### Error: "Project not found"

Create the project first:

```bash
npx wrangler pages project create link-shortener
npx wrangler pages deploy ./dist
```

### Error: "Build failed"

Check for TypeScript errors:

```bash
npm run build
```

Fix any errors before redeploying.

### Error: "D1 binding not found"

Make sure `wrangler.toml` is correct and the database ID is valid.

---

## Checklist

- [ ] Build succeeded without errors
- [ ] Deployed to Cloudflare Pages
- [ ] Deployment URL noted
- [ ] Admin dashboard is accessible
- [ ] Create & redirect link works

---

## Next

Continue to [05-CUSTOM-DOMAIN.md](./05-CUSTOM-DOMAIN.md) - Set Up a Custom Domain
