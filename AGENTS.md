# Repository Guidelines

## Project Structure & Module Organization

- `src/app/`: Next.js App Router entrypoints.
  - `src/app/page.tsx`: Home page.
  - `src/app/api/**`: Server routes (BFF/proxy to third‑party APIs).
  - `src/app/ui/**`: Client UI components (charts, app shell).
- `src/lib/`: Shared logic (schemas, PVGIS integration, caching, time utilities, types).
  - Examples: `src/lib/pvgis.ts`, `src/lib/geocode.ts`, `src/lib/schemas.ts`
- `docs/`: Product/engineering documentation (PRD, verification notes, etc.).

## Build, Test, and Development Commands

- `npm run dev`: Run local dev server.
- `npm run dev:clean`: Clear `.next` cache then start dev (use if you see missing chunk/module errors).
- `npm run build`: Production build (also performs typecheck/lint via Next tooling).
- `npm run start`: Run the production server after `build`.
- `npm run lint`: Run ESLint (`next/core-web-vitals`).
- `npm run clean`: Remove `.next` and `node_modules/.cache`.

## Coding Style & Naming Conventions

- Language: TypeScript + React (Next.js App Router).
- Indentation: 2 spaces (match existing files).
- Prefer small, focused modules in `src/lib/` and keep API parsing/normalization close to the integration (e.g., PVGIS parsing in `src/lib/pvgis.ts`).
- Use Zod for request validation in API routes (see `src/lib/schemas.ts`).
- Paths: use `@/*` alias for imports from `src/`.

## Testing Guidelines

- No automated test framework is currently configured.
- Minimum verification before PRs: `npm run build` + manual smoke test (address geocode, PVGIS TMY/series, CSV export).

## Commit & Pull Request Guidelines

- This repository is not currently a Git repo, so no commit conventions are established.
- When contributing, use clear, imperative messages (e.g., `Fix geocode candidate selection`) and include in PR:
  - What changed and why
  - Screenshots for UI changes
  - Notes on API behavior changes (especially time zone/units)

## Security & Configuration Tips

- Do not expose third‑party calls directly from the browser; keep them under `src/app/api/**`.
- Configure optional env vars via `.env.local` (see `README.md`), especially `GEOCODE_USER_AGENT`.

