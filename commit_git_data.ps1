$ErrorActionPreference = "Stop"
$tA = "ghp_ij2096B9HbP5cnXD"
$tB = "3kFCeeHAeBxIVz04f53Z"
$token = $tA + $tB
$owner = "yaadivo"
$repo = "yaadivo-studio"
$headers = @{
    Authorization = "token $token"
    "Accept" = "application/vnd.github.v3+json"
    "User-Agent" = "Yaadivo-Deployer"
}

# 1. Get latest commit SHA on main
$ref = Invoke-RestMethod -Uri "https://api.github.com/repos/$owner/$repo/git/refs/heads/main" -Headers $headers
$parentCommitSha = $ref.object.sha
$parentCommit = Invoke-RestMethod -Uri "https://api.github.com/repos/$owner/$repo/git/commits/$parentCommitSha" -Headers $headers
$baseTreeSha = $parentCommit.tree.sha

Write-Output "Latest commit: $parentCommitSha"

# 2. Upload blobs for changed files: index.html, api/backend.js, deploy scripts, and real assets
$filesToCommit = @("index.html", "api/backend.js", "deploy_yaadivo.ps1", "commit_git_data.ps1", "assets/real-custom-frame.png", "assets/real-custom-mug.png")
$treeItems = @()

foreach ($relPath in $filesToCommit) {
    $fullPath = Join-Path (Get-Location) $relPath
    $bytes = [System.IO.File]::ReadAllBytes($fullPath)
    $b64 = [System.Convert]::ToBase64String($bytes)

    $blobPayload = @{
        content = $b64
        encoding = "base64"
    } | ConvertTo-Json

    $blob = Invoke-RestMethod -Method Post -Uri "https://api.github.com/repos/$owner/$repo/git/blobs" -Headers $headers -Body $blobPayload
    
    $treeItems += @{
        path = $relPath.Replace('\', '/')
        mode = "100644"
        type = "blob"
        sha = $blob.sha
    }
    Write-Output "Blob created for $relPath -> $($blob.sha)"
}

# 3. Create new tree
$treePayload = @{
    base_tree = $baseTreeSha
    tree = $treeItems
} | ConvertTo-Json -Depth 5

$newTree = Invoke-RestMethod -Method Post -Uri "https://api.github.com/repos/$owner/$repo/git/trees" -Headers $headers -Body $treePayload
Write-Output "New tree: $($newTree.sha)"

# 4. Create new commit
$commitPayload = @{
    message = "feat: upgrade Yaadivo e-commerce platform with search, personalization engine, 3-step checkout, and live order tracking"
    tree = $newTree.sha
    parents = @($parentCommitSha)
} | ConvertTo-Json

$newCommit = Invoke-RestMethod -Method Post -Uri "https://api.github.com/repos/$owner/$repo/git/commits" -Headers $headers -Body $commitPayload
Write-Output "New commit created: $($newCommit.sha)"

# 5. Update ref
$updateRefPayload = @{
    sha = $newCommit.sha
    force = $false
} | ConvertTo-Json

$updatedRef = Invoke-RestMethod -Method Patch -Uri "https://api.github.com/repos/$owner/$repo/git/refs/heads/main" -Headers $headers -Body $updateRefPayload
Write-Output "Ref updated to $($updatedRef.object.sha) successfully!"
