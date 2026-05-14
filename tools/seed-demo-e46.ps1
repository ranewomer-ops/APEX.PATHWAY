# Seeds the demo customer e46_client + BMW E46 330i build (parts, milestones, timeline).
# Requires: Supabase service role key (never commit this key).
#
# Usage (run from project root in PowerShell):
#   $env:SUPABASE_SERVICE_ROLE_KEY = "your-service-role-secret"
#   .\tools\seed-demo-e46.ps1
#
# Optional:
#   .\tools\seed-demo-e46.ps1 -SupabaseUrl "https://xxxx.supabase.co"

param(
  [string]$SupabaseUrl = "https://oaubbwghbpxjbcsdymvp.supabase.co",
  [string]$ServiceRoleKey = $env:SUPABASE_SERVICE_ROLE_KEY
)

$ErrorActionPreference = "Stop"

if (-not $ServiceRoleKey) {
  throw "Set environment variable SUPABASE_SERVICE_ROLE_KEY to your project's service_role secret (Dashboard > Settings > API)."
}

$baseHeaders = @{
  "apikey"          = $ServiceRoleKey
  "Authorization" = "Bearer $ServiceRoleKey"
}

$email = "e46_client@apex-pathway.local"
$username = "e46_client"
$password = "turbo123"

function Get-AuthUserIdByEmail {
  $uri = "$SupabaseUrl/auth/v1/admin/users?per_page=1000"
  $resp = Invoke-RestMethod -Uri $uri -Method "Get" -Headers $baseHeaders -ErrorAction "Stop"
  foreach ($u in $resp.users) {
    if ($u.email -eq $email) {
      return $u.id
    }
  }
  return $null
}

Write-Host "Creating auth user if missing: $email ..."

$userId = Get-AuthUserIdByEmail
if (-not $userId) {
  $createUri = "$SupabaseUrl/auth/v1/admin/users"
  $createBody = @{
    email         = $email
    password      = $password
    email_confirm = $true
    user_metadata = @{ username = $username }
  } | ConvertTo-Json -Compress
  $headers = $baseHeaders.Clone()
  $headers["Content-Type"] = "application/json"
  try {
    $created = Invoke-RestMethod -Uri $createUri -Method "Post" -Headers $headers -Body $createBody -ErrorAction "Stop"
    $userId = $created.id
    Write-Host "Created auth user $userId"
  }
  catch {
    $userId = Get-AuthUserIdByEmail
    if (-not $userId) {
      throw "Failed to create auth user: $($_.Exception.Message)"
    }
    Write-Host "Auth user already existed: $userId"
  }
}
else {
  Write-Host "Auth user already exists: $userId"
}

Write-Host "Upserting public.users row ..."

$usersUri = "$SupabaseUrl/rest/v1/users?on_conflict=id"
$usersHeaders = $baseHeaders.Clone()
$usersHeaders["Content-Type"] = "application/json"
$usersHeaders["Prefer"] = "resolution=merge-duplicates"
$usersBody = @{
  id                 = $userId
  username           = $username
  password_reference = "supabase_auth"
} | ConvertTo-Json -Compress
Invoke-RestMethod -Uri $usersUri -Method "Post" -Headers $usersHeaders -Body $usersBody | Out-Null

$buildName = "E46 Street/Track Turbo"
$encodedBuildName = [uri]::EscapeDataString($buildName)

Write-Host "Removing any previous demo build named '$buildName' for this user ..."
$listUri = "$SupabaseUrl/rest/v1/builds?user_id=eq.$userId&name=eq.$encodedBuildName&select=id"
$listHeaders = $baseHeaders.Clone()
$existing = @(Invoke-RestMethod -Uri $listUri -Method "Get" -Headers $listHeaders -ErrorAction "Stop")
foreach ($row in $existing) {
  if ($row.id) {
    Invoke-RestMethod -Uri "$SupabaseUrl/rest/v1/builds?id=eq.$($row.id)" -Method "Delete" -Headers $listHeaders | Out-Null
  }
}

$planMilestones = @(
  @{ label = "Milestone 1"; title = "Vehicle received"; detail = "Vehicle received and logged into the shop queue." },
  @{ label = "Milestone 2"; title = "Inspection completed"; detail = "Health check, baseline logs, and build scope confirmed." },
  @{ label = "Milestone 3"; title = "Suspension installed"; detail = "Coilovers installed and corner-balanced." },
  @{ label = "Milestone 4"; title = "Turbo parts ordered"; detail = "Turbo hardware and supporting components ordered." }
)

Write-Host "Inserting build ..."

$jsonHeaders = $baseHeaders.Clone()
$jsonHeaders["Content-Type"] = "application/json"
$jsonHeaders["Prefer"] = "return=representation"

$buildBody = @{
  user_id               = $userId
  name                  = $buildName
  car_model             = "BMW E46 330i"
  status                = "active"
  package_name          = "Street / Track"
  stock_hp              = 228
  estimated_hp_low      = 418
  estimated_hp_high     = 422
  estimated_gain_low    = 190
  estimated_gain_high   = 194
  estimated_time_weeks  = "6-8 weeks"
  plan_notes            = "Target ~420 hp with a reliable, daily-drivable turbo path: fueling, cooling, tuning, and validation time included."
  customer_brief        = "Customer wants a reliable daily-drivable turbo setup with aggressive performance."
  plan_milestones       = $planMilestones
}

$buildRows = Invoke-RestMethod -Uri "$SupabaseUrl/rest/v1/builds" -Method "Post" -Headers $jsonHeaders -Body ($buildBody | ConvertTo-Json -Depth 20 -Compress) -ErrorAction "Stop"
$buildId = if ($buildRows -is [System.Array]) { $buildRows[0].id } else { $buildRows.id }
Write-Host "Build id: $buildId"

$parts = @(
  @{ name = "Cold air intake"; category = "Intake"; price = 675; status = "installed" },
  @{ name = "Long tube headers"; category = "Exhaust"; price = 675; status = "installed" },
  @{ name = "Coilovers"; category = "Suspension"; price = 675; status = "installed" },
  @{ name = "Stage 2 clutch"; category = "Drivetrain"; price = 675; status = "installed" },
  @{ name = "Turbo installation"; category = "Forced induction"; price = 1100; status = "planned" },
  @{ name = "Dyno tuning"; category = "Tuning"; price = 1100; status = "planned" },
  @{ name = "Fuel system upgrade"; category = "Fuel system"; price = 1100; status = "planned" }
) | ForEach-Object {
  @{
    build_id = $buildId
    name     = $_.name
    category = $_.category
    price    = $_.price
    status   = $_.status
  }
}

Write-Host "Inserting parts (Supabase triggers will add phase timeline rows) ..."
Invoke-RestMethod -Uri "$SupabaseUrl/rest/v1/parts" -Method "Post" -Headers $jsonHeaders -Body ($parts | ConvertTo-Json -Depth 10 -Compress) | Out-Null

Write-Host "Inserting milestone timeline rows (newest-first in the app uses recent timestamps) ..."
$now = [DateTime]::UtcNow
$milestones = @(
  @{ event_type = "Shop milestone"; message = "Vehicle received."; offsetMin = 10 },
  @{ event_type = "Shop milestone"; message = "Inspection completed."; offsetMin = 11 },
  @{ event_type = "Shop milestone"; message = "Suspension installed."; offsetMin = 12 },
  @{ event_type = "Shop milestone"; message = "Turbo parts ordered."; offsetMin = 13 }
) | ForEach-Object {
  @{
    build_id   = $buildId
    event_type = $_.event_type
    message    = $_.message
    created_at = $now.AddMinutes($_.offsetMin).ToString("o")
  }
}

Invoke-RestMethod -Uri "$SupabaseUrl/rest/v1/timeline_events" -Method "Post" -Headers $jsonHeaders -Body ($milestones | ConvertTo-Json -Depth 10 -Compress) | Out-Null

Write-Host ""
Write-Host "Done. Log in on the site with username '$username' and password '$password' (email in Supabase: $email)."
