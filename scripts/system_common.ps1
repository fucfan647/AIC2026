Set-StrictMode -Version Latest

$AicSystemRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))

function Read-AicSystemConfig {
    param([Parameter(Mandatory = $true)][string]$ConfigPath)

    $resolvedConfig = (Resolve-Path -LiteralPath $ConfigPath -ErrorAction Stop).Path
    $config = Get-Content -LiteralPath $resolvedConfig -Raw -Encoding UTF8 | ConvertFrom-Json
    foreach ($section in @("runtime", "paths", "features", "backend", "frontend")) {
        if ($null -eq $config.PSObject.Properties[$section]) {
            throw "Missing '$section' section in config: $resolvedConfig"
        }
    }
    return $config
}

function Resolve-AicSystemPath {
    param([Parameter(Mandatory = $true)][string]$Value)

    $expanded = [Environment]::ExpandEnvironmentVariables($Value)
    if ([IO.Path]::IsPathRooted($expanded)) {
        return [IO.Path]::GetFullPath($expanded)
    }
    return [IO.Path]::GetFullPath((Join-Path $AicSystemRoot $expanded))
}

function Test-AicFeatureEnabled {
    param(
        [Parameter(Mandatory = $true)]$Config,
        [Parameter(Mandatory = $true)][string]$Name
    )

    $property = $Config.features.PSObject.Properties[$Name]
    return $null -ne $property -and [bool]$property.Value
}

function Get-AicPythonExecutable {
    param([Parameter(Mandatory = $true)]$Config)

    $python = [string]$Config.runtime.python_executable
    if ([string]::IsNullOrWhiteSpace($python)) {
        throw "runtime.python_executable must not be empty"
    }
    if ([IO.Path]::IsPathRooted($python) -or $python.Contains("/") -or $python.Contains("\")) {
        return Resolve-AicSystemPath -Value $python
    }
    return $python
}
