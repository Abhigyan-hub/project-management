/**
 * Creates the Northlight demo organisation in a Supabase project.
 * Requires the migration in supabase/migrations to be applied first.
 *
 *   npm run seed
 *
 * Reads VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from .env.
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PASSWORD = "password123";

const placeholder =
  !url ||
  !key ||
  url.includes("YOUR_PROJECT") ||
  url.includes("your_project") ||
  key === "your-service-role-key";

if (placeholder) {
  console.error(
    "The .env file still has the example values.\n" +
      "In the Supabase dashboard open Project Settings → API and paste:\n" +
      "  VITE_SUPABASE_URL          Project URL\n" +
      "  VITE_SUPABASE_ANON_KEY     anon public key\n" +
      "  SUPABASE_SERVICE_ROLE_KEY  service_role secret\n" +
      "Then run npm run seed again.",
  );
  process.exit(1);
}

const supabase = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function iso(daysFromNow, hour = 9) {
  const d = new Date();
  d.setHours(hour, 0, 0, 0);
  d.setDate(d.getDate() + daysFromNow);
  return d.toISOString();
}

const TEAMS = {
  platform: "a0000000-0000-4000-8000-000000000001",
  design: "a0000000-0000-4000-8000-000000000002",
};

const PROJECTS = {
  atlas: "b0000000-0000-4000-8000-000000000001",
  horizon: "b0000000-0000-4000-8000-000000000002",
  design: "b0000000-0000-4000-8000-000000000003",
  vertex: "b0000000-0000-4000-8000-000000000004",
  solstice: "b0000000-0000-4000-8000-000000000005",
  tools: "b0000000-0000-4000-8000-000000000006",
};

const TASKS = Object.fromEntries(
  Array.from({ length: 11 }, (_, i) => [
    i + 1,
    `c0000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
  ]),
);

const PEOPLE = [
  { email: "priya.super@northlight.io", full_name: "Priya Sharma", role: "super_admin", job_title: "Head of Delivery", department: "Executive", team: null, active: true, seen: iso(0, 8), created: iso(-200) },
  { email: "marcus.admin@northlight.io", full_name: "Marcus Webb", role: "admin", job_title: "Project Admin", department: "Delivery", team: TEAMS.platform, active: true, seen: iso(0, 7), created: iso(-180) },
  { email: "aisha.admin@northlight.io", full_name: "Aisha Khan", role: "admin", job_title: "Project Admin", department: "Delivery", team: TEAMS.design, active: true, seen: iso(-1, 18), created: iso(-170) },
  { email: "elena.lead@northlight.io", full_name: "Elena Ruiz", role: "team_leader", job_title: "Team Leader", department: "Engineering", team: TEAMS.platform, active: true, seen: iso(0, 9), created: iso(-150) },
  { email: "sam.lead@northlight.io", full_name: "Sam Okafor", role: "team_leader", job_title: "Team Leader", department: "Design", team: TEAMS.design, active: true, seen: iso(-2, 12), created: iso(-140) },
  { email: "noah.member@northlight.io", full_name: "Noah Bennett", role: "member", job_title: "Frontend Engineer", department: "Engineering", team: TEAMS.platform, active: true, seen: iso(0, 10), created: iso(-120) },
  { email: "grace.member@northlight.io", full_name: "Grace Lin", role: "member", job_title: "Backend Engineer", department: "Engineering", team: TEAMS.platform, active: true, seen: iso(-1, 16), created: iso(-110) },
  { email: "diego.member@northlight.io", full_name: "Diego Fernandez", role: "member", job_title: "Product Designer", department: "Design", team: TEAMS.design, active: true, seen: iso(-3, 14), created: iso(-100) },
  { email: "hana.member@northlight.io", full_name: "Hana Suzuki", role: "member", job_title: "QA Engineer", department: "Engineering", team: TEAMS.platform, active: false, seen: iso(-20, 11), created: iso(-90) },
];

async function findUser(email) {
  let page = 1;
  for (;;) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const found = data.users.find((user) => user.email?.toLowerCase() === email);
    if (found) return found;
    if (data.users.length < 200) return null;
    page += 1;
  }
}

async function ensureUser(person) {
  const existing = await findUser(person.email);
  if (existing) return existing.id;
  const { data, error } = await supabase.auth.admin.createUser({
    email: person.email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: person.full_name, portal: "seed" },
  });
  if (error) throw error;
  return data.user.id;
}

function must(result, label) {
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  return result.data;
}

const ids = {};

for (const person of PEOPLE) {
  ids[person.email] = await ensureUser(person);
  console.log(`user  ${person.email}`);
}

const id = (email) => ids[email];

must(
  await supabase.from("teams").upsert(
    [
      { id: TEAMS.platform, name: "Platform Engineering", description: "Core product & infra", leader_id: null },
      { id: TEAMS.design, name: "Design & Experience", description: "Product design and UX", leader_id: null },
    ],
    { onConflict: "id" },
  ),
  "teams",
);

for (const person of PEOPLE) {
  must(
    await supabase
      .from("profiles")
      .update({
        full_name: person.full_name,
        job_title: person.job_title,
        department: person.department,
        team_id: person.team,
        is_active: person.active,
        last_seen_at: person.seen,
        created_at: person.created,
      })
      .eq("id", id(person.email)),
    `profile ${person.email}`,
  );
  must(
    await supabase.from("user_roles").upsert(
      { profile_id: id(person.email), role: person.role },
      { onConflict: "profile_id" },
    ),
    `role ${person.email}`,
  );
}

must(
  await supabase.from("teams").update({ leader_id: id("elena.lead@northlight.io") }).eq("id", TEAMS.platform),
  "platform leader",
);
must(
  await supabase.from("teams").update({ leader_id: id("sam.lead@northlight.io") }).eq("id", TEAMS.design),
  "design leader",
);

must(
  await supabase.from("projects").upsert(
    [
      { id: PROJECTS.atlas, name: "Atlas Billing Migration", description: "Migrate legacy billing to the new ledger service.", client_name: "Internal", category: "Platform", priority: "critical", status: "in_progress", progress: 62, start_date: iso(-60), deadline: iso(10), is_archived: false, created_at: iso(-60) },
      { id: PROJECTS.horizon, name: "Horizon Mobile App", description: "Cross-platform mobile client for field teams.", client_name: "Horizon Logistics", category: "Mobile", priority: "high", status: "in_progress", progress: 38, start_date: iso(-45), deadline: iso(-2), is_archived: false, created_at: iso(-45) },
      { id: PROJECTS.design, name: "Northlight Design System v3", description: "Unify tokens and components across all products.", client_name: "Internal", category: "Design", priority: "medium", status: "under_review", progress: 81, start_date: iso(-90), deadline: iso(5), is_archived: false, created_at: iso(-90) },
      { id: PROJECTS.vertex, name: "Vertex Analytics Dashboard", description: "Client-facing analytics portal with export tooling.", client_name: "Vertex Capital", category: "Web", priority: "high", status: "planning", progress: 12, start_date: iso(-10), deadline: iso(40), is_archived: false, created_at: iso(-10) },
      { id: PROJECTS.solstice, name: "Solstice Onboarding Revamp", description: "Reduce time-to-value for new customer onboarding.", client_name: "Solstice Retail", category: "Web", priority: "medium", status: "completed", progress: 100, start_date: iso(-120), end_date: iso(-5), deadline: iso(-5), is_archived: false, created_at: iso(-120) },
      { id: PROJECTS.tools, name: "Internal Tools Cleanup", description: "Deprecate unused admin scripts and dashboards.", client_name: "Internal", category: "Platform", priority: "low", status: "on_hold", progress: 20, start_date: iso(-30), deadline: null, is_archived: false, created_at: iso(-30) },
    ],
    { onConflict: "id" },
  ),
  "projects",
);

const marcus = id("marcus.admin@northlight.io");
const aisha = id("aisha.admin@northlight.io");
const elena = id("elena.lead@northlight.io");
const sam = id("sam.lead@northlight.io");
const noah = id("noah.member@northlight.io");
const grace = id("grace.member@northlight.io");
const diego = id("diego.member@northlight.io");
const hana = id("hana.member@northlight.io");

must(
  await supabase.from("tasks").upsert(
    [
      { id: TASKS[1], project_id: PROJECTS.atlas, title: "Design new ledger schema", description: "Draft the double-entry ledger schema and migration plan.", assigned_admin_id: marcus, assigned_member_id: grace, team_leader_id: elena, created_by: marcus, priority: "critical", status: "completed", progress: 100, start_date: iso(-58), due_date: iso(-40), completed_at: iso(-39), created_at: iso(-58), updated_at: iso(-39) },
      { id: TASKS[2], project_id: PROJECTS.atlas, title: "Build billing reconciliation job", description: "Nightly job to reconcile old and new ledgers.", assigned_admin_id: marcus, assigned_member_id: grace, team_leader_id: elena, created_by: marcus, priority: "critical", status: "in_progress", progress: 65, start_date: iso(-30), due_date: iso(8), created_at: iso(-30), updated_at: iso(-1) },
      { id: TASKS[3], project_id: PROJECTS.atlas, title: "Cutover runbook review", description: "Team leader to review the production cutover runbook.", assigned_admin_id: marcus, assigned_member_id: null, team_leader_id: elena, created_by: elena, priority: "high", status: "pending_approval", progress: 0, notes: "Requesting sign-off before we lock the cutover date.", due_date: iso(6), created_at: iso(-1), updated_at: iso(-1) },
      { id: TASKS[4], project_id: PROJECTS.horizon, title: "Offline sync for field capture form", description: "Support offline-first data capture with background sync.", assigned_admin_id: aisha, assigned_member_id: noah, team_leader_id: elena, created_by: aisha, priority: "high", status: "in_progress", progress: 45, start_date: iso(-20), due_date: iso(-3), created_at: iso(-20), updated_at: iso(-1) },
      { id: TASKS[5], project_id: PROJECTS.horizon, title: "Push notification integration", assigned_admin_id: aisha, assigned_member_id: hana, team_leader_id: elena, created_by: aisha, priority: "medium", status: "blocked", progress: 30, notes: "Blocked on vendor API credentials.", start_date: iso(-15), due_date: iso(-1), created_at: iso(-15), updated_at: iso(-1) },
      { id: TASKS[6], project_id: PROJECTS.design, title: "Publish v3 color tokens", description: "Finalize and publish the new oklch-based color tokens.", assigned_admin_id: aisha, assigned_member_id: diego, team_leader_id: sam, created_by: aisha, priority: "medium", status: "under_review", progress: 90, start_date: iso(-40), due_date: iso(3), created_at: iso(-40), updated_at: iso(-3) },
      { id: TASKS[7], project_id: PROJECTS.design, title: "Component audit across products", description: "Catalog every button/input variant currently in production.", assigned_admin_id: aisha, assigned_member_id: diego, team_leader_id: sam, created_by: sam, priority: "low", status: "completed", progress: 100, start_date: iso(-70), due_date: iso(-50), completed_at: iso(-48), created_at: iso(-70), updated_at: iso(-48) },
      { id: TASKS[8], project_id: PROJECTS.vertex, title: "Data model for analytics warehouse", description: "Define fact & dimension tables for the client dashboard.", assigned_admin_id: marcus, assigned_member_id: grace, team_leader_id: elena, created_by: marcus, priority: "high", status: "assigned", progress: 5, start_date: iso(-5), due_date: iso(20), created_at: iso(-5), updated_at: iso(-1) },
      { id: TASKS[9], project_id: PROJECTS.vertex, title: "Client-facing chart library spike", description: "Evaluate recharts vs. visx for the export-heavy dashboard.", assigned_admin_id: marcus, assigned_member_id: null, team_leader_id: elena, created_by: noah, priority: "medium", status: "pending_approval", progress: 0, notes: "I can pick this up next sprint if approved.", due_date: iso(15), created_at: iso(-2), updated_at: iso(-2) },
      { id: TASKS[10], project_id: PROJECTS.solstice, title: "Onboarding checklist redesign", description: "Ship the redesigned five-step onboarding checklist.", assigned_admin_id: aisha, assigned_member_id: diego, team_leader_id: sam, created_by: aisha, priority: "medium", status: "completed", progress: 100, start_date: iso(-100), due_date: iso(-10), completed_at: iso(-8), created_at: iso(-100), updated_at: iso(-8) },
      { id: TASKS[11], project_id: PROJECTS.tools, title: "Retire legacy CSV export script", assigned_admin_id: marcus, assigned_member_id: hana, team_leader_id: elena, created_by: marcus, priority: "low", status: "rejected", progress: 0, notes: "Still used by finance — parked for now.", due_date: iso(-25), created_at: iso(-30), updated_at: iso(-25) },
    ],
    { onConflict: "id" },
  ),
  "tasks",
);

must(
  await supabase.from("progress_updates").upsert(
    [
      { id: "d0000000-0000-4000-8000-000000000001", project_id: PROJECTS.atlas, task_id: TASKS[2], author_id: grace, work_title: "Reconciliation job — happy path complete", work_description: "Nightly diff job now runs end-to-end against staging data.", module_name: "Billing / Reconciliation", progress_from: 40, progress_to: 65, status: "in_progress", github_url: "https://github.com/northlight/atlas-billing/pull/128", created_at: iso(-1, 15) },
      { id: "d0000000-0000-4000-8000-000000000002", project_id: PROJECTS.horizon, task_id: TASKS[4], author_id: noah, work_title: "Offline queue draining on reconnect", work_description: "Verified queued form submissions flush once network returns.", module_name: "Field Capture", progress_from: 25, progress_to: 45, status: "in_progress", github_url: "https://github.com/northlight/horizon-app/pull/64", live_url: "https://staging.horizon.northlight.io", created_at: iso(-3, 15) },
      { id: "d0000000-0000-4000-8000-000000000003", project_id: PROJECTS.design, task_id: TASKS[6], author_id: diego, work_title: "v3 tokens ready for review", work_description: "All oklch tokens published to the shared package.", module_name: "Design Tokens", progress_from: 70, progress_to: 90, status: "under_review", github_url: "https://github.com/northlight/design-system/pull/301", live_url: "https://storybook.northlight.io", created_at: iso(-5, 15) },
      { id: "d0000000-0000-4000-8000-000000000004", project_id: PROJECTS.solstice, task_id: TASKS[10], author_id: diego, work_title: "Onboarding checklist shipped", work_description: "Rolled out to 100% of new Solstice customers.", module_name: "Onboarding", progress_from: 95, progress_to: 100, status: "completed", live_url: "https://app.solstice.example.com/onboarding", created_at: iso(-7, 15) },
      { id: "d0000000-0000-4000-8000-000000000005", project_id: PROJECTS.vertex, task_id: null, author_id: marcus, work_title: "Kickoff notes for analytics warehouse", work_description: "Captured requirements from the Vertex Capital kickoff call.", progress_from: 0, progress_to: 12, status: "in_progress", created_at: iso(-9, 15) },
    ],
    { onConflict: "id" },
  ),
  "progress updates",
);

must(
  await supabase.from("notifications").upsert(
    [
      { id: "e0000000-0000-4000-8000-000000000001", profile_id: elena, message: "Marcus Webb requested a task: Cutover runbook review", type: "request", entity_type: "task", entity_id: TASKS[3], read: false, created_at: iso(-1, 10) },
      { id: "e0000000-0000-4000-8000-000000000002", profile_id: elena, message: "Noah Bennett requested a task: Client-facing chart library spike", type: "request", entity_type: "task", entity_id: TASKS[9], read: false, created_at: iso(-2, 14) },
      { id: "e0000000-0000-4000-8000-000000000003", profile_id: grace, message: "New task assigned: Build billing reconciliation job", type: "assignment", entity_type: "task", entity_id: TASKS[2], read: true, created_at: iso(-29, 9) },
    ],
    { onConflict: "id" },
  ),
  "notifications",
);

must(
  await supabase.from("activity_logs").upsert(
    [
      { id: "f0000000-0000-4000-8000-000000000001", actor_id: grace, project_id: PROJECTS.atlas, action: 'updated task "Build billing reconciliation job"', entity_type: "task", entity_id: TASKS[2], metadata: { previous_status: "in_progress", new_status: "in_progress", progress: 65 }, created_at: iso(-1, 15) },
      { id: "f0000000-0000-4000-8000-000000000002", actor_id: elena, project_id: PROJECTS.atlas, action: 'created task "Cutover runbook review"', entity_type: "task", entity_id: TASKS[3], metadata: { new_status: "pending_approval", priority: "high" }, created_at: iso(-1, 10) },
      { id: "f0000000-0000-4000-8000-000000000003", actor_id: diego, project_id: PROJECTS.design, action: 'changed task "Publish v3 color tokens" to under_review', entity_type: "task", entity_id: TASKS[6], metadata: { previous_status: "in_progress", new_status: "under_review", progress: 90 }, created_at: iso(-3, 15) },
    ],
    { onConflict: "id" },
  ),
  "activity",
);

console.log(`\nSeeded 9 accounts. Password for each is ${PASSWORD}.`);
