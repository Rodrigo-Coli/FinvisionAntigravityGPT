$repo = "Rodrigo-Coli/FinvisionAntigravityGPT"
$branch = "main"
$token = "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"
$headers = @{ "Authorization" = "token $token"; "Accept" = "application/vnd.github.v3+json" }

$filesToDelete = @("apply-coupon.ts", "asaas-create-subscription.ts", "asaas-webhook.ts", "categorize-transactions.ts", "finvision-chat.ts", "handle-bank-reconcile.ts", "handle-card-reconcile.ts", "handle-financial-parse.ts", "handle-import-worker.ts", "handle-receipt-items.ts", "handle-wealth-analysis.ts", "parse-card-statement.ts", "parse-financial-document.ts", "parse-statement.ts", "process-import.ts", "public-plans.ts")

foreach ($f in $filesToDelete) {
    try {
        $fileInfo = Invoke-RestMethod -Uri "https://api.github.com/repos/$repo/contents/api/$f?ref=$branch" -Headers $headers
        $delBody = @{ message = "Delete $f"; sha = $fileInfo.sha; branch = $branch } | ConvertTo-Json
        Invoke-RestMethod -Method Delete -Uri "https://api.github.com/repos/$repo/contents/api/$f" -Headers $headers -Body $delBody
        Write-Host "Deleted $f"
    } catch {
        Write-Host "Error deleting $f"
    }
}
