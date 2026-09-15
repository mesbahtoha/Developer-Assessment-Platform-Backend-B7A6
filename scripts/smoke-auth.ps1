# Smoke test for the auth module. Usage: powershell -File scripts/smoke-auth.ps1
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Net.Http
$base = 'http://localhost:5000/api/v1'
$pass = 0; $fail = 0
$client = New-Object System.Net.Http.HttpClient

function Check($name, $condition) {
  if ($condition) { Write-Output "PASS  $name"; $script:pass++ }
  else { Write-Output "FAIL  $name"; $script:fail++ }
}

function Invoke-Api($method, $url, $body, $token) {
  $request = New-Object System.Net.Http.HttpRequestMessage (New-Object System.Net.Http.HttpMethod($method)), $url
  if ($token) { $request.Headers.TryAddWithoutValidation('Authorization', "Bearer $token") | Out-Null }
  if ($body) {
    $json = $body | ConvertTo-Json -Depth 5
    $request.Content = New-Object System.Net.Http.StringContent($json, [System.Text.Encoding]::UTF8, 'application/json')
  }
  $response = $script:client.SendAsync($request).GetAwaiter().GetResult()
  $content = $response.Content.ReadAsStringAsync().GetAwaiter().GetResult()
  $parsed = $null
  try { $parsed = $content | ConvertFrom-Json } catch {}
  return @{
    status = [int]$response.StatusCode
    body   = $parsed
    raw    = $content
  }
}

# 0. server health
$health = Invoke-Api 'GET' 'http://localhost:5000/' $null $null
Check 'health check returns envelope' ($health.status -eq 200 -and $health.body.success -eq $true)

# 1. register
$stamp = Get-Date -Format 'yyyyMMddHHmmss'
$email = "smoke$stamp@test.com"
$r1 = Invoke-Api 'POST' "$base/auth/register" @{ name = 'Smoke Tester'; email = $email; password = 'Passw0rd123'; role = 'CANDIDATE' } $null
Check 'register returns 201 + tokens, no password leaked' ($r1.status -eq 201 -and $r1.body.data.accessToken -ne $null -and ($r1.raw -notmatch 'Passw0rd123|\$2[aby]\$'))
$access = $r1.body.data.accessToken
$refresh = $r1.body.data.refreshToken

# 2. validation rejects bad email
$r2 = Invoke-Api 'POST' "$base/auth/register" @{ name = 'X'; email = 'not-an-email'; password = 'Passw0rd123' } $null
Check 'register rejects invalid email (400 + errors[])' ($r2.status -eq 400 -and $r2.body.success -eq $false -and $r2.body.errors.Count -gt 0)

# 3. duplicate email
$r3 = Invoke-Api 'POST' "$base/auth/register" @{ name = 'Dup'; email = $email; password = 'Passw0rd123' } $null
Check 'duplicate email rejected (409)' ($r3.status -eq 409)

# 4. /auth/me
$r4 = Invoke-Api 'GET' "$base/auth/me" $null $access
Check 'auth/me returns profile' ($r4.status -eq 200 -and $r4.body.data.user.email -eq $email)

# 5. login seeded candidate
$r5 = Invoke-Api 'POST' "$base/auth/login" @{ email = 'candidate@assessment.com'; password = 'Candidate@1234' } $null
Check 'seeded candidate can login' ($r5.status -eq 200 -and $r5.body.data.user.role -eq 'CANDIDATE')

# 6. wrong password
$r6 = Invoke-Api 'POST' "$base/auth/login" @{ email = 'candidate@assessment.com'; password = 'wrongpass1' } $null
Check 'wrong password rejected (401)' ($r6.status -eq 401)

# 7. admin login
$r7 = Invoke-Api 'POST' "$base/auth/login" @{ email = 'admin@assessment.com'; password = 'Admin@1234' } $null
Check 'demo admin can login (role ADMIN)' ($r7.status -eq 200 -and $r7.body.data.user.role -eq 'ADMIN')

# 8. refresh rotation
$r8 = Invoke-Api 'POST' "$base/auth/refresh-token" @{ refreshToken = $refresh } $null
Check 'refresh token rotates (new pair)' ($r8.status -eq 200 -and $r8.body.data.accessToken -ne $null -and $r8.body.data.refreshToken -ne $refresh)
$newRefresh = $r8.body.data.refreshToken

# 9. old refresh token revoked
$r9 = Invoke-Api 'POST' "$base/auth/refresh-token" @{ refreshToken = $refresh } $null
Check 'old refresh token now invalid (401)' ($r9.status -eq 401)

# 10. logout then reuse
$r10 = Invoke-Api 'POST' "$base/auth/logout" @{ refreshToken = $newRefresh } $null
$r10b = Invoke-Api 'POST' "$base/auth/refresh-token" @{ refreshToken = $newRefresh } $null
Check 'logout revokes refresh token (401 after)' ($r10.status -eq 200 -and $r10b.status -eq 401)

# 11. change password
$r11 = Invoke-Api 'PATCH' "$base/auth/change-password" @{ currentPassword = 'Passw0rd123'; newPassword = 'NewPass0rd456' } $access
Check 'change password succeeds' ($r11.status -eq 200)
$r11b = Invoke-Api 'POST' "$base/auth/login" @{ email = $email; password = 'NewPass0rd456' } $null
Check 'login works with new password' ($r11b.status -eq 200)

# 12. no token for protected route
$r12 = Invoke-Api 'GET' "$base/auth/me" $null $null
Check 'protected route without token (401)' ($r12.status -eq 401)

Write-Output "-----------------------------------"
Write-Output "RESULT: $pass passed, $fail failed"
if ($fail -gt 0) { exit 1 }

