# Phase 3B smoke test: invitations + attempts + submissions workflow
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

# ---- setup tokens + assessment under test ----
$rA = Invoke-Api 'POST' "$base/auth/login" @{ email = 'admin@assessment.com'; password = 'Admin@1234' } $null
$admin = $rA.body.data.accessToken
$rR = Invoke-Api 'POST' "$base/auth/login" @{ email = 'recruiter@assessment.com'; password = 'Recruiter@1234' } $null
$recruiter = $rR.body.data.accessToken
$rC = Invoke-Api 'POST' "$base/auth/login" @{ email = 'candidate@assessment.com'; password = 'Candidate@1234' } $null
$candidate = $rC.body.data.accessToken
$rJ = Invoke-Api 'POST' "$base/auth/login" @{ email = 'jane.candidate@assessment.com'; password = 'Jane@1234' } $null
$jane = $rJ.body.data.accessToken
$stamp = Get-Date -Format 'HHmmss'
$rR2 = Invoke-Api 'POST' "$base/auth/register" @{ name = 'R2 Recruiter'; email = "r2$stamp@test.com"; password = 'Other@1234'; role = 'RECRUITER' } $null
$recruiter2 = $rR2.body.data.accessToken
Check 'setup: tokens acquired' ($admin -and $recruiter -and $candidate -and $jane -and $recruiter2)

# fresh free assessment with one MCQ problem
$rP = Invoke-Api 'POST' "$base/problems" @{ title = "Workflow MCQ $stamp"; type = 'MCQ'; difficulty = 'EASY'; prompt = 'What does HTTP 409 mean?'; options = @('Conflict', 'OK', 'Not Found', 'Unauthorized'); correctAnswer = 'Conflict'; points = 2 } $recruiter
$pid1 = $rP.body.data.problem.id
$rA2 = Invoke-Api 'POST' "$base/assessments" @{ title = "Workflow Test $stamp"; description = 'Free assessment for the invitation and attempt workflow tests.'; durationMin = 20; price = 0 } $recruiter
$aid = $rA2.body.data.assessment.id
Invoke-Api 'POST' "$base/assessments/$aid/problems" @{ problemIds = @($pid1) } $recruiter | Out-Null
Invoke-Api 'PATCH' "$base/assessments/$aid" @{ status = 'PUBLISHED' } $recruiter | Out-Null

# ---- INVITATIONS ----
$r1 = Invoke-Api 'POST' "$base/invitations" @{ assessmentId = $aid; candidateEmail = 'candidate@assessment.com' } $candidate
Check 'candidate cannot send invitation (403)' ($r1.status -eq 403)
$r2 = Invoke-Api 'POST' "$base/invitations" @{ assessmentId = (New-Guid); candidateEmail = 'candidate@assessment.com' } $recruiter
Check 'invitation for unknown assessment (404)' ($r2.status -eq 404)
$r3 = Invoke-Api 'POST' "$base/invitations" @{ assessmentId = $aid; candidateEmail = "ghost$stamp@test.com" } $recruiter
Check 'invitation for unknown candidate (404)' ($r3.status -eq 404)
$r4 = Invoke-Api 'POST' "$base/invitations" @{ assessmentId = $aid; candidateEmail = 'candidate@assessment.com' } $recruiter
Check 'recruiter sends invitation (201)' ($r4.status -eq 201 -and $r4.body.data.invitation.status -eq 'PENDING')
$invId = $r4.body.data.invitation.id
$r5 = Invoke-Api 'POST' "$base/invitations" @{ assessmentId = $aid; candidateEmail = 'candidate@assessment.com' } $recruiter
Check 'duplicate invitation rejected (409)' ($r5.status -eq 409)
$r6 = Invoke-Api 'GET' "$base/invitations" $null $candidate
Check 'candidate sees own invitations' (($r6.body.data.invitations | Where-Object { $_.id -eq $invId }) -ne $null)
$r7 = Invoke-Api 'GET' "$base/invitations?status=PENDING" $null $recruiter
Check 'recruiter sees invitations with status filter' ($r7.status -eq 200)
$r8 = Invoke-Api 'PATCH' "$base/invitations/$invId/accept" $null $jane
Check 'wrong candidate cannot accept invitation (403)' ($r8.status -eq 403)
$r9 = Invoke-Api 'PATCH' "$base/invitations/$invId/accept" $null $candidate
Check 'candidate accepts invitation' ($r9.status -eq 200 -and $r9.body.data.invitation.status -eq 'ACCEPTED')
$r10 = Invoke-Api 'PATCH' "$base/invitations/$invId/accept" $null $candidate
Check 'double-accept rejected (409)' ($r10.status -eq 409)

# ---- ATTEMPT START ----
$r11 = Invoke-Api 'POST' "$base/assessments/$aid/start" $null $jane
Check 'uninvited candidate cannot start (404)' ($r11.status -eq 404)
$r12 = Invoke-Api 'POST' "$base/assessments/$aid/start" $null $recruiter
Check 'recruiter cannot start attempt (403)' ($r12.status -eq 403)
$r13 = Invoke-Api 'POST' "$base/assessments/$aid/start" $null $candidate
Check 'invited candidate starts attempt (201, timing set)' ($r13.status -eq 201 -and $r13.body.data.attempt.startedAt -ne $null -and $r13.body.data.attempt.deadlineAt -ne $null)
$atId = $r13.body.data.attempt.id
$r14 = Invoke-Api 'POST' "$base/assessments/$aid/start" $null $candidate
Check 'duplicate attempt rejected (409)' ($r14.status -eq 409)

# ---- SUBMISSIONS ----
$r15 = Invoke-Api 'POST' "$base/attempts/$atId/submissions" @{ problemId = $pid1; answer = 'Conflict' } $jane
Check 'other candidate cannot submit to attempt (403)' ($r15.status -eq 403)
$r16 = Invoke-Api 'POST' "$base/attempts/$atId/submissions" @{ problemId = (New-Guid); answer = 'x' } $candidate
Check 'submission for unattached problem (404)' ($r16.status -eq 404)
$r17 = Invoke-Api 'POST' "$base/attempts/$atId/submissions" @{ problemId = $pid1; answer = '' } $candidate
Check 'empty answer rejected (400)' ($r17.status -eq 400)
$r18 = Invoke-Api 'POST' "$base/attempts/$atId/submissions" @{ problemId = $pid1; answer = 'Conflict' } $candidate
Check 'correct MCQ auto-graded EVALUATED with points' ($r18.status -eq 201 -and $r18.body.data.submission.status -eq 'EVALUATED' -and $r18.body.data.submission.pointsAwarded -eq 2)
$r19 = Invoke-Api 'POST' "$base/attempts/$atId/submissions" @{ problemId = $pid1; answer = 'Unauthorized' } $candidate
Check 'resubmission updates + regrades (0 points)' ($r19.status -eq 201 -and $r19.body.data.submission.pointsAwarded -eq 0)
$r20 = Invoke-Api 'POST' "$base/attempts/$atId/submissions" @{ problemId = $pid1; answer = 'Conflict' } $candidate
Check 'resubmission restores correct answer' ($r20.body.data.submission.pointsAwarded -eq 2)

# ---- access control on attempt/submissions ----
$r21 = Invoke-Api 'GET' "$base/attempts/$atId" $null $candidate
Check 'owner candidate reads attempt (sanitized)' ($r21.status -eq 200 -and ($r21.raw -notmatch 'correctAnswer'))
$r22 = Invoke-Api 'GET' "$base/attempts/$atId" $null $jane
Check 'other candidate blocked from attempt (403)' ($r22.status -eq 403)
$r23 = Invoke-Api 'GET' "$base/attempts/$atId" $null $recruiter
Check 'assessment recruiter reads attempt with answers' ($r23.status -eq 200 -and ($r23.raw -match 'correctAnswer'))
$r24 = Invoke-Api 'GET' "$base/attempts/$atId" $null $recruiter2
Check 'foreign recruiter blocked (403)' ($r24.status -eq 403)
$r25 = Invoke-Api 'GET' "$base/attempts/$atId" $null $admin
Check 'admin reads any attempt' ($r25.status -eq 200)
$r26 = Invoke-Api 'GET' "$base/attempts/$atId/submissions" $null $recruiter
Check 'recruiter lists submissions' ($r26.status -eq 200 -and $r26.body.data.submissions.Count -ge 1)
$subId = $r26.body.data.submissions[0].id
$r27 = Invoke-Api 'GET' "$base/submissions/$subId" $null $candidate
Check 'candidate reads own submission (no correctAnswer)' ($r27.status -eq 200 -and ($r27.raw -notmatch 'correctAnswer'))
$r28 = Invoke-Api 'GET' "$base/submissions/$subId" $null $jane
Check 'other candidate blocked from submission (403)' ($r28.status -eq 403)
$r29 = Invoke-Api 'GET' "$base/submissions/$subId" $null $recruiter
Check 'recruiter reads submission with problem answer' ($r29.status -eq 200 -and ($r29.raw -match 'correctAnswer'))

# ---- final submit + result ----
$r30 = Invoke-Api 'PATCH' "$base/attempts/$atId/submit" $null $candidate
Check 'attempt submit computes result' ($r30.status -eq 200 -and $r30.body.data.result.score -eq 2 -and $r30.body.data.result.totalPoints -eq 2 -and $r30.body.data.result.isPassed -eq $true)
$r31 = Invoke-Api 'PATCH' "$base/attempts/$atId/submit" $null $candidate
Check 'double submit rejected (409)' ($r31.status -eq 409)
$r32 = Invoke-Api 'POST' "$base/attempts/$atId/submissions" @{ problemId = $pid1; answer = 'Conflict' } $candidate
Check 'submission after finalize rejected (409)' ($r32.status -eq 409)

# ---- paid assessment gating (seeded invitation is PENDING) ----
$r33 = Invoke-Api 'GET' "$base/invitations?limit=50" $null $candidate
$paidInv = $r33.body.data.invitations | Where-Object { $_.assessment.price -gt 0 } | Select-Object -First 1
if ($paidInv) {
  Invoke-Api 'PATCH' "$base/invitations/$($paidInv.id)/accept" $null $candidate | Out-Null
  $r35 = Invoke-Api 'POST' "$base/assessments/$($paidInv.assessment.id)/start" $null $candidate
  Check 'paid assessment start without payment (402)' ($r35.status -eq 402)
} else { Check 'paid assessment start without payment (402)', $false }

# ---- expired attempt (deadline forced into the past via DB) ----
$rInvJ = Invoke-Api 'POST' "$base/invitations" @{ assessmentId = $aid; candidateEmail = 'jane.candidate@assessment.com' } $recruiter
$rAccJ = Invoke-Api 'PATCH' "$base/invitations/$($rInvJ.body.data.invitation.id)/accept" $null $jane
$r36 = Invoke-Api 'POST' "$base/assessments/$aid/start" $null $jane
if ($r36.status -eq 201) {
  $janeAtId = $r36.body.data.attempt.id
  node -e "require('dotenv/config');const{PrismaClient}=require('@prisma/client');const p=new PrismaClient();p.attempt.update({where:{id:'$janeAtId'},data:{deadlineAt:new Date(Date.now()-60000)}}).then(()=>p.`$disconnect())" | Out-Null
  $r37 = Invoke-Api 'POST' "$base/attempts/$janeAtId/submissions" @{ problemId = $pid1; answer = 'Conflict' } $jane
  Check 'submission to expired attempt rejected (409) + marked EXPIRED' ($r37.status -eq 409)
  $r38 = Invoke-Api 'GET' "$base/attempts/$janeAtId" $null $jane
  Check 'expired attempt status is EXPIRED' ($r38.body.data.attempt.status -eq 'EXPIRED')
} else { Check 'expired attempt flow - jane could not start (seed attempt conflict)', $false }

Write-Output '-----------------------------------'
Write-Output "RESULT: $pass passed, $fail failed"
if ($fail -gt 0) { exit 1 }
