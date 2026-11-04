$ErrorActionPreference = 'SilentlyContinue'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

$dataDir = Join-Path $root 'data'
New-Item -ItemType Directory -Force -Path $dataDir | Out-Null
$log = Join-Path $dataDir 'launcher.log'

function Write-Log([string]$message) {
    Add-Content -Path $log -Value ("[{0}] {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $message) -Encoding UTF8
}

Write-Log 'stopping client'

$stopped = $false

# Web: find the process listening on port 3000
$conn = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue
if ($conn) {
    $conn.OwningProcess | Sort-Object -Unique | ForEach-Object {
        Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue
        Write-Log ("stopped web pid " + $_)
        $stopped = $true
    }
}

# Worker: node processes running tsx/worker/index.ts or the npm wrapper
Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue |
    Where-Object {
        $_.CommandLine -match 'worker[/\\]index\.ts' -or
        $_.CommandLine -match 'npm-cli\.js run worker'
    } |
    ForEach-Object {
        Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
        Write-Log ("stopped worker pid " + $_.ProcessId)
        $stopped = $true
    }

Start-Sleep -Seconds 1

if ($stopped) {
    Write-Log 'client stopped'
} else {
    Write-Log 'no running client found'
}
