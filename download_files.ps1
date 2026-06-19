$repo = "Rodrigo-Coli/FinvisionAntigravityGPT"
$branch = "main"
$token = "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"
$headers = @{ "Authorization" = "token $token"; "Accept" = "application/vnd.github.v3.raw" }

Invoke-RestMethod -Uri "https://api.github.com/repos/$repo/contents/api/asaas-create-subscription.ts?ref=$branch" -Headers $headers -OutFile "api\asaas-create-subscription.ts"
Invoke-RestMethod -Uri "https://api.github.com/repos/$repo/contents/pages/AdminPlans.tsx?ref=$branch" -Headers $headers -OutFile "pages\AdminPlans.tsx"
Write-Host "Download OK"
