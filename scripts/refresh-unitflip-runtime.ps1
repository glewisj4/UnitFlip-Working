param(
    [switch]$SkipLint,
    [switch]$SkipBuild,
    [switch]$SkipHealthCheck
)

$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

$composeFile = Join-Path $repoRoot 'compose.prod.yml'
$envFile = Join-Path $repoRoot '.env.production.local'
$healthUrl = 'http://localhost:3001/healthz'

if (-not (Test-Path $composeFile)) {
    throw "compose.prod.yml not found at $composeFile"
}

function Write-Step([string]$Message) {
    Write-Host ""
    Write-Host "==> $Message" -ForegroundColor Cyan
}

function Import-SimpleEnvFile([string]$Path) {
    Get-Content -Path $Path | ForEach-Object {
        $line = $_.Trim()
        if (-not $line -or $line.StartsWith('#')) {
            return
        }

        $separatorIndex = $line.IndexOf('=')
        if ($separatorIndex -lt 1) {
            return
        }

        $name = $line.Substring(0, $separatorIndex).Trim()
        $value = $line.Substring($separatorIndex + 1).Trim()

        if (
            ($value.StartsWith('"') -and $value.EndsWith('"')) -or
            ($value.StartsWith("'") -and $value.EndsWith("'"))
        ) {
            $value = $value.Substring(1, $value.Length - 2)
        }

        Set-Item -Path "Env:$name" -Value $value
    }
}

function Assert-CommandAvailable([string]$CommandName) {
    if (-not (Get-Command $CommandName -ErrorAction SilentlyContinue)) {
        throw "$CommandName is not available in PATH."
    }
}

function Invoke-CheckedCommand([string]$Description, [scriptblock]$Command) {
    & $Command
    if ($LASTEXITCODE -ne 0) {
        throw "$Description failed with exit code $LASTEXITCODE."
    }
}

function Wait-ForHealth([string]$Url, [int]$Attempts = 20, [int]$DelaySeconds = 3) {
    for ($attempt = 1; $attempt -le $Attempts; $attempt++) {
        try {
            $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 10
            if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 300) {
                Write-Host "Health check passed at $Url" -ForegroundColor Green
                return
            }
        } catch {
            if ($attempt -eq $Attempts) {
                throw "Health check failed at $Url after $Attempts attempts. $($_.Exception.Message)"
            }
        }

        Start-Sleep -Seconds $DelaySeconds
    }
}

Assert-CommandAvailable 'docker'

if (Test-Path $envFile) {
    Write-Step "Loading environment from .env.production.local"
    Import-SimpleEnvFile -Path $envFile
}

$requiredEnvVars = @(
    'VITE_SUPABASE_URL',
    'VITE_SUPABASE_ANON_KEY'
)

$missingEnvVars = $requiredEnvVars | Where-Object { -not (Get-Item -Path ("Env:" + $_) -ErrorAction SilentlyContinue) }
if ($missingEnvVars.Count -gt 0) {
    throw "Missing required environment variables: $($missingEnvVars -join ', '). Set them in the shell or in .env.production.local."
}

if (-not $env:VITE_USE_EDGE_FUNCTIONS) {
    $env:VITE_USE_EDGE_FUNCTIONS = 'true'
}

if (-not $SkipLint) {
    Write-Step "Running TypeScript validation"
    Invoke-CheckedCommand "TypeScript validation" { npm run lint }
}

if (-not $SkipBuild) {
    Write-Step "Running production build"
    Invoke-CheckedCommand "Production build" { npm run build }
}

Write-Step "Rebuilding and restarting UnitFlip prod runtime"
Invoke-CheckedCommand "Docker compose rebuild" { docker compose -f $composeFile up --build -d }

if (-not $SkipHealthCheck) {
    Write-Step "Waiting for runtime health"
    Wait-ForHealth -Url $healthUrl
}

Write-Host ""
Write-Host "UnitFlip runtime refresh complete." -ForegroundColor Green
Write-Host "App:     http://localhost:3001" -ForegroundColor Green
Write-Host "Health:  $healthUrl" -ForegroundColor Green
