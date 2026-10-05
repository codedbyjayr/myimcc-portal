# Runs the full migration chain and every test script against a throwaway
# Postgres in Docker, from a clean database each time.
#
#   .\database\run-local-tests.ps1
#
# The point is that none of this has ever been run before: until now the
# migrations and test scripts had only passed a static structural check, which
# cannot tell you that a policy is valid SQL. Two real defects turned up the
# first time these were executed (a NEW reference inside an RLS policy, and a
# policy on a table no migration creates), so treat a green run here as the
# first evidence, not as proof.
#
# Nothing here touches a real database. The container is disposable.

param(
  [string]$Container = 'imcc-pg',
  [string]$Image     = 'pgvector/pgvector:pg16',
  [string]$Db        = 'imcc',
  [switch]$KeepContainer
)

$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path

function Invoke-Psql {
  param([string]$File, [string]$Database = $Db)

  $sql = Get-Content -LiteralPath $File -Raw

  # psql writes NOTICEs to stderr, and PowerShell promotes a native command's
  # stderr to a terminating error when ErrorActionPreference is Stop. Relaxed
  # for the duration so a harmless NOTICE does not abort the run.
  $prev = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    $out = $sql | docker exec -i $Container psql -U postgres -d $Database -v ON_ERROR_STOP=1 -q 2>&1 | Out-String
    # ON_ERROR_STOP=1 makes psql exit non-zero on the first error, and docker
    # exec propagates that. This is the authoritative pass/fail signal.
    #
    # It has to be. An earlier version of this script decided success by
    # looking for the string ERROR in the output, while also filtering out
    # lines beginning with "docker :" -- which is precisely the prefix
    # PowerShell puts on stderr, so the filter deleted the error line itself
    # and every failing script reported as passing.
    $code = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $prev
  }

  # Keep the message, drop only PowerShell's own wrapper lines.
  $lines = $out -split "`r?`n" | ForEach-Object {
    $_ -replace '^\s*docker\s*:\s*', ''
  } | Where-Object {
    $_ -and $_ -notmatch '^\s*NOTICE' `
       -and $_ -notmatch 'CategoryInfo' `
       -and $_ -notmatch 'FullyQualifiedErrorId' `
       -and $_ -notmatch '^At line:' `
       -and $_ -notmatch '^\s*\+'
  }

  return [pscustomobject]@{
    ExitCode = $code
    Lines    = @($lines)
  }
}

# ── container ──────────────────────────────────────────────────────────
if (-not (docker ps -a --format '{{.Names}}' | Select-String -Quiet -SimpleMatch $Container)) {
  Write-Host "starting $Container from $Image"
  docker run -d --name $Container -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=$Db -p 5432:5432 $Image | Out-Null
} elseif (-not (docker ps --format '{{.Names}}' | Select-String -Quiet -SimpleMatch $Container)) {
  docker start $Container | Out-Null
}

$deadline = (Get-Date).AddSeconds(90)
while ((Get-Date) -lt $deadline) {
  if ((docker exec $Container pg_isready -U postgres 2>&1 | Out-String) -match 'accepting') { break }
  Start-Sleep -Seconds 3
}
Write-Host "container ready"

# The database is dropped and recreated rather than trusted from POSTGRES_DB,
# which only applies when the container is first created. This also means a
# second run starts clean, so a test that depends on an empty table cannot pass
# or fail because of leftover state, and applying the migrations twice in a row
# is what proves they are idempotent.
docker exec $Container psql -U postgres -d postgres -q -c "DROP DATABASE IF EXISTS $Db;" -c "CREATE DATABASE $Db;" 2>&1 |
  ForEach-Object { if ($_ -notmatch 'CategoryInfo|FullyQualified|At line|^\s*\+|^docker\s*:') { $_ } } | Out-Null

# ── schema migrations, in the order README documents ───────────────────
$schema = @(
  'test-harness-setup.sql',
  'supabase-schema.sql',
  'supabase-schema-v2.sql',
  'supabase-schema-v3-rag.sql',
  'supabase-schema-v4-evaluations.sql',
  'security-hardening-phase0a.sql',
  'security-hardening-phase0b.sql',
  'timetable-integrity.sql',
  'messaging-qa.sql',
  'appointments.sql',
  'faq-content-corrections.sql',
  'mfa-enforcement.sql'
)

Write-Host ''
Write-Host '=== migrations ==='
$failed = @()
foreach ($f in $schema) {
  $r = Invoke-Psql -File (Join-Path $here $f)
  if ($r.ExitCode -ne 0) {
    $failed += $f
    Write-Host ("  FAIL  {0}  (exit {1})" -f $f, $r.ExitCode) -ForegroundColor Red
    $r.Lines | Select-Object -First 4 | ForEach-Object { Write-Host ("        {0}" -f $_.Trim()) }
  } else {
    Write-Host ("  ok    {0}" -f $f)
  }
}

if ($failed) {
  Write-Host ''
  Write-Host ("migrations failed: {0}" -f ($failed -join ', ')) -ForegroundColor Red
  Write-Host 'tests are not meaningful until these apply, so stopping here.'
  if (-not $KeepContainer) { }
  exit 1
}

# ── test scripts ───────────────────────────────────────────────────────
# Each rolls itself back, so they run in sequence against the same database.
$tests = @(
  'test-security-hardening-phase0a.sql',
  'test-security-hardening-phase0b.sql',
  'test-timetable-integrity.sql',
  'test-appointments-and-messaging.sql',
  'test-mfa-enforcement.sql'
)

Write-Host ''
Write-Host '=== tests ==='
$testFailed = @()
foreach ($f in $tests) {
  $r = Invoke-Psql -File (Join-Path $here $f)
  if ($r.ExitCode -ne 0) {
    $testFailed += $f
    Write-Host ("  FAIL  {0}  (exit {1})" -f $f, $r.ExitCode) -ForegroundColor Red
    $r.Lines | Select-Object -First 6 | ForEach-Object { Write-Host ("        {0}" -f $_.Trim()) }
  } else {
    Write-Host ("  ok    {0}" -f $f) -ForegroundColor Green
  }
}

Write-Host ''
if ($testFailed) {
  Write-Host ("failing: {0}" -f ($testFailed -join ', ')) -ForegroundColor Red
  exit 1
}
Write-Host 'all migrations applied and all test scripts passed' -ForegroundColor Green
