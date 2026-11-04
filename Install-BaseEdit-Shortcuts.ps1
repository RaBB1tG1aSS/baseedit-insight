$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$desktop = [Environment]::GetFolderPath('Desktop')
$programs = [Environment]::GetFolderPath('Programs')
$wscript = Join-Path $env:WINDIR 'System32\wscript.exe'
$icon = Join-Path $root 'assets\baseedit.ico'

if (-not (Test-Path $icon)) { throw "Icon not found: $icon" }

$ws = New-Object -ComObject WScript.Shell

function New-Shortcut {
    param([string]$Path, [string]$Script, [string]$Description)
    $shortcut = $ws.CreateShortcut($Path)
    $shortcut.TargetPath = $wscript
    $shortcut.Arguments = '"' + (Join-Path $root $Script) + '"'
    $shortcut.WorkingDirectory = $root
    $shortcut.IconLocation = $icon + ',0'
    $shortcut.Description = $Description
    $shortcut.Save()
    Write-Host "Created: $Path"
}

New-Shortcut -Path (Join-Path $desktop 'BaseEdit Insight.lnk') `
    -Script 'Start-BaseEdit-Insight.vbs' `
    -Description '启动 BaseEdit Insight（静默后台 + 自动打开浏览器）'

New-Shortcut -Path (Join-Path $desktop 'BaseEdit Insight - Stop.lnk') `
    -Script 'Stop-BaseEdit-Insight.vbs' `
    -Description '停止 BaseEdit Insight 的 Web 与 Worker 进程'

$startMenuDir = Join-Path $programs 'BaseEdit Insight'
New-Item -ItemType Directory -Force -Path $startMenuDir | Out-Null
New-Shortcut -Path (Join-Path $startMenuDir 'BaseEdit Insight.lnk') `
    -Script 'Start-BaseEdit-Insight.vbs' `
    -Description '启动 BaseEdit Insight'
New-Shortcut -Path (Join-Path $startMenuDir 'Stop.lnk') `
    -Script 'Stop-BaseEdit-Insight.vbs' `
    -Description '停止 BaseEdit Insight'

Write-Host ''
Write-Host 'Shortcuts installed on Desktop and Start Menu.'
