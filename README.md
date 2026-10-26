# Northlight — React + TypeScript + Supabase

Plain **React 19 + TypeScript + Vite** app, with **React Router** for routing
and **Supabase** (Postgres, Auth, Storage) as the backend.

## What changed from the original

| Original (TanStack Start) | This build |
| --- | --- |
| File-based routing (`src/routes/*.tsx`), SSR shell, `head()` meta | `react-router-dom` `<Routes>` in `src/App.tsx`, plain pages in `src/pages/`, `useDocumentTitle()` hook for `<title>` |
| `@tanstack/react-start` server functions (`*.functions.ts`) | Removed — profile creation is a Postgres trigger; admin promotion is the `claim_admin_access` function |
| Supabase Postgres + Auth + Storage | `supabase/migrations/20261019100000_northlight.sql`, client in `src/lib/supabase.ts` |
| `vite.config.ts` (Lovable/TanStack Start preset, Nitro) | Plain Vite config: `@vitejs/plugin-react` + `@tailwindcss/vite` |

Everything else — the ~35 shadcn/ui components, Tailwind design tokens
(`src/styles.css`), business logic in `lib/workspace.ts` / `lib/analytics.ts`
/ `lib/mutations.ts`, and the page components themselves — kept the exact
same function signatures and prop shapes, so the conversion is a swap of the
data layer, not a rewrite of the UI.

## Scope of this conversion

All 13 routes from the original app are now fully wired to the mock data
layer — every sidebar destination is a real, working page, not a stub:

- **Landing page** (`/`)
- **Team sign in / sign up** (`/auth`)
- **Admin sign in / registration** (`/admin-login`) — any account (admin or
  team member) can sign in here and is routed to the right workspace
- **Dashboard** (`/dashboard`) — KPIs, charts, activity timeline (admin/super admin)
- **Tasks** (`/tasks`) — filter, search, create/edit, approve/reject, delete, CSV/PDF export, quick reassignment, WhatsApp-style tick progress (✓ assigned → ✓✓ in progress → ✓✓ blue completed), and a bulk "toolkit" toolbar (checkbox multi-select → admin confirm / set due date) (admin/super admin/team leader)
- **Projects** (`/projects`) — portfolio table with create/edit/delete (name, description, client, category, priority, start date, deadline) and cascading delete of a project's tasks (admin/super admin)
- **People** (`/people`) — directory with add/edit/deactivate/delete and team assignment (admin/super admin)
- **User management** (`/users`) — change a person's role or active status, or delete their account (admin/super admin)
- **Teams** (`/teams`) — create/edit/delete teams, assign a team leader, add members (admin/super admin)
- **Calendar** (`/calendar`) — task due dates and project deadlines on a day picker (admin/super admin/team leader)
- **Reports** (`/reports`) — org-wide metrics plus CSV/PDF export for projects, tasks, people and activity history (admin/super admin)
- **Activity history** (`/history`) — full audit trail with search and filters, CSV export (admin/super admin/team leader)
- **My team** (`/team`) — a team leader's members, their tasks and pending task-approval requests (team leader)
- **My work** (`/my-work`) — a member's assigned tasks and a "Upload work" flow to submit progress updates with GitHub/live links and screenshots (member)

Every page follows the same pattern established by the original four:
`AuthGate` for role gating, `AppShell` for the page chrome, `@tanstack/react-query`
against `fetchWorkspace()` / `fetchOrganisationData()` for reads, and the
mutation helpers in `src/lib/mutations.ts` (all backed by Supabase)
for writes.

## Getting started

1. Create a Supabase project.
2. In the SQL editor, run `supabase/migrations/20261019100000_northlight.sql`.
3. In Authentication → Providers → Email, turn **off** "Confirm email" so sign-up returns a session immediately.
4. Copy `.env.example` to `.env` and fill in the project URL, anon key, and service role key.
5. Install, seed the demo organisation, and start the app:

```bash
npm install
npm run seed
npm run dev
```

Then open the printed local URL (usually `http://localhost:5173`).

## Demo accounts

`npm run seed` creates nine people across four roles. Password for every
seeded account is **`password123`**.

| Email | Role |
| --- | --- |
| `priya.super@northlight.io` | Super admin |
| `marcus.admin@northlight.io` | Admin |
| `aisha.admin@northlight.io` | Admin |
| `elena.lead@northlight.io` | Team leader |
| `sam.lead@northlight.io` | Team leader |
| `noah.member@northlight.io` | Member |
| `grace.member@northlight.io` | Member |
| `diego.member@northlight.io` | Member |
| `hana.member@northlight.io` | Member (inactive) |

Sign in with **any account** at `/admin-login` — super admin and admin
accounts land on the dashboard, while team leader and member accounts are
automatically recognized and redirected to their own workspace ("My team" /
"My work") instead of being blocked. The `/auth` team portal still works the
same way for team leaders and members.

Self-registering a new account from `/admin-login` ("Create admin ID") grants
admin access immediately — no invite code required.

## Data persistence

Projects, tasks, people, teams, notifications, activity, and progress
updates live in Supabase Postgres. Sign-in uses Supabase Auth. A trigger on
`auth.users` creates a `profiles` row and a `member` role. Accounts created
from the admin portal call `claim_admin_access()`, which promotes that user
to admin. Screenshot uploads go to the private `work-screenshots` bucket.

Row Level Security:

- Anyone signed in can read the organisation directory, projects, and tasks.
- Admins and super admins can create and edit projects, teams, and people.
- Team leaders can create, update, and delete tasks.
- Members can update tasks assigned to them and submit progress updates.
- Notifications are visible only to the recipient.

## Notes

- CSV/PDF export (`src/lib/reports.ts`) stays in the browser.
- Re-running `npm run seed` updates the same demo rows; it does not wipe accounts you created yourself.
