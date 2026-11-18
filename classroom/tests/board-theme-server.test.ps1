$ErrorActionPreference='Stop'
$server=Join-Path $PSScriptRoot '../../runtime-src/system/server.ps1'
$tokens=$null;$errors=$null
$ast=[System.Management.Automation.Language.Parser]::ParseFile($server,[ref]$tokens,[ref]$errors)
if($errors.Count){throw ($errors|Out-String)}
$fun=$ast.Find({param($n) $n -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -eq 'ConvertTo-TTBoardTheme'},$true)
if(!$fun){throw 'missing theme validator'}
. ([scriptblock]::Create($fun.Extent.Text))
$theme=ConvertTo-TTBoardTheme (ConvertFrom-Json '{"version":1,"theme":"custom","font":"Malgun Gothic","custom":{"bg":"#112233","panel":"#222222","text":"#FFFFFF","accent":"#556677","modal":"#333333","private":"x"},"secret":"x"}')
if($theme.custom.text -cne '#ffffff' -or $theme.Contains('secret') -or $theme.custom.Contains('private')){throw 'projection failed'}
foreach($invalid in @('{"version":2,"theme":"dark","font":""}','{"version":1,"theme":"dark","font":"bad;css"}','{"version":1,"theme":"custom","font":"","custom":{"bg":"red"}}')){
 $rejected=$false;try{$null=ConvertTo-TTBoardTheme (ConvertFrom-Json $invalid)}catch{$rejected=$true}
 if(!$rejected){throw 'accepted invalid payload'}
}
Write-Host 'PASS PowerShell parser and strict theme projection'
