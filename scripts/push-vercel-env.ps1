param(
  [string]$EnvFile = ".env.vercel.local",
  [string[]]$Environments = @("production", "preview")
)

$ErrorActionPreference = "Stop"

$projectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$envPath = Join-Path $projectRoot $EnvFile

if (-not (Test-Path $envPath)) {
  throw "Missing $EnvFile. Fill in .env.vercel.local first."
}

function Read-EnvFile($path) {
  $values = [ordered]@{}

  Get-Content -Path $path | ForEach-Object {
    $line = $_.Trim()

    if (-not $line -or $line.StartsWith("#")) {
      return
    }

    $parts = $line -split "=", 2
    if ($parts.Count -ne 2) {
      return
    }

    $key = $parts[0].Trim()
    $value = $parts[1].Trim()

    if (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'"))) {
      $value = $value.Substring(1, $value.Length - 2)
    }

    $values[$key] = $value
  }

  return $values
}

$values = Read-EnvFile $envPath
$requiredKeys = @(
  "NEXT_PUBLIC_APP_ENV",
  "DATABASE_URL",
  "FILE_STORAGE_PROVIDER",
  "REQUIRE_PRIVATE_FILE_STORAGE",
  "AWS_REGION",
  "S3_CANDIDATE_FILES_BUCKET",
  "AWS_ACCESS_KEY_ID",
  "AWS_SECRET_ACCESS_KEY",
  "AUTH_PROVIDER",
  "REQUIRE_AUTH",
  "NEXTAUTH_URL",
  "NEXTAUTH_SECRET",
  "AUTH_GOOGLE_ID",
  "AUTH_GOOGLE_SECRET",
  "AUTH_ADMIN_EMAILS",
  "AUTH_ALLOWED_DOMAINS"
)

$missing = @()
foreach ($key in $requiredKeys) {
  if (-not $values.Contains($key) -or [string]::IsNullOrWhiteSpace($values[$key]) -or $values[$key].Contains("PASTE_")) {
    $missing += $key
  }
}

if ($missing.Count -gt 0) {
  Write-Host "Fill in these values in $EnvFile first:" -ForegroundColor Yellow
  $missing | ForEach-Object { Write-Host " - $_" -ForegroundColor Yellow }
  exit 1
}

Set-Location $projectRoot

foreach ($environment in $Environments) {
  Write-Host "Updating Vercel $environment environment variables..." -ForegroundColor Cyan

  foreach ($key in $values.Keys) {
    $value = [string]$values[$key]

    $previousErrorPreference = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
      & "C:\Program Files\nodejs\npx.cmd" vercel env remove $key $environment --yes 2>$null | Out-Null
      $global:LASTEXITCODE = 0
    } finally {
      $ErrorActionPreference = $previousErrorPreference
    }

    $tempFile = New-TemporaryFile
    try {
      Set-Content -Path $tempFile -Value $value -NoNewline
      Get-Content -Path $tempFile | & "C:\Program Files\nodejs\npx.cmd" vercel env add $key $environment | Out-Host
    } finally {
      Remove-Item -Path $tempFile -Force -ErrorAction SilentlyContinue
    }
  }
}

Write-Host "Vercel environment variables updated." -ForegroundColor Green
