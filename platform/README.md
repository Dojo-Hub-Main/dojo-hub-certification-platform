# Dojo Hub Certification Platform — Production Build

A production-grade rewrite of the Dojo Hub certification platform prototype: **NestJS** REST API + **Next.js 16** (App Router) frontend, backed by **PostgreSQL** via Prisma and **S3-compatible object storage** (MinIO locally).

The original AI-Studio prototype lives untouched at the repository root (`../src`, `../index.html`, etc.) — this `platform/` directory is the new, real application, built alongside it.

## Architecture

```
platform/
  apps/
    api/     NestJS backend — auth, RBAC, curriculum, submissions, quizzes, credentials,
             office hours, notifications (Socket.IO), reports, AI grading (Claude API)
    web/     Next.js 16 frontend — student / admin / evaluator dashboards, public
             credential verification page
  packages/
    shared/  Shared TypeScript enums & DTO types consumed by both apps
  docker-compose.yml   postgres, minio (+ bucket bootstrap)
```

Both apps are fully independent services (separate origins/ports) talking over a REST API with httpOnly-cookie JWT auth — the frontend never gets direct database or filesystem access.

## Prerequisites

- **Node.js 20.9+** (Next.js 16 requirement) and npm
- **Docker Desktop** — required to run PostgreSQL and MinIO locally. **This was not installed on the machine this was built on** — install it before continuing past step 3 below.
- An **Anthropic API key** (`ANTHROPIC_API_KEY`) if you want real AI grading of subjective quiz answers. Without it, the "AI Instant Grading" option in the assessment wizard will return a clear error — students can still use "Manual Evaluator Review" in that case, which always works.

## First-time setup

```bash
# 1. Install all workspace dependencies (run from platform/)
npm install

# 2. Start Postgres and MinIO
npm run db:up

# 3. Copy env files and fill in secrets (already done for local dev if you're reading
#    this from the generated repo — apps/api/.env and apps/web/.env.local exist with
#    working defaults for the Docker services above; only ANTHROPIC_API_KEY needs adding)
cp apps/api/.env.example apps/api/.env        # if starting fresh
cp apps/web/.env.example apps/web/.env.local  # if starting fresh

# 4. Generate the Prisma client, run migrations, and seed demo data
npm run prisma:generate
npm run prisma:migrate
npm run prisma:seed

# 5. Run both apps (in separate terminals)
npm run dev:api   # http://localhost:4000  (Swagger docs at /api/docs)
npm run dev:web   # http://localhost:3000
```

## Demo accounts (after seeding)

All seeded accounts share the password `DojoHub2026!`.

| Role | Email |
|---|---|
| Admin | `sarah.chen@dojo.edu` |
| Evaluator | `kenji@dojo.edu`, `tanaka@dojo.edu`, `amanda@dojo.edu` |
| Student | `alex.mercer@dojo.edu`, `sophia.lin@dojo.edu`, `devon.carter@dojo.edu`, `aria.sterling@dojo.edu` |

The seed script recreates the prototype's four course tracks (Hardware, Software, Data Science, Intern Software) with modules, topics, chapter quizzes, and final assessments, plus sample submissions and two issued credentials — so the app demos richly out of the box.

## What changed from the prototype (functional audit summary)

Every fake/simulated behavior identified in the prototype audit was replaced with a real implementation:

- **Auth**: real bcrypt password hashing + JWT access/refresh tokens (httpOnly cookies), server-enforced RBAC. The prototype's client-side role switcher (anyone could flip into Admin/Evaluator) is gone.
- **Leveling**: points-threshold based (a `PointsTransaction` ledger drives `StudentProfile.points`; crossing a `Level.requiredPoints` threshold auto-advances the student) — real, auditable, and consistent, unlike the prototype's two disagreeing rules.
- **Credentials**: real HMAC-SHA256 signed hashes (server secret, recomputable for integrity verification), real scannable QR codes, and a public `/verify/[credentialId]` page — no more `Math.random()` hashes or checkerboard placeholder QR grids.
- **File uploads**: real S3-compatible presigned uploads (MinIO locally) with genuine progress events — not `setInterval`-simulated bars over discarded `File` objects.
- **Video**: real `<video>` playback with server-tracked watch progress, not a `setInterval` counter.
- **Quizzes**: objective answer keys are graded and stored server-side only (never shipped to the client); subjective answers are graded either by a real Claude API call or routed to a real evaluator review queue — the prototype's "AI Grader" was 100% fake keyword matching, and its "Simulate Manual Supervisor Grade" let students grade themselves.
- **Evaluator rubric gating**: the competency checklist genuinely blocks Approve until every item is checked (the prototype's `allCriteriaChecked()` always returned `true`).
- **Notifications**: real persisted notifications pushed live over Socket.IO, not a decorative "Notification Dispatch Terminal" log.
- **Audit log**: real, with an admin-facing viewer (the prototype only ever wrote to it, never displayed it).
- **Previously dead/unbuilt features, now real**: Office Hours booking (student + evaluator sides), the Competency Rubric system (now wired into the evaluator review flow), admin bonus-points granting (real, ledgered, audited), and Saved Courses/Collections.

See the in-code comments and `packages/shared/src/types.ts` for the full data contract between frontend and backend; Swagger docs are live at `http://localhost:4000/api/docs` once the API is running.

## Known scope notes

- **Quiz/assessment authoring UI**: the admin Curriculum Builder supports full track/module/topic/competency CRUD and the publish workflow, but authoring new chapter-quiz/final-assessment *questions* for a brand-new track is currently API-only (via Swagger) rather than having a dedicated admin UI screen — the four seeded tracks already have full quizzes, so this only affects tracks an admin creates from scratch.
- **Cookie auth across origins**: in local dev the access/refresh cookies are scoped to bare `localhost`, which the browser shares across ports. In production the two services run on separate hostnames, which would make the session cookie third-party — Safari/iOS blocks those outright, so sign-in succeeded and every later request arrived unauthenticated. Resolved by proxying `/api/*` through the Next.js server (`apps/web/next.config.ts`), which keeps the cookie first-party on the frontend's own origin. Set `API_PROXY_TARGET` to the API's URL; leave `NEXT_PUBLIC_API_URL` unset so the browser calls the same origin.
