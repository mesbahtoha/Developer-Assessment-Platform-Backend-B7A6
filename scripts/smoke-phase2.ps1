# Phase 2 smoke test: auth + /users/me + RBAC (run: powershell -File scripts/smoke-phase2.ps1)
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
  if ($body -ne $null) {
    $json = $body | ConvertTo-Json -Depth 5
    $request.Content = New-Object System.Net.Http.StringContent($json, [System.Text.Encoding]::UTF8, 'application/json')
  }
  $response = $script:client.SendAsync($request).GetAwaiter().GetResult()
  $content = $response.Content.ReadAsStringAsync().GetAwaiter().GetResult()
  $parsed = $null
  try { $parsed = $content | ConvertFrom-Json } catch {}
  return @{ status = [int]$response.StatusCode; body = $parsed; raw = $content }
}

# 0. health
$h = Invoke-Api 'GET' 'http://localhost:5000/' $null $null
Check 'health envelope' ($h.status -eq 200 -and $h.body.success)

# 1. register (role=ADMIN must be rejected by Zod)
$stamp = Get-Date -Format 'yyyyMMddHHmmss'
$email = "p2$stamp@test.com"
$r1 = Invoke-Api 'POST' "$base/auth/register" @{ name = 'P2 Tester'; email = $email; password = 'Passw0rd123'; role = 'ADMIN' } $null
Check 'register rejects self-assigned ADMIN role (400)' ($r1.status -eq 400)

$r2 = Invoke-Api 'POST' "$base/auth/register" @{ name = 'P2 Tester'; email = $email; password = 'Passw0rd123' } $null
Check 'register returns 201 + tokens, no password leak' ($r2.status -eq 201 -and $r2.body.data.accessToken -ne $null -and ($r2.raw -notmatch 'Passw0rd123|\$2[aby]\$'))
$access = $r2.body.data.accessToken
$refresh = $r2.body.data.refreshToken

# 2. login / invalid password
$r3 = Invoke-Api 'POST' "$base/auth/login" @{ email = $email; password = 'Passw0rd123' } $null
Check 'login works' ($r3.status -eq 200)
$r4 = Invoke-Api 'POST' "$base/auth/login" @{ email = $email; password = 'wrongpass1' } $null
Check 'invalid password rejected (401)' ($r4.status -eq 401)

# 3. /users/me token handling
$r5 = Invoke-Api 'GET' "$base/users/me" $null $null
Check '/users/me without token (401)' ($r5.status -eq 401)
$r6 = Invoke-Api 'GET' "$base/users/me" $null 'garbage.token.here'
Check '/users/me garbage token (401)' ($r6.status -eq 401)
$expired = node -e "require('dotenv/config');const jwt=require('jsonwebtoken');process.stdout.write(jwt.sign({id:'00000000-0000-0000-0000-000000000000',email:'ghost@test.com',role:'CANDIDATE'},process.env.JWT_ACCESS_SECRET,{expiresIn:'-10s'}))"
$r7 = Invoke-Api 'GET' "$base/users/me" $null $expired
Check '/users/me expired token (401)' ($r7.status -eq 401)
$ghost = node -e "require('dotenv/config');const jwt=require('jsonwebtoken');const crypto=require('crypto');process.stdout.write(jwt.sign({id:crypto.randomUUID(),email:'ghost2@test.com',role:'CANDIDATE'},process.env.JWT_ACCESS_SECRET,{expiresIn:'1h'}))"
$r8 = Invoke-Api 'GET' "$base/users/me" $null $ghost
Check '/users/me unknown-user token (401)' ($r8.status -eq 401)
$r9 = Invoke-Api 'GET' "$base/users/me" $null $access
Check '/users/me returns profile, no password field' ($r9.status -eq 200 -and $r9.body.data.user.email -eq $email -and $r9.raw -notmatch 'password')

# 4. PATCH /users/me
$r10 = Invoke-Api 'PATCH' "$base/users/me" @{ name = 'P2 Renamed' } $access
Check 'PATCH /users/me updates name' ($r10.status -eq 200 -and $r10.body.data.user.name -eq 'P2 Renamed')
$r11 = Invoke-Api 'PATCH' "$base/users/me" @{} $access
Check 'PATCH /users/me empty body (400)' ($r11.status -eq 400)
$r12 = Invoke-Api 'PATCH' "$base/users/me" @{ avatarUrl = 'not-a-url' } $access
Check 'PATCH /users/me invalid avatarUrl (400)' ($r12.status -eq 400)

# 5. refresh rotation + logout
$r13 = Invoke-Api 'POST' "$base/auth/refresh-token" @{ refreshToken = $refresh } $null
Check 'refresh token rotation works' ($r13.status -eq 200 -and $r13.body.data.refreshToken -ne $refresh)
$r14 = Invoke-Api 'POST' "$base/auth/refresh-token" @{ refreshToken = $refresh } $null
Check 'old refresh token rejected (401)' ($r14.status -eq 401)
$newRefresh = $r13.body.data.refreshToken
$r15 = Invoke-Api 'POST' "$base/auth/logout" @{ refreshToken = $newRefresh } $null
$r16 = Invoke-Api 'POST' "$base/auth/refresh-token" @{ refreshToken = $newRefresh } $null
Check 'logout revokes refresh token (401 after)' ($r15.status -eq 200 -and $r16.status -eq 401)

# 6. Google endpoint exists + rejects garbage credential
$r17 = Invoke-Api 'POST' "$base/auth/google" @{ credential = 'not.a.real.google.token' } $null
Check '/auth/google rejects invalid credential (401)' ($r17.status -eq 401)

# 7. RBAC on /admin/users
$r18 = Invoke-Api 'GET' "$base/admin/users" $null $null
Check 'admin route without token (401)' ($r18.status -eq 401)
$r19 = Invoke-Api 'GET' "$base/admin/users" $null $access
Check 'candidate blocked from admin route (403)' ($r19.status -eq 403)
$r20login = Invoke-Api 'POST' "$base/auth/login" @{ email = 'recruiter@assessment.com'; password = 'Recruiter@1234' } $null
$recruiterToken = $r20login.body.data.accessToken
$r21 = Invoke-Api 'GET' "$base/admin/users" $null $recruiterToken
Check 'recruiter blocked from admin route (403)' ($r21.status -eq 403)
$r22login = Invoke-Api 'POST' "$base/auth/login" @{ email = 'admin@assessment.com'; password = 'Admin@1234' } $null
$adminToken = $r22login.body.data.accessToken
$r22 = Invoke-Api 'GET' "$base/admin/users" $null $adminToken
Check 'admin can list users + pagination meta' ($r22.status -eq 200 -and $r22.body.data.meta.page -eq 1 -and $r22.body.data.meta.total -ge 4)
$r23 = Invoke-Api 'GET' "$base/admin/users?search=Jane" $null $adminToken
Check 'admin search filter finds Jane' ($r23.status -eq 200 -and ($r23.body.data.users | Where-Object { $_.email -eq 'jane.candidate@assessment.com' }) -ne $null)
$r24 = Invoke-Api 'GET' "$base/admin/users?role=CANDIDATE&limit=2&page=1" $null $adminToken
Check 'admin role filter + limit works' ($r24.status -eq 200 -and $r24.body.data.users.Count -le 2 -and ($r24.body.data.users | Where-Object { $_.role -ne 'CANDIDATE' }) -eq $null)
$r25 = Invoke-Api 'GET' "$base/admin/users?sortBy=email&sortOrder=asc" $null $adminToken
Check 'admin sort works' ($r25.status -eq 200)

Write-Output '-----------------------------------'
Write-Output "RESULT: $pass passed, $fail failed"
if ($fail -gt 0) { exit 1 }
