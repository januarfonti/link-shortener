# 06 - Zero Trust (Cloudflare Access)

Guide to protecting the admin dashboard and the API with Cloudflare Access.

---

## What is Cloudflare Access?

Cloudflare Access is a Zero Trust security feature that lets you:

- Restrict access to specific pages
- Authenticate via email (OTP)
- No coding needed to implement auth

**Free for up to 50 users!**

---

## 1. Open the Zero Trust Dashboard

1. Go to https://one.dash.cloudflare.com
2. Or from the Cloudflare Dashboard, click **Zero Trust** in the sidebar

---

## 2. Choose a Plan

If this is your first time:

1. Select the **Free** plan
2. Follow the setup wizard
3. Choose a team name (e.g., `your-team-name`)

---

## 3. Create an Application

1. In the sidebar, click **Access** > **Applications**
2. Click **Add an application**
3. Select **Self-hosted**

---

## 4. Configure the Application

Fill in the form:

| Field | Value |
|-------|-------|
| Application name | `Link Shortener Admin` |
| Session duration | `24 hours` |

> This single application protects both the admin dashboard and the API — you'll add the `api` path alongside `admin` below.

Under **Application domain**:

| Field | Value |
|-------|-------|
| Subdomain | `go` |
| Domain | Select `yourdomain.com` |
| Path | `admin` |

Then add a second path for the API. Click **Add domain** (or **+ Add public hostname**) and fill in:

| Field | Value |
|-------|-------|
| Subdomain | `go` |
| Domain | Select `yourdomain.com` |
| Path | `api` |

> ⚠️ **Protect `api` as well as `admin`.** The dashboard calls `/api/links` and `/api/tokens` from your browser, so they share the same login. If `/api` is public, anyone can edit your links and create MCP tokens.
>
> Do **not** add `mcp`. The MCP endpoint uses its own bearer tokens (see [09-MCP.md](./09-MCP.md)).

Click **Next**.

---

## 5. Create a Policy

The policy determines who can access the application.

1. Click **Add a policy**

Fill in the form:

| Field | Value |
|-------|-------|
| Policy name | `Allow Admin Access` |
| Action | `Allow` |

Under **Configure rules** > **Include**:

| Selector | Value |
|----------|-------|
| Emails | `youremail@gmail.com` |

Click **Next**.

---

## 6. Review & Save

1. On the **Setup** page, review the configuration
2. Click **Add application**

---

## 7. Test Access

1. Open `https://go.yourdomain.com/admin`
2. You'll be redirected to the Cloudflare Access login page
3. Enter the registered email
4. Check your inbox for the OTP code
5. Enter the OTP code
6. You're now logged into the admin dashboard!
7. Open a private/incognito window and visit `https://go.yourdomain.com/api/links`. You should be redirected to the Access login page, not see JSON.
8. In the same private window, visit `https://go.yourdomain.com/api/tokens`. It should also redirect to the login page.

If `/api/links` or `/api/tokens` returns JSON in a private window, the `api` path is not protected. Recheck step 4 (if your dashboard does not cover sub-paths with `api`, use `api/*`).

---

## 8. Adding Other Users

To give access to others:

1. Open **Access** > **Applications**
2. Click the `Link Shortener Admin` application
3. In the **Policies** tab, edit the policy
4. Add a new email under **Include**

Or create a new policy with a different email.

---

## Security Tips

### Use a Domain-Specific Email

Instead of:
```
Emails: john@gmail.com, jane@gmail.com
```

Prefer:
```
Emails ending in: @yourcompany.com
```

### Session Duration

- `24 hours` - User logs in once a day
- `1 week` - User logs in once a week
- `1 month` - User rarely re-authenticates

Choose based on your security needs.

---

## Troubleshooting

### Not receiving OTP email

- Check the spam/junk folder
- Make sure the email is correct
- Wait a few minutes

### Error "Access Denied"

- Make sure your email is in the policy
- Check if the policy is active
- Clear browser cookies and try again

### Forgot to Logout

The session will expire automatically based on the duration you set.

To manually logout, open:
```
https://your-team-name.cloudflareaccess.com/cdn-cgi/access/logout
```

---

## Checklist

- [ ] Zero Trust is set up
- [ ] Application for admin is created
- [ ] `api` path added to the same application
- [ ] `/api/links` redirects to login in a private window
- [ ] Policy with email is configured
- [ ] Login via OTP works
- [ ] Admin dashboard accessible after auth

---

## Next

Continue to [07-FEATURES.md](./07-FEATURES.md) - Full Feature Documentation
