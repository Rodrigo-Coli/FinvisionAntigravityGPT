$repo = "Rodrigo-Coli/FinvisionAntigravityGPT"
$branch = "main"
$token = "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"
$headers = @{ "Authorization" = "token $token"; "Accept" = "application/vnd.github.v3+json" }

function Delete-File($path) {
    try {
        $fileInfo = Invoke-RestMethod -Uri "https://api.github.com/repos/$repo/contents/$path?ref=$branch" -Headers $headers
        $delBody = @{ message = "Delete $path"; sha = $fileInfo.sha; branch = $branch } | ConvertTo-Json
        Invoke-RestMethod -Method Delete -Uri "https://api.github.com/repos/$repo/contents/$path" -Headers $headers -Body $delBody
        Write-Host "Deleted $path"
    } catch {
        Write-Host "Error deleting ${path}: $($_.Exception.Message)"
    }
}

Delete-File "api/handle-financial-parse.ts"
Delete-File "api/parse-financial-document.ts"
