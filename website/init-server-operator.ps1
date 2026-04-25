param(
  [string]$Path = ".",
  [switch]$Force
)

$ErrorActionPreference = "Stop"
$rootDir = (Resolve-Path $Path).Path
$soDir = Join-Path $rootDir ".server-operator"
New-Item -ItemType Directory -Path $soDir -Force | Out-Null

function Write-ServerOperatorFile {
  param(
    [Parameter(Mandatory = $true)][string]$FilePath,
    [Parameter(Mandatory = $true)][string]$Content
  )

  if ((Test-Path $FilePath) -and (-not $Force)) {
    Write-Host "skip  $FilePath (exists, use -Force to overwrite)"
    return
  }

  Set-Content -Path $FilePath -Value $Content -NoNewline
  Write-Host "write $FilePath"
}

$deploySerop = @'
[Deploy app]
git pull
docker compose up -d --build

[Restart api]
docker compose restart api

Quick logs = docker compose logs --tail=100 api
'@

$opsSerop = @'
[Health check]
docker compose ps
docker compose logs --tail=80

[Restart all]
docker compose restart
'@

$aiContext = @'
# Server Operator AI Context

This project uses Server Operator shortcuts in:

`.server-operator/*.serop`

## What agents should do

1. Keep reusable deploy and operations commands in `.serop` files.
2. Use section format:

```txt
[Name]
command step 1
command step 2
```

3. Commands inside one section run together with `&&` in Server Operator.
4. One-line shortcuts are allowed:

```txt
Quick logs = docker compose logs --tail=100 api
```
'@

$installContext = @'
# Installation Context

Fill this file with your own install/onboarding steps and environment details.
AI agents should use this as the source of truth for setup docs.
'@

$folderReadme = @'
# .server-operator

This folder stores project-level shortcuts for the Server Operator desktop app.

## How it works

- Put one or more `.serop` files in this folder.
- Open Server Operator -> Deploy tab.
- Select your project and `.serop` file.
- Click **Run** on a shortcut.
'@

Write-ServerOperatorFile -FilePath (Join-Path $soDir "deploy.serop") -Content $deploySerop
Write-ServerOperatorFile -FilePath (Join-Path $soDir "ops.serop") -Content $opsSerop
Write-ServerOperatorFile -FilePath (Join-Path $soDir "AI_CONTEXT.md") -Content $aiContext
Write-ServerOperatorFile -FilePath (Join-Path $soDir "INSTALLATION_CONTEXT.md") -Content $installContext
Write-ServerOperatorFile -FilePath (Join-Path $soDir "README.md") -Content $folderReadme

Write-Host ""
Write-Host "Done. Folder: $soDir"
Write-Host "Tip: run 'npx server-operator-init --interactive --path `"$rootDir`" --force' for questionnaire-based context."
