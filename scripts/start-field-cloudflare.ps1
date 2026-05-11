param(
    [switch]$SkipBuildIfMissing
)

$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$distIndex = Join-Path $repoRoot 'dist\index.html'
$node = (Get-Command node -ErrorAction Stop).Source
$cloudflared = (Get-Command cloudflared -ErrorAction Stop).Source
$cloudflaredConfig = Join-Path $env:USERPROFILE '.cloudflared\unitflip-field.yml'
$logRoot = Join-Path $env:LOCALAPPDATA 'UnitFlip'
$previewOutLog = Join-Path $logRoot 'field-origin.out.log'
$previewErrLog = Join-Path $logRoot 'field-origin.err.log'
$tunnelLog = Join-Path $logRoot 'field-cloudflared.log'

New-Item -ItemType Directory -Force -Path $logRoot | Out-Null

function Test-FieldOrigin {
    try {
        $response = Invoke-WebRequest -Uri 'http://127.0.0.1:3100/' -UseBasicParsing -TimeoutSec 5
        return $response.StatusCode -ge 200 -and $response.StatusCode -lt 300
    } catch {
        return $false
    }
}

function Test-FieldTunnel {
    try {
        $response = Invoke-WebRequest -Uri 'https://field.fugetti.com/' -UseBasicParsing -TimeoutSec 10
        return $response.StatusCode -ge 200 -and $response.StatusCode -lt 300
    } catch {
        return $false
    }
}

if (-not (Test-Path $distIndex)) {
    if ($SkipBuildIfMissing) {
        throw "dist/index.html is missing. Run npm run build before starting the field Cloudflare origin."
    }

    Push-Location $repoRoot
    try {
        npm run build
        if ($LASTEXITCODE -ne 0) {
            throw "npm run build failed with exit code $LASTEXITCODE."
        }
    } finally {
        Pop-Location
    }
}

if (-not (Test-FieldOrigin)) {
    $previewArgs = 'scripts/preview-dist.mjs --host 127.0.0.1 --port 3100'
    Start-Process -FilePath $node -ArgumentList $previewArgs -WorkingDirectory $repoRoot -WindowStyle Hidden `
        -RedirectStandardOutput $previewOutLog -RedirectStandardError $previewErrLog
    Start-Sleep -Seconds 3
}

if (-not (Test-Path $cloudflaredConfig)) {
    throw "cloudflared config not found at $cloudflaredConfig."
}

if (-not (Test-FieldTunnel)) {
    $runningTunnel = Get-CimInstance Win32_Process -Filter "name = 'cloudflared.exe'" |
        Where-Object {
            $commandLine = $_.CommandLine
            if (-not $commandLine) {
                $commandLine = ''
            }
            $commandLine -like '*unitflip-field.yml*'
        }

    if (-not $runningTunnel) {
        $tunnelArgs = "tunnel --config `"$cloudflaredConfig`" --logfile `"$tunnelLog`" --loglevel info run"
        Start-Process -FilePath $cloudflared -ArgumentList $tunnelArgs -WindowStyle Hidden
        Start-Sleep -Seconds 5
    }
}

$originReady = Test-FieldOrigin
$tunnelReady = Test-FieldTunnel

if (-not $originReady -or -not $tunnelReady) {
    throw "Field Cloudflare startup incomplete. originReady=$originReady tunnelReady=$tunnelReady"
}

Write-Host "UnitFlip field Cloudflare path is ready: https://field.fugetti.com/"
