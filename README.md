# Nirbhay Knowledge Hub — starter app

This is a **starter project**, not a deployed live website. It provides a foundation for:
- User registration and login using a User ID and password
- Public profile page per user (`/u/<username>`)
- Profile editing and optional public profile photo
- Private file manager with per-user authorization for upload, download and delete
- Public landing page branded as Nirbhay Knowledge Hub

## Run locally
1. Install Node.js 20 or newer.
2. Copy `.env.example` to `.env`.
3. Replace `SESSION_SECRET` with a long random secret.
4. In this folder run `npm install`.
5. Run `npm start`.
6. Open `http://localhost:3000`.

## Important before a public launch
This is a development starter and **has not been security-audited**. Do not deploy it as-is for real personal documents. Before launch:
- Add CSRF protection, email verification, password reset, stronger abuse controls and account recovery.
- Add malware scanning, file content inspection and quotas; MIME type alone is not sufficient validation.
- Configure HTTPS, secure cookies, backups, database migrations and monitoring.
- Use persistent private object storage with private ACLs in production; never expose the private storage folder as a public static directory.
- Set up privacy policy, terms, data retention/deletion and consent for public profiles.
- Make the founder account an admin through a deliberate secure setup; don't rely on a public registration flow for admin privileges.
- Add real learning content, search, quiz engine, progress tracking and Resume Builder. Those modules are currently visual/roadmap only.
- For Google indexing, publish a stable public profile URL, allow indexing where intended, add sitemap/robots metadata and submit the domain in Google Search Console. Search indexing is not instant or guaranteed.
- Public profiles are visible to anyone when marked Public. Private files are designed to be accessible only to the owning signed-in user.

The default public founder details are configured with environment variables. For the founder profile editor, register an account and set the username to `nirbhay` only on a private test instance, or change the code to your chosen secure account provisioning flow before production.
