$ErrorActionPreference = "Stop"

function Read-SecretText {
    param([string]$Prompt)

    $secureValue = Read-Host $Prompt -AsSecureString
    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureValue)
    try {
        return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
    }
    finally {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
    }
}

function Set-PagesSecret {
    param(
        [string]$Name,
        [string]$Value
    )

    $Value | & npx.cmd wrangler pages secret put $Name --project-name promotors-site
    if ($LASTEXITCODE -ne 0) {
        throw "$Name 등록에 실패했습니다."
    }
}

Set-Location (Split-Path -Parent $PSScriptRoot)

try {
    Write-Host ""
    Write-Host "Cloudflare API 토큰을 붙여넣고 Enter를 누르세요." -ForegroundColor Cyan
    $cloudflareToken = Read-SecretText "Cloudflare 토큰"
    $env:CLOUDFLARE_API_TOKEN = $cloudflareToken

    & npx.cmd wrangler whoami
    if ($LASTEXITCODE -ne 0) {
        throw "Cloudflare 토큰 확인에 실패했습니다."
    }

    Write-Host ""
    Write-Host "이제 네이버 검색광고 화면의 값을 차례로 넣어주세요." -ForegroundColor Cyan
    $customerId = Read-SecretText "CUSTOMER_ID"
    $apiKey = Read-SecretText "액세스라이선스"
    $secretKey = Read-SecretText "비밀키"

    Set-PagesSecret "NAVER_SEARCHADS_CUSTOMER_ID" $customerId
    Set-PagesSecret "NAVER_SEARCHADS_API_KEY" $apiKey
    Set-PagesSecret "NAVER_SEARCHADS_SECRET_KEY" $secretKey

    Write-Host ""
    Write-Host "사이트를 빌드하고 배포합니다." -ForegroundColor Cyan
    & npm.cmd run deploy:cloudflare
    if ($LASTEXITCODE -ne 0) {
        throw "사이트 배포에 실패했습니다."
    }

    Write-Host ""
    Write-Host "연결과 배포가 완료되었습니다. 이 창을 닫아도 됩니다." -ForegroundColor Green
}
catch {
    Write-Host ""
    Write-Host $_.Exception.Message -ForegroundColor Red
    Write-Host "창을 닫지 말고 이 오류 내용을 알려주세요." -ForegroundColor Yellow
}
finally {
    Remove-Item Env:CLOUDFLARE_API_TOKEN -ErrorAction SilentlyContinue
    $cloudflareToken = $null
    $customerId = $null
    $apiKey = $null
    $secretKey = $null
}

Read-Host "종료하려면 Enter"
