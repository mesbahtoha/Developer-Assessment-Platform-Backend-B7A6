# Phase 3 smoke test: problems + assessments
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
    $json = $body | ConvertTo-Json -Depth 6
    $request.Content = New-Object System.Net.Http.StringContent($json, [System.Text.Encoding]::UTF8, 'application/json')
  }
  $response = $script:client.SendAsync($request).GetAwaiter().GetResult()
  $content = $response.Content.ReadAsStringAsync().GetAwaiter().GetResult()
  $parsed = $null
  try { $parsed = $content | ConvertFrom-Json } catch {}
  return @{ status = [int]$response.StatusCode; body = $parsed; raw = $content }
}

# ---- tokens ----
$rA = Invoke-Api 'POST' "$base/auth/login" @{ email = 'admin@assessment.com'; password = 'Admin@1234' } $null
$admin = $rA.body.data.accessToken
$rR = Invoke-Api 'POST' "$base/auth/login" @{ email = 'recruiter@assessment.com'; password = 'Recruiter@1234' } $null
$recruiter = $rR.body.data.accessToken
$rC = Invoke-Api 'POST' "$base/auth/login" @{ email = 'candidate@assessment.com'; password = 'Candidate@1234' } $null
$candidate = $rC.body.data.accessToken
$stamp = Get-Date -Format 'HHmmss'
$rR2 = Invoke-Api 'POST' "$base/auth/register" @{ name = 'Other Recruiter'; email = "other$stamp@test.com"; password = 'Other@1234'; role = 'RECRUITER' } $null
$recruiter2 = $rR2.body.data.accessToken
Check 'setup: tokens acquired' ($admin -and $recruiter -and $candidate -and $recruiter2)

# ================= PROBLEMS =================
$r1 = Invoke-Api 'POST' "$base/problems" @{ title = 'Event loop order'; type = 'MCQ'; difficulty = 'MEDIUM'; prompt = 'Which runs first: promise callbacks or setTimeout?'; options = @('promise callbacks', 'setTimeout', 'random', 'same time'); correctAnswer = 'promise callbacks'; points = 2; tags = @('nodejs') } $candidate
Check 'candidate cannot create problem (403)' ($r1.status -eq 403)

$r2 = Invoke-Api 'POST' "$base/problems" @{ title = 'Event loop order'; type = 'MCQ'; difficulty = 'MEDIUM'; prompt = 'Which runs first: promise callbacks or setTimeout?'; options = @('promise callbacks', 'setTimeout', 'random', 'same time'); correctAnswer = 'promise callbacks'; points = 2; tags = @('nodejs') } $recruiter
Check 'recruiter creates MCQ problem (201)' ($r2.status -eq 201 -and $r2.body.data.problem.type -eq 'MCQ')
$p1 = $r2.body.data.problem.id

$r3 = Invoke-Api 'POST' "$base/problems" @{ title = 'Bad MCQ'; type = 'MCQ'; prompt = 'Which method filters an array?'; options = @('map()', 'filter()'); correctAnswer = 'reduce()' } $recruiter
Check 'MCQ correctAnswer not in options rejected (400)' ($r3.status -eq 400)

$r4 = Invoke-Api 'POST' "$base/problems" @{ title = 'MCQ no options'; type = 'MCQ'; prompt = 'Which method filters an array?'; correctAnswer = 'filter()' } $recruiter
Check 'MCQ without options rejected (400)' ($r4.status -eq 400)

$r5 = Invoke-Api 'POST' "$base/problems" @{ title = 'Reverse string'; type = 'CODE'; difficulty = 'HARD'; prompt = 'Write reverse(s) that returns the reversed string.'; correctAnswer = 's.split("").reverse().join("")'; points = 5 } $recruiter
Check 'recruiter creates CODE problem (201)' ($r5.status -eq 201)
$p2 = $r5.body.data.problem.id

$r6 = Invoke-Api 'GET' "$base/problems?limit=5&sortBy=title&sortOrder=asc" $null $recruiter
Check 'problem list with pagination meta' ($r6.status -eq 200 -and $r6.body.data.meta.limit -eq 5)
Check 'problem list excludes other recruiters problems' (($r6.body.data.problems | Where-Object { $_.createdById -ne ($rR.body.data.user.id) }) -eq $null)
$r7 = Invoke-Api 'GET' "$base/problems?type=CODE" $null $recruiter
Check 'problem filter by type=CODE' (($r7.body.data.problems | Where-Object { $_.type -ne 'CODE' }) -eq $null)
$r8 = Invoke-Api 'GET' "$base/problems?search=event+loop" $null $recruiter
Check 'problem search matches prompt' ($r8.body.data.problems.Count -ge 1)
$r9 = Invoke-Api 'GET' "$base/problems/search?q=reverse" $null $recruiter
Check 'problem search endpoint works' ($r9.status -eq 200 -and $r9.body.data.count -ge 1)
$r10 = Invoke-Api 'GET' "$base/problems/search?q=zzznomatchxyz" $null $recruiter
Check 'problem search no match -> 0' ($r10.body.data.count -eq 0)

$r11 = Invoke-Api 'GET' "$base/problems/$p1" $null $recruiter
Check 'recruiter gets own problem by id' ($r11.status -eq 200)
$r12 = Invoke-Api 'GET' "$base/problems/$p1" $null $candidate
Check 'candidate cannot read problem bank (403)' ($r12.status -eq 403)
$r13 = Invoke-Api 'GET' "$base/problems/$p1" $null $recruiter2
Check 'foreign recruiter cannot read problem (403)' ($r13.status -eq 403)
$r14 = Invoke-Api 'GET' "$base/problems/$p1" $null $admin
Check 'admin can read any problem' ($r14.status -eq 200)

$r15 = Invoke-Api 'PATCH' "$base/problems/$p1" @{ title = 'Event loop ordering'; points = 3 } $recruiter
Check 'recruiter updates own problem' ($r15.status -eq 200 -and $r15.body.data.problem.points -eq 3)
$r16 = Invoke-Api 'PATCH' "$base/problems/$p1" @{ correctAnswer = 'not-in-options-answer' } $recruiter
Check 'patch to MCQ answer outside options rejected (400)' ($r16.status -eq 400)
$r17 = Invoke-Api 'PATCH' "$base/problems/$p1" @{ points = 2 } $recruiter2
Check 'foreign recruiter cannot update problem (403)' ($r17.status -eq 403)

$r17b = Invoke-Api 'POST' "$base/problems" @{ title = 'FizzBuzz check'; type = 'CODE'; difficulty = 'EASY'; prompt = 'Write fizzbuzz(n) returning an array of strings.'; correctAnswer = 'loop with modulo checks'; points = 1 } $recruiter
$p3 = $r17b.body.data.problem.id
$r18 = Invoke-Api 'DELETE' "$base/problems/$p3" $null $recruiter
Check 'soft delete problem (200)' ($r18.status -eq 200)
$r19 = Invoke-Api 'GET' "$base/problems/$p3" $null $recruiter
Check 'deleted problem returns 404' ($r19.status -eq 404)
$r20 = Invoke-Api 'GET' "$base/problems" $null $recruiter
Check 'deleted problem not in list' (($r20.body.data.problems | Where-Object { $_.id -eq $p3 }) -eq $null)

# ================= ASSESSMENTS =================
$r21 = Invoke-Api 'POST' "$base/assessments" @{ title = 'Node.js Backend Test'; description = 'Node and backend fundamentals for mid-level engineers.'; durationMin = 30; price = 0; passScorePercent = 60 } $candidate
Check 'candidate cannot create assessment (403)' ($r21.status -eq 403)

$r22 = Invoke-Api 'POST' "$base/assessments" @{ title = 'Node.js Backend Test'; description = 'Node and backend fundamentals for mid-level engineers.'; durationMin = 30; price = 0; passScorePercent = 60 } $recruiter
Check 'recruiter creates assessment (201, DRAFT)' ($r22.status -eq 201 -and $r22.body.data.assessment.status -eq 'DRAFT')
$a1 = $r22.body.data.assessment.id

$r23 = Invoke-Api 'POST' "$base/assessments" @{ title = 'x'; description = 'short' } $recruiter
Check 'assessment validation errors (400)' ($r23.status -eq 400)

$r24 = Invoke-Api 'GET' "$base/assessments" $null $candidate
Check 'candidate list excludes DRAFT' (($r24.body.data.assessments | Where-Object { $_.id -eq $a1 }) -eq $null)

$r25 = Invoke-Api 'PATCH' "$base/assessments/$a1" @{ status = 'PUBLISHED' } $recruiter
Check 'publish without problems rejected (400)' ($r25.status -eq 400)

$r26 = Invoke-Api 'POST' "$base/assessments/$a1/problems" @{ problemIds = @($p1, $p2) } $recruiter
Check 'attach problems (200, transaction)' ($r26.status -eq 200 -and $r26.body.data.problems.Count -eq 2)
$r27 = Invoke-Api 'POST' "$base/assessments/$a1/problems" @{ problemIds = @($p1, (New-Guid)) } $recruiter
Check 'attach unknown problem id rejected (400)' ($r27.status -eq 400)
$r28 = Invoke-Api 'POST' "$base/assessments/$a1/problems" @{ problemIds = @($p1) } $recruiter2
Check 'foreign recruiter cannot attach to assessment (404)' ($r28.status -eq 404)
$r29 = Invoke-Api 'POST' "$base/assessments/$a1/problems" @{ problemIds = @($p1, $p2) } $recruiter
Check 'duplicate attach does not duplicate (unique constraint)' ($r29.status -eq 200 -and $r29.body.data.problems.Count -eq 2)

$r31 = Invoke-Api 'GET' "$base/assessments/$a1" $null $recruiter
Check 'recruiter detail includes correctAnswer' ($r31.status -eq 200 -and ($r31.raw -match 'correctAnswer'))

$r32 = Invoke-Api 'PATCH' "$base/assessments/$a1" @{ status = 'PUBLISHED' } $recruiter
Check 'publish assessment (200 PUBLISHED)' ($r32.status -eq 200 -and $r32.body.data.assessment.status -eq 'PUBLISHED')

$r33 = Invoke-Api 'GET' "$base/assessments" $null $candidate
Check 'candidate list includes PUBLISHED' (($r33.body.data.assessments | Where-Object { $_.id -eq $a1 }) -ne $null)
$r34 = Invoke-Api 'GET' "$base/assessments/$a1" $null $candidate
Check 'candidate detail 200 + correctAnswer stripped' ($r34.status -eq 200 -and ($r34.raw -notmatch 'correctAnswer') -and $r34.body.data.assessment.problems.Count -eq 2)

$r35 = Invoke-Api 'PATCH' "$base/assessments/$a1" @{ status = 'CLOSED' } $recruiter
Check 'PUBLISHED -> CLOSED (200)' ($r35.status -eq 200 -and $r35.body.data.assessment.status -eq 'CLOSED')
$r36 = Invoke-Api 'PATCH' "$base/assessments/$a1" @{ status = 'ARCHIVED' } $recruiter
Check 'CLOSED -> ARCHIVED (200)' ($r36.status -eq 200 -and $r36.body.data.assessment.status -eq 'ARCHIVED')
$r37 = Invoke-Api 'PATCH' "$base/assessments/$a1" @{ status = 'PUBLISHED' } $recruiter
Check 'ARCHIVED -> PUBLISHED invalid transition (400)' ($r37.status -eq 400)
$r38 = Invoke-Api 'GET' "$base/assessments/$a1" $null $candidate
Check 'archived assessment hidden from candidate (404)' ($r38.status -eq 404)

# full lifecycle + soft delete on second assessment
$r39 = Invoke-Api 'POST' "$base/assessments" @{ title = 'Temp JS Quiz'; description = 'Temporary quiz used for delete testing.' } $recruiter
$a2 = $r39.body.data.assessment.id
$r40 = Invoke-Api 'POST' "$base/assessments/$a2/problems" @{ problemIds = @($p1) } $recruiter
Invoke-Api 'PATCH' "$base/assessments/$a2" @{ status = 'PUBLISHED' } $recruiter | Out-Null
$r41 = Invoke-Api 'PATCH' "$base/assessments/$a2" @{ title = 'Temp JS Quiz v2'; price = 999 } $recruiter
Check 'recruiter updates assessment fields' ($r41.status -eq 200 -and $r41.body.data.assessment.price -eq 999)
$r42 = Invoke-Api 'PATCH' "$base/assessments/$a2" @{ title = 'hijacked' } $recruiter2
Check 'foreign recruiter cannot update assessment (404)' ($r42.status -eq 404)
$r43 = Invoke-Api 'DELETE' "$base/assessments/$a2" $null $recruiter
Check 'soft delete assessment (200)' ($r43.status -eq 200)
$r44 = Invoke-Api 'GET' "$base/assessments/$a2" $null $recruiter
Check 'deleted assessment 404 for owner' ($r44.status -eq 404)
$r45 = Invoke-Api 'GET' "$base/assessments" $null $candidate
Check 'deleted assessment not in candidate list' (($r45.body.data.assessments | Where-Object { $_.id -eq $a2 }) -eq $null)
$r46 = Invoke-Api 'GET' "$base/assessments?status=DRAFT" $null $recruiter
Check 'recruiter status filter works' ($r46.status -eq 200)
$r47 = Invoke-Api 'GET' "$base/assessments?search=System+Design" $null $candidate
Check 'candidate search works' ($r47.body.data.assessments.Count -ge 1)

Write-Output '-----------------------------------'
Write-Output "RESULT: $pass passed, $fail failed"
if ($fail -gt 0) { exit 1 }
