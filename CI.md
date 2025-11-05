# CI/CD Documentation

This document describes the continuous integration setup for the RTAA project.

## Overview

The project uses **GitHub Actions** for CI/CD. The workflow runs automatically on:
- Push to `main`, `develop`, or any `feature/*` branch
- Pull requests targeting `main` or `develop`

## CI Pipeline Steps

1. **Checkout code** - Clone the repository
2. **Setup Node.js** - Use Node 20 (from `.nvmrc`)
3. **Validate secrets** - Ensure required environment variables are present
4. **Install dependencies** - Run `npm ci`
5. **Build project** - Run `npm run build` to catch TypeScript errors
6. **Run tests** - Execute configuration tests (`tests/config.test.ts`)
7. **Smoke tests** - Run KB adapter smoke test

## Required GitHub Secrets

The CI pipeline requires the following secrets to be configured in your GitHub repository:

### Setting Up Secrets

1. Navigate to your GitHub repository
2. Go to **Settings** > **Secrets and variables** > **Actions**
3. Click **New repository secret**
4. Add each of the following secrets:

### Required Secrets

| Secret Name | Description | Example |
|-------------|-------------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase project URL | `https://xxx.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (server-only) | `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...` |
| `ADMIN_KEY` | Admin key for configuration updates | `your-secret-admin-key` |

### Optional Secrets

| Secret Name | Description | Example |
|-------------|-------------|---------|
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anonymous key (public) | `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...` |
| `LLM_API_KEY` | OpenAI or LLM provider API key | `sk-proj-...` |

## Local Testing

To test the CI pipeline locally, you can use [act](https://github.com/nektos/act):

```bash
# Install act (macOS)
brew install act

# Run the workflow locally
act -s NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co \
    -s SUPABASE_SERVICE_ROLE_KEY=eyJxxx... \
    -s ADMIN_KEY=test123
```

Or create a `.env.ci` file with the required variables and source it:

```bash
# .env.ci (add to .gitignore)
export NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
export SUPABASE_SERVICE_ROLE_KEY=eyJxxx...
export ADMIN_KEY=test123
```

Then run:

```bash
source .env.ci && npm run build && npx tsx tests/config.test.ts
```

## Workflow File Location

The CI workflow is defined in: `.github/workflows/ci.yml`

## Troubleshooting

### Error: "Missing required secrets"

**Cause:** One or more required secrets are not configured in GitHub.

**Solution:** Follow the steps in "Setting Up Secrets" above to add the missing secrets.

### Error: "Tests failed"

**Cause:** Configuration tests or smoke tests failed.

**Solution:**
1. Check the test output in the GitHub Actions logs
2. Ensure your database has the required tables (run migrations)
3. Verify that the seeded configurations exist (run `scripts/seed-default-config.sh`)

### Error: "Build failed"

**Cause:** TypeScript compilation errors.

**Solution:**
1. Run `npm run build` locally to see the errors
2. Fix TypeScript errors in the codebase
3. Commit and push the fixes

### Error: "Cannot find module"

**Cause:** Dependencies not installed correctly or cache issues.

**Solution:**
1. Clear the GitHub Actions cache: Settings > Actions > Caches
2. Re-run the workflow
3. If issue persists, check `package.json` and `package-lock.json`

## CI Badge

Add this badge to your `README.md` to show CI status:

```markdown
[![CI](https://github.com/YOUR_USERNAME/rtaa/actions/workflows/ci.yml/badge.svg)](https://github.com/YOUR_USERNAME/rtaa/actions/workflows/ci.yml)
```

Replace `YOUR_USERNAME` with your GitHub username or organization name.

## Security Notes

- **Never commit secrets to the repository**
- Store all sensitive keys in GitHub Secrets
- Use separate Supabase projects for CI/CD (not production)
- Rotate keys regularly
- Use read-only credentials when possible

## Future Enhancements

- [ ] Add code coverage reporting
- [ ] Deploy preview environments for PRs
- [ ] Add performance benchmarks
- [ ] Integrate with Slack/Discord notifications
- [ ] Add security scanning (Dependabot, CodeQL)
- [ ] Add E2E tests with Playwright/Cypress

---

**Last Updated:** 2025-11-05
**Maintainer:** RTAA Team
