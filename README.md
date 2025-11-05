**Current Milestone: v0.2-ingest**
Phase 1.5 complete — ingestion loop operational with local + S3 scaffold
Next phase: Intent detection and KB recommendations

---

# rtaa — Real-Time Agent Assist (Demo)

Next.js 14 + TypeScript demo for Exotel RT Agent Assist (S3 transcripts + Supabase).

## Quickstart

```bash
nvm use
npm install
npm run dev
```

## Scripts

- `npm run dev` — start development server
- `npm run build` — build for production
- `npm start` — start production server
- `npm run lint` — run linter (eslint)
- `npm run format` — run Prettier to format files

## Deploy on Vercel

This project is compatible with Vercel. To deploy:

1. Push the repository to your Git provider (GitHub, GitLab, etc.).
2. Import the repository into Vercel.
3. Add environment variables from `.env.example` in the Vercel project settings.
4. Use the default build command `npm run build` and the output directory (handled by Next.js).

Tip: Ensure you add your Supabase keys and any LLM/S3 credentials as Environment Variables in the Vercel dashboard before deployment.
