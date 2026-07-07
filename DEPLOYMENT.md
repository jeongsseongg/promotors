# Deployment Checklist

## Situation Analysis

This is a static customer site. Deploy only the generated `dist/` folder, not the whole working directory.

Official references checked:

- Firebase Hosting uses the `hosting.public` directory in `firebase.json`: https://firebase.google.com/docs/hosting/full-config
- Cloudflare Pages Direct Upload deploys prebuilt static assets with Wrangler: https://developers.cloudflare.com/pages/get-started/direct-upload/
- GitHub Actions secrets are encrypted repository secrets and are only readable when explicitly used by a workflow: https://docs.github.com/actions/security-guides/using-secrets-in-github-actions

## Key Problems / Weak Points

- Current app data is stored in each visitor browser through `localStorage`. It is not a shared production booking database.
- Admin password is in frontend JavaScript. Anyone inspecting the source can find it.
- Firebase, Cloudflare, and GitHub account authentication are not configured on this PC yet.
- Domain routing cannot be completed until the exact purchased domain and DNS owner are known.

## Strategic Options

1. Fast launch: Cloudflare Pages as primary host, Firebase Hosting as backup.
2. Single host: Cloudflare Pages only, simplest DNS and fastest edge delivery.
3. Production system: add Firebase Auth + Firestore for real shared reservations, then deploy.

## Best Recommended Strategy

Launch the static site on Cloudflare Pages first because DNS and CDN are strongest there. Keep Firebase Hosting configured as fallback, but do not present the current reservation/admin feature as a real multi-user backend until Firebase Auth and Firestore are added.

## Concrete Next Actions

### Local build

```bash
npm install
npm run build
```

### Firebase deploy

Create a Firebase project, then set the project ID:

```bash
copy .firebaserc.example .firebaserc
```

Edit `.firebaserc` and replace `YOUR_FIREBASE_PROJECT_ID`.

Local deploy after login:

```bash
npx firebase-tools login
npm run deploy:firebase
```

### Cloudflare deploy

Create a Cloudflare Pages project named `promotors-site`.

Local deploy after login:

```bash
npx wrangler login
npm run deploy:cloudflare
```

### GitHub encrypted secrets

In GitHub repository settings, add these encrypted Actions secrets:

- `FIREBASE_PROJECT_ID`
- `FIREBASE_SERVICE_ACCOUNT_JSON`
- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN`

The workflow in `.github/workflows/deploy.yml` deploys on push to `main`. If a platform secret is missing, that deploy is skipped instead of failing.

### Domain

For the domain, use Cloudflare DNS as the source of truth:

- Root domain: use Cloudflare Pages custom domain flow, then add the DNS record Cloudflare provides.
- `www`: add it as a second Pages custom domain and redirect root to `www` or `www` to root, but choose only one canonical URL.
- Firebase custom domain can remain backup unless you explicitly want traffic split.

