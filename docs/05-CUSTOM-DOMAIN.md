# 05 - Custom Domain

Guide to setting up a custom domain for your link shortener.

---

## Domain Options

| Option | Example | Cost |
|--------|---------|------|
| Cloudflare subdomain | `link-shortener.pages.dev` | Free |
| Your own subdomain | `go.yourdomain.com` | Free (if you already own the domain) |
| New domain | `go.co`, `link.co` | ~$10+/year |

> **Recommendation:** Use a short subdomain like `go.domain.com` or `l.domain.com`

---

## 1. Add Your Domain to Cloudflare

If your domain is not yet on Cloudflare:

1. Open the Cloudflare Dashboard
2. Click **Add a site**
3. Enter your domain: `yourdomain.com`
4. Select the **Free** plan
5. Follow the instructions to update nameservers at your registrar

---

## 2. Set Up Custom Domain in Pages

1. Open **Workers & Pages**
2. Click the `link-shortener` project
3. Select the **Custom domains** tab
4. Click **Set up a custom domain**

---

## 3. Enter Your Domain

Enter your desired subdomain:

```
go.yourdomain.com
```

Click **Continue**.

---

## 4. Activate DNS

Cloudflare will automatically create the DNS record.

Click **Activate domain**.

Wait a few minutes until the status becomes **Active**.

---

## 5. Verify

Open your custom domain:

- `https://go.yourdomain.com/admin` - Admin dashboard

---

## 6. SSL/HTTPS

Cloudflare automatically provides an SSL certificate. You don't need to set up anything.

Verify HTTPS is active by opening:

```
https://go.yourdomain.com
```

There should be a lock icon in the browser.

---

## Tips for Choosing a Subdomain

| Subdomain | Impression |
|-----------|------------|
| `go.domain.com` | Professional, commonly used |
| `l.domain.com` | Shortest |
| `link.domain.com` | Clear purpose |
| `s.domain.com` | Short |
| `r.domain.com` | Redirect |

---

## Troubleshooting

### Status "Pending"

- Wait 5-10 minutes
- Make sure the domain is active on Cloudflare
- Check DNS propagation at https://dnschecker.org

### Error "Domain not found"

- Make sure the domain has been added to Cloudflare
- Make sure nameservers have been updated to Cloudflare

### Error "SSL not working"

- Wait up to 24 hours for the SSL certificate
- Make sure Cloudflare proxy (orange cloud) is active

---

## Checklist

- [ ] Domain is on Cloudflare
- [ ] Custom domain added to Pages
- [ ] Domain status is Active
- [ ] HTTPS works
- [ ] Admin dashboard accessible via custom domain

---

## Next

Continue to [06-ZERO-TRUST.md](./06-ZERO-TRUST.md) - Protect Admin with Cloudflare Access
