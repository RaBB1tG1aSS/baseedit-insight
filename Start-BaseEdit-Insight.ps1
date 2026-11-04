param([switch]$NoBrowser)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

$dataDir = Join-Path $root 'data'
New-Item -ItemType Directory -Force -Path $dataDir | Out-Null
$log = Join-Path $dataDir 'launcher.log'

function Write-Log([string]$message) {
    Add-Content -Path $log -Value ("[{0}] {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $message) -Encoding UTF8
}

function Get-Health {
    try {
        return Invoke-RestMethod -Uri 'http://127.0.0.1:3000/api/health' -TimeoutSec 2 -ErrorAction Stop
    } catch {
        return $null
    }
}

function Test-WorkerProcess {
    try {
        $procs = @(Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction Stop |
            Where-Object { $_.CommandLine -match 'worker[/\\]index\.ts' })
        return $procs.Count -gt 0
    } catch {
        return $false
    }
}

function Start-Worker {
    Start-Process -FilePath 'cmd.exe' `
        -ArgumentList '/c "npm run worker >> data\worker.log 2>&1"' `
        -WorkingDirectory $root -WindowStyle Hidden
    Write-Log 'worker started (hidden)'
}

function Open-Client {
    if (-not $NoBrowser) {
        Start-Process 'http://127.0.0.1:3000' | Out-Null
    }
}

try {
    $health = Get-Health
    if ($health) {
        Write-Log 'web already running'
        if (-not (Test-WorkerProcess)) { Start-Worker }
        Open-Client
        exit 0
    }

    if (-not (Test-Path (Join-Path $root '.next\BUILD_ID'))) {
        Write-Log 'building client'
        $build = Start-Process -FilePath 'cmd.exe' `
            -ArgumentList '/c "npm run build >> data\build.log 2>&1"' `
            -WorkingDirectory $root -WindowStyle Hidden -Wait -PassThru
        if ($build.ExitCode -ne 0 -or -not (Test-Path (Join-Path $root '.next\BUILD_ID'))) {
            throw 'Build failed. See data\build.log'
        }
    }

    Write-Log 'starting web (hidden)'
    Start-Process -FilePath 'cmd.exe' `
        -ArgumentList '/c "npm start >> data\prod-server.log 2>&1"' `
        -WorkingDirectory $root -WindowStyle Hidden
    if (-not (Test-WorkerProcess)) { Start-Worker }

    for ($i = 0; $i -lt 60; $i++) {
        Start-Sleep -Seconds 2
        $health = Get-Health
        if ($health) {
            Write-Log ('ready; worker online = ' + $health.worker.online)
            Open-Client
            exit 0
        }
    }
    throw 'Server did not become ready within 120 seconds. See data\prod-server.log'
} catch {
    Write-Log ('ERROR: ' + $_.Exception.Message)
    if (-not $NoBrowser) {
        try {
            Add-Type -AssemblyName PresentationFramework
            [System.Windows.MessageBox]::Show($_.Exception.Message, 'BaseEdit Insight') | Out-Null
        } catch {
            # no GUI available
        }
    }
    exit 1
}
