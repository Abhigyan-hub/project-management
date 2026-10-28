# Northlight Project Control

A single-organization project and team workspace built with MongoDB, Express, React, and Node.js. The code is organized as an npm workspace: `frontend/` contains the React app and `backend/` contains the Express API and MongoDB models.

## What the workspace supports

- Organization roles: super admin, admin, team leader, and member.
- Invite-only accounts. The first super admin is created from server environment settings; admins and super admins invite later users.
- Projects assigned to teams, with per-project GitHub, Vercel, and backend links visible to admins and the responsible team leader.
- Task tracking, progress submissions, activity history, and notifications.
- Lifetime credit ledger: completed tasks earn 1/2/3/5 points for low/medium/high/critical priority. Teammates can commend each other once per calendar month with a reason. Credits are limited to 120% of the highest-scoring other teammate; initial scores can start when the team is at zero. Admin corrections are audited.

Credits are supporting evidence for human recognition and appraisal discussions. They do not determine appraisal outcomes automatically.

## Local setup

Requirements: Node.js 20.19 or newer and MongoDB Atlas or a local replica set. Credit cap enforcement uses MongoDB transactions.

1. Copy `.env.example` to `.env` and set `MONGO_URI`, a private `JWT_SECRET` of at least 32 characters, and bootstrap super admin email/password.
2. From the repository root, install both workspace packages with `npm install`.
3. In one terminal run `npm run dev:api`; in another run `npm run dev`.
4. Open `http://localhost:5173`. Sign in with the bootstrap super admin account. Invite users from People; they set their own password using the invitation email.

The app uses a new, empty MongoDB database. Existing Supabase data is not migrated. Do not use demo credentials in production.

## Production deployment

### MongoDB Atlas

Create an Atlas database and a least-privilege database user for the API. Restrict network access to the API host where possible. Use the Atlas connection string as `MONGO_URI`. Atlas runs as a replica set, which the credit ledger uses for atomic cap enforcement.

### Render API

Create a Render web service from this repository with the repository root as its root directory. Use Node as the runtime, set the build command to `npm install`, and the start command to `npm start`. The root npm workspace command starts the API in `backend/`. Configure all server values from `.env.example` in Render's environment settings. Set `NODE_ENV=production`, `MONGO_URI`, `JWT_SECRET`, bootstrap admin values, `APP_BASE_URL` to the Vercel site URL, `WEB_ORIGIN` to that same URL, and email and Cloudinary credentials. Never commit `.env` or production credentials.

The API provides `/api/health` for service checks. Uploaded work screenshots are private Cloudinary assets and require signed URLs.

### Vercel frontend

Import this repository into Vercel with the repository root as its root directory. Set the framework to Vite and use `npm run build`; `vercel.json` points Vercel to `frontend/dist`. Before deploying, edit `vercel.json` and replace the documented Render API host with your actual Render service host. The `/api` rewrite keeps authentication cookies same-origin. Set the same site as `APP_BASE_URL` and `WEB_ORIGIN` in Render.

For local development, run `npm run dev:api` and `npm run dev` from the repository root. Vite in `frontend/` proxies `/api` to `http://localhost:4000`.

## Roles

- **Super admin:** organization-wide access, role administration, project change reviews, and credit corrections.
- **Admin:** manage projects, teams, people, and user access; view organization reporting and correct credits.
- **Team leader:** view assigned team projects, project service links, team tasks, and team credit records.
- **Member:** view assigned work, submit progress, and commend teammates.

New users cannot self-register or elevate their own role. Invitation and password reset emails require `SMTP_URL` in production.

## Important environment values

See `.env.example` for the complete list. Keep all secrets on the API host. The frontend does not need MongoDB, JWT, SMTP, or Cloudinary secrets.

