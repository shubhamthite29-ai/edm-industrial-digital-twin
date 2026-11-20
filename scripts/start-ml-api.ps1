Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

$pythonCommand = Get-Command python -ErrorAction SilentlyContinue
$python = $null
if ($pythonCommand) {
  $python = $pythonCommand.Source
}
if (-not $python) {
  $bundled = Join-Path $env:USERPROFILE ".cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe"
  if (Test-Path $bundled) {
    $python = $bundled
  }
}

if (-not $python) {
  throw "Python was not found. Install Python or update scripts/start-ml-api.ps1 with your Python executable path."
}

& $python -c "import importlib.util, sys; sys.exit(0 if importlib.util.find_spec('fastapi') and importlib.util.find_spec('uvicorn') else 1)"
if ($LASTEXITCODE -ne 0) {
  Write-Warning "FastAPI/Uvicorn are not installed for $python. Starting the built-in fallback API instead."
  Write-Warning "For the production FastAPI runtime, run: $python -m pip install -r ml/requirements.txt"
  & $python -m ml.src.simple_api
  exit $LASTEXITCODE
}

& $python -m uvicorn ml.src.api:app --reload --host 127.0.0.1 --port 8000
