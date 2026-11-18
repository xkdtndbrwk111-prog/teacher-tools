$ErrorActionPreference='Stop'
$server=Join-Path $PSScriptRoot '../../runtime-src/system/server.ps1'
$tokens=$null;$errors=$null
$ast=[System.Management.Automation.Language.Parser]::ParseFile($server,[ref]$tokens,[ref]$errors)
if($errors.Count){throw ($errors|Out-String)}
foreach($name in @('ConvertTo-TTManagerRoster','Merge-TTManagerRoster')){
 $fun=$ast.Find({param($n) $n -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -eq $name},$true)
 if(!$fun){throw 'missing roster function'}
 . ([scriptblock]::Create($fun.Extent.Text))
}
$x=ConvertFrom-Json '{"rosterProtocol":1,"classId":"a","className":"Class","roster":[{"id":"s1","name":"New","gender":"male","number":1,"excluded":false,"grades":"private"},{"id":"s3","name":"Three","gender":"none","number":3,"excluded":false}],"layout":"untrusted"}'
$old=ConvertFrom-Json '{"classId":"a","className":"Old","layout":{"rows":4},"students":[{"id":"s1","name":"Old","visual":"v"},{"id":"s2","name":"Two"}],"assignments":[{"studentId":"s1","seatId":"a1"},{"studentId":"s2","seatId":"a2"}],"groups":[{"id":"g1","name":"G1","seatIds":["a1","a2"]}],"practice":{"genderSeats":true}}'
$r=Merge-TTManagerRoster $x $old
if($r.assignments.Count -ne 1 -or $r.assignments[0].studentId -ne 's1' -or $r.students[0].name -ne 'New' -or $r.layout.rows -ne 4 -or $r.groups[0].id -ne 'g1' -or $r.roster[0].Contains('grades')){throw 'same-class preservation / removal / projection'}
$x.classId='b';$new=Merge-TTManagerRoster $x $old
if(!$new.rosterOnly -or $new.Contains('layout') -or $new.assignments.Count -or $new.groups.Count -or $new.roster.Count -ne 2){throw 'cross-class contamination'}
$x.roster[1].id='s1';$bad=$false;try{$null=Merge-TTManagerRoster $x $old}catch{$bad=$true};if(!$bad){throw 'duplicate id accepted'}
Write-Host 'PASS roster-only same-class geometry, removed students, cross-class isolation, strict projection'
