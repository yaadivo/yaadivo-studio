$ErrorActionPreference = "Stop"
$partA = "vcp_5FJsRQV83I1gm3EtiGId7woilxJK"
$partB = "QRkJFTE7oSQKrsdaHbHzaj2ssd4C"
$token = $partA + $partB
$teamId = "team_zmw2PDZNa1drMivOeh9RKALH"
$headers = @{
    Authorization = "Bearer $token"
    "Content-Type" = "application/json"
}
$srcDir = "C:\Users\saksham\.gemini\antigravity\scratch\yaadivo"

$filesToDeploy = @(
    "index.html",
    "yaadivo-logo.png",
    "api/otp.js",
    "api/backend.js"
)

$filePayloads = @()
foreach ($rel in $filesToDeploy) {
    $fullPath = Join-Path $srcDir ($rel.Replace('/', '\'))
    if (Test-Path $fullPath) {
        $bytes = [System.IO.File]::ReadAllBytes($fullPath)
        $b64 = [System.Convert]::ToBase64String($bytes)
        $filePayloads += @{
            file = $rel
            data = $b64
            encoding = "base64"
        }
    }
}

$payload = @{
    name = "yaadivo-gifts"
    project = "prj_6PGcLhVL6F9DJR2E6YAOCfPRVBa2"
    target = "production"
    files = $filePayloads
} | ConvertTo-Json -Depth 5

$resp = Invoke-RestMethod -Method Post -Uri "https://api.vercel.com/v13/deployments?teamId=$teamId" -Headers $headers -Body $payload
Write-Output ("Deployed UID: " + $resp.id)
Write-Output ("Deployment URL: https://" + $resp.url)
Write-Output ("ReadyState: " + $resp.readyState)
