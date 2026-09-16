param(
    [ValidateSet("All", "Backend", "Frontend")]
    [string]$Scope = "All",
    [string]$ConfigPath = (Join-Path $PSScriptRoot "system.config.json")
)

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "scripts\system_common.ps1")

$config = Read-AicSystemConfig -ConfigPath $ConfigPath
$errors = [Collections.Generic.List[string]]::new()
$warnings = [Collections.Generic.List[string]]::new()

function Test-ConfiguredPath {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][ValidateSet("File", "Directory")][string]$Kind,
        [bool]$Required = $true
    )

    $property = $config.paths.PSObject.Properties[$Name]
    if ($null -eq $property -or [string]::IsNullOrWhiteSpace([string]$property.Value)) {
        $message = "paths.$Name is not configured"
        if ($Required) { $errors.Add($message) } else { $warnings.Add($message) }
        Write-Host "[MISSING] $message" -ForegroundColor Red
        return
    }

    $path = Resolve-AicSystemPath -Value ([string]$property.Value)
    $exists = if ($Kind -eq "File") {
        Test-Path -LiteralPath $path -PathType Leaf
    } else {
        Test-Path -LiteralPath $path -PathType Container
    }
    if ($exists) {
        Write-Host "[OK]      paths.$Name -> $path" -ForegroundColor Green
        return
    }

    $message = "paths.$Name not found: $path"
    if ($Required) {
        $errors.Add($message)
        Write-Host "[MISSING] $message" -ForegroundColor Red
    } else {
        $warnings.Add($message)
        Write-Host "[OPTIONAL] $message" -ForegroundColor Yellow
    }
}

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host " AIC2026 system check: $Scope" -ForegroundColor Cyan
Write-Host " Config: $((Resolve-Path -LiteralPath $ConfigPath).Path)" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan

$python = Get-AicPythonExecutable -Config $config
$pythonCommand = Get-Command $python -ErrorAction SilentlyContinue
if ($null -eq $pythonCommand) {
    $errors.Add("Python executable not found: $python")
    Write-Host "[MISSING] Python executable: $python" -ForegroundColor Red
} else {
    $version = (& $python --version 2>&1 | Out-String).Trim()
    Write-Host "[OK]      $version ($($pythonCommand.Source))" -ForegroundColor Green
}

if ($Scope -in @("All", "Backend")) {
    Test-ConfiguredPath -Name "keyframes_root" -Kind "Directory"
    Test-ConfiguredPath -Name "thumbnails_root" -Kind "Directory"
    Test-ConfiguredPath -Name "records_db" -Kind "File"
    Test-ConfiguredPath -Name "video_ranges" -Kind "File"
    Test-ConfiguredPath -Name "index_config" -Kind "File"
    Test-ConfiguredPath -Name "metaclip_embeddings" -Kind "File"
    if (-not [string]::IsNullOrWhiteSpace([string]$config.paths.metaclip_model_dir)) {
        Test-ConfiguredPath -Name "metaclip_model_dir" -Kind "Directory"
    }

    if (Test-AicFeatureEnabled -Config $config -Name "beit3") {
        Test-ConfiguredPath -Name "beit3_embeddings" -Kind "File"
        Test-ConfiguredPath -Name "beit3_checkpoint" -Kind "File"
        Test-ConfiguredPath -Name "beit3_sentencepiece" -Kind "File"
        Test-ConfiguredPath -Name "beit3_runtime_python" -Kind "Directory"
    } else {
        Write-Host "[DISABLED] BEiT-3" -ForegroundColor DarkGray
    }

    if (Test-AicFeatureEnabled -Config $config -Name "ppocr") {
        Test-ConfiguredPath -Name "ppocr_index" -Kind "File"
    } else {
        Write-Host "[DISABLED] PP-OCR" -ForegroundColor DarkGray
    }

    if (Test-AicFeatureEnabled -Config $config -Name "monkey_ocr") {
        Test-ConfiguredPath -Name "monkey_ocr_index" -Kind "File"
    } else {
        Write-Host "[DISABLED] MonkeyOCR" -ForegroundColor DarkGray
    }

    if (Test-AicFeatureEnabled -Config $config -Name "asr") {
        Test-ConfiguredPath -Name "asr_index" -Kind "File"
    } else {
        Write-Host "[DISABLED] ASR" -ForegroundColor DarkGray
    }

    Test-ConfiguredPath -Name "excluded_rows" -Kind "File" -Required $false
    if ([string]::IsNullOrWhiteSpace([string]$config.backend.model_name)) {
        $errors.Add("backend.model_name must not be empty")
        Write-Host "[MISSING] backend.model_name" -ForegroundColor Red
    } else {
        Write-Host "[OK]      MetaCLIP model id -> $($config.backend.model_name)" -ForegroundColor Green
    }
}

if ($Scope -in @("All", "Frontend")) {
    foreach ($relativePath in @("frontend/index.html", "frontend/app.js", "frontend/styles.css", "frontend/serve_frontend.py")) {
        $path = Resolve-AicSystemPath -Value $relativePath
        if (Test-Path -LiteralPath $path -PathType Leaf) {
            Write-Host "[OK]      $relativePath" -ForegroundColor Green
        } else {
            $errors.Add("Frontend source not found: $path")
            Write-Host "[MISSING] Frontend source not found: $path" -ForegroundColor Red
        }
    }
    Test-ConfiguredPath -Name "records_db" -Kind "File" -Required $false
    Test-ConfiguredPath -Name "keyframes_root" -Kind "Directory" -Required $false
    Test-ConfiguredPath -Name "thumbnails_root" -Kind "Directory" -Required $false
    Test-ConfiguredPath -Name "deleted_manifest" -Kind "File" -Required $false
    Test-ConfiguredPath -Name "query_root" -Kind "Directory" -Required $false
}

if ($null -ne $pythonCommand) {
    $modules = [Collections.Generic.List[string]]::new()
    if ($Scope -in @("All", "Backend")) {
        foreach ($module in @("numpy", "torch", "transformers")) { $modules.Add($module) }
    }
    if ($Scope -in @("All", "Frontend")) {
        foreach ($module in @("fastapi", "uvicorn", "httpx")) { $modules.Add($module) }
    }
    $moduleLiterals = ($modules | ForEach-Object { "'$_'" }) -join ","
    $moduleCheck = "import importlib.util,sys; missing=[m for m in [$moduleLiterals] if importlib.util.find_spec(m) is None]; print(','.join(missing)); sys.exit(1 if missing else 0)"
    $missingModules = (& $python -c $moduleCheck 2>&1 | Out-String).Trim()
    $missingModuleNames = @($missingModules -split "," | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
    if ($LASTEXITCODE -ne 0) {
        $errors.Add("Missing Python modules: $missingModules")
        Write-Host "[MISSING] Python modules: $missingModules" -ForegroundColor Red
    } else {
        Write-Host "[OK]      Python modules: $($modules -join ', ')" -ForegroundColor Green
    }

    if (
        $Scope -in @("All", "Backend") -and
        [string]$config.backend.device -like "cuda*" -and
        $missingModuleNames -notcontains "torch"
    ) {
        $cudaStatus = (& $python -c "import torch,sys; print(torch.cuda.get_device_name(0) if torch.cuda.is_available() else 'CUDA unavailable'); sys.exit(0 if torch.cuda.is_available() else 1)" 2>&1 | Out-String).Trim()
        if ($LASTEXITCODE -ne 0) {
            $errors.Add($cudaStatus)
            Write-Host "[MISSING] $cudaStatus" -ForegroundColor Red
        } else {
            Write-Host "[OK]      CUDA -> $cudaStatus" -ForegroundColor Green
        }
    }
}

Write-Host "------------------------------------------------------------"
Write-Host "Errors: $($errors.Count) | Warnings: $($warnings.Count)"
if ($errors.Count -gt 0) {
    throw "System check failed. Fix system.config.json or restore the missing assets."
}
Write-Host "System check passed." -ForegroundColor Green
