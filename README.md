# Dojo Hub Certification Platform

A full-stack certification platform for **Dojo Hub (SMC)** — course delivery, evaluator-graded submissions, and cryptographically verifiable certificates with scannable QR verification.

Three roles, one platform:

- **Students** enrol in tracks, work through modules and lesson topics, sit quizzes, and submit work for review
- **Evaluators** grade submissions against competency rubrics and provide feedback
- **Admins** build curriculum, manage users and levels, and oversee platform metrics and audit history

Every issued certificate carries an HMAC-signed hash and a QR code resolving to a public verification page, so a credential can be checked by anyone without an account.

**Live at [learning.dojohubug.com](https://learning.dojohubug.com).**

The platform is also reachable at its original `dojo-hub-web.onrender.com` address, and that
must stay so: a certificate records its verification link at the moment it is issued, so
every certificate issued before the custom domain was added points there. A PDF already in
someone's hands cannot be updated, so switching that address off would silently break those
credentials.

## Tech stack

### Backend

| Technology | Version | Purpose |
|---|---|---|
| **NestJS** | 11 | REST API framework |
| **PostgreSQL** | 16 | Primary database |
| **Prisma** | 6 | ORM, migrations, type-safe queries |
| **Socket.IO** | 4 | Live notifications |
| **MinIO** (S3-compatible) | — | Object storage for videos and documents |
| **Passport / JWT** | — | Auth via httpOnly access + refresh cookies |
| **bcryptjs** | — | Password hashing |
| **class-validator** | — | Request payload validation |
| **Anthropic SDK** | — | AI grading of subjective answers (Claude) |
| **Swagger** | — | API documentation at `/api/docs` |

### Frontend

| Technology | Version | Purpose |
|---|---|---|
| **Next.js** | 16 (App Router) | React framework |
| **React** | 19 | UI library |
| **TypeScript** | 5 | Type safety across both apps |
| **Tailwind CSS** | 4 | Styling |
| **TanStack Query** | 5 | Server state and caching |
| **Socket.IO client** | 4 | Real-time updates |
| **jsPDF + qrcode** | — | Certificate PDF generation with QR verification |
| **lucide-react** | — | Icons |
| **Zustand** | — | Client state |

### Infrastructure

Docker Compose runs PostgreSQL and MinIO locally. A shared `packages/shared` workspace holds the TypeScript enums and DTOs used by both apps, so the API and frontend never drift apart on the data contract.

## Repository layout

```
platform/              The application (npm workspaces monorepo)
  apps/api/            NestJS backend
  apps/web/            Next.js frontend
  packages/shared/     Shared enums + DTO types
  docker-compose.yml   postgres, minio
src/, index.html       Original standalone prototype, kept for reference
```

## Getting started

Full setup instructions, demo accounts, and architecture notes are in **[platform/README.md](platform/README.md)**.

Quick version — from the `platform/` directory:

```bash
npm install
npm run db:up            # start postgres, minio
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
npm run prisma:generate
npm run prisma:migrate
npm run prisma:seed
npm run dev:api          # http://localhost:4000  (docs at /api/docs)
npm run dev:web          # http://localhost:3000
```

**Requirements:** Node.js 20.9+, Docker Desktop.

### Environment variables

Real `.env` files are deliberately excluded from version control. Copy the `.env.example` templates and supply your own values — database URL, JWT secrets, S3 credentials, and an `ANTHROPIC_API_KEY` if you want AI-assisted grading. Manual evaluator review works without it.
