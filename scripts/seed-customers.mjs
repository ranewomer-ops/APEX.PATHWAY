/**
 * Seed demo customer + E46 build via Supabase Admin API + PostgREST.
 *
 * Usage (Node 20+):
 *   set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in environment, then:
 *   node scripts/seed-customers.mjs
 *
 * Or with a local env file (not committed):
 *   node --env-file=.env.seed scripts/seed-customers.mjs
 */

const SUPABASE_URL = process.env.SUPABASE_URL?.replace(/\/$/, "");
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment.");
  process.exit(1);
}

const headers = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  "Content-Type": "application/json"
};

const email = "e46_client@apex-pathway.local";
const username = "e46_client";
const password = "turbo123";

async function getAuthUserId() {
  const list = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?per_page=1000`, { headers });
  const body = await list.json();
  const u = body.users?.find((x) => x.email === email);
  return u?.id || null;
}

async function createAuthUser() {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      email,
      password,
      email_confirm: true,
      user_metadata: { username }
    })
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`create user failed: ${res.status} ${t}`);
  }
  const j = await res.json();
  return j.id;
}

async function upsertAppUser(userId) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/users?on_conflict=id`, {
    method: "POST",
    headers: { ...headers, Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify({ id: userId, username, password_reference: "supabase_auth" })
  });
  if (!res.ok) {
    throw new Error(`users upsert failed: ${await res.text()}`);
  }
}

async function deleteOldBuild(userId) {
  const q = `${SUPABASE_URL}/rest/v1/builds?user_id=eq.${userId}&name=eq.${encodeURIComponent("E46 Street/Track Turbo")}&select=id`;
  const res = await fetch(q, { headers });
  const rows = await res.json();
  for (const row of Array.isArray(rows) ? rows : []) {
    await fetch(`${SUPABASE_URL}/rest/v1/builds?id=eq.${row.id}`, { method: "DELETE", headers });
  }
}

async function insertBuild(userId) {
  const planMilestones = [
    { label: "Milestone 1", title: "Vehicle received", detail: "Vehicle received and logged into the shop queue." },
    { label: "Milestone 2", title: "Inspection completed", detail: "Health check, baseline logs, and build scope confirmed." },
    { label: "Milestone 3", title: "Suspension installed", detail: "Coilovers installed and corner-balanced." },
    { label: "Milestone 4", title: "Turbo parts ordered", detail: "Turbo hardware and supporting components ordered." }
  ];

  const buildBody = {
    user_id: userId,
    name: "E46 Street/Track Turbo",
    car_model: "BMW E46 330i",
    status: "active",
    customer_brief: "Customer wants a reliable daily-drivable turbo setup with aggressive performance.",
    package_name: "Street / Track",
    stock_hp: 228,
    estimated_hp_low: 418,
    estimated_hp_high: 422,
    estimated_gain_low: 190,
    estimated_gain_high: 194,
    estimated_time_weeks: "6-8 weeks",
    plan_notes:
      "Target ~420 hp with a reliable, daily-drivable turbo path: fueling, cooling, tuning, and validation time included.",
    plan_milestones: planMilestones
  };

  const res = await fetch(`${SUPABASE_URL}/rest/v1/builds`, {
    method: "POST",
    headers: { ...headers, Prefer: "return=representation" },
    body: JSON.stringify(buildBody)
  });
  if (!res.ok) {
    throw new Error(`build insert failed: ${await res.text()}`);
  }
  const data = await res.json();
  return Array.isArray(data) ? data[0].id : data.id;
}

async function insertParts(buildId) {
  const parts = [
    { name: "Cold air intake", category: "Intake", price: 675, status: "installed" },
    { name: "Long tube headers", category: "Exhaust", price: 675, status: "installed" },
    { name: "Coilovers", category: "Suspension", price: 675, status: "installed" },
    { name: "Stage 2 clutch", category: "Drivetrain", price: 675, status: "installed" },
    { name: "Turbo installation", category: "Forced induction", price: 1100, status: "planned" },
    { name: "Dyno tuning", category: "Tuning", price: 1100, status: "planned" },
    { name: "Fuel system upgrade", category: "Fuel system", price: 1100, status: "planned" }
  ].map((p) => ({ ...p, build_id: buildId }));

  const res = await fetch(`${SUPABASE_URL}/rest/v1/parts`, {
    method: "POST",
    headers: { ...headers, Prefer: "return=minimal" },
    body: JSON.stringify(parts)
  });
  if (!res.ok) {
    throw new Error(`parts insert failed: ${await res.text()}`);
  }
}

async function insertMilestones(buildId) {
  const now = Date.now();
  const rows = [10, 11, 12, 13].map((min, i) => ({
    build_id: buildId,
    event_type: "Shop milestone",
    message: ["Vehicle received.", "Inspection completed.", "Suspension installed.", "Turbo parts ordered."][i],
    created_at: new Date(now + min * 60 * 1000).toISOString()
  }));

  const res = await fetch(`${SUPABASE_URL}/rest/v1/timeline_events`, {
    method: "POST",
    headers: { ...headers, Prefer: "return=minimal" },
    body: JSON.stringify(rows)
  });
  if (!res.ok) {
    throw new Error(`timeline insert failed: ${await res.text()}`);
  }
}

async function main() {
  let userId = await getAuthUserId();
  if (!userId) {
    console.log("Creating auth user...");
    userId = await createAuthUser();
  } else {
    console.log("Auth user already exists.");
  }

  await upsertAppUser(userId);
  await deleteOldBuild(userId);
  const buildId = await insertBuild(userId);
  await insertParts(buildId);
  await insertMilestones(buildId);

  console.log("Seed complete. Login with username:", username, "password:", password);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
