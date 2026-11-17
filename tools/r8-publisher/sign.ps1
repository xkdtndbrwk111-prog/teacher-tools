param([Parameter(Mandatory=$true)][string]$Payload,[Parameter(Mandatory=$true)][string]$Output)
$ErrorActionPreference='Stop'
$cert=$null;$private=$null;$public=$null;$bytes=$null
try{
 if([string]::IsNullOrWhiteSpace($env:TT_PFX) -or [string]::IsNullOrEmpty($env:TT_PASSWORD)){throw 'Missing signing secrets'}
 $bytes=[Convert]::FromBase64String($env:TT_PFX)
 $cert=[Security.Cryptography.X509Certificates.X509Certificate2]::new($bytes,$env:TT_PASSWORD,[Security.Cryptography.X509Certificates.X509KeyStorageFlags]::EphemeralKeySet)
 if($cert.GetCertHashString([Security.Cryptography.HashAlgorithmName]::SHA256).ToLowerInvariant() -cne '0e0e1b970de3d8e16c721ea170f947f9d0cfcda34eca24e8a324ba29b55497cd' -or -not $cert.HasPrivateKey){throw 'Unexpected certificate'}
 $private=[Security.Cryptography.X509Certificates.RSACertificateExtensions]::GetRSAPrivateKey($cert)
 $public=[Security.Cryptography.X509Certificates.RSACertificateExtensions]::GetRSAPublicKey($cert)
 $p=$public.ExportParameters($false)
 [xml]$expected=[IO.File]::ReadAllText((Join-Path $PSScriptRoot 'public-key.xml'))
 if($private.KeySize -ne 2048 -or [Convert]::ToBase64String($p.Modulus) -cne $expected.RSAKeyValue.Modulus -or [Convert]::ToBase64String($p.Exponent) -cne $expected.RSAKeyValue.Exponent){throw 'Public key mismatch'}
 $raw=[IO.File]::ReadAllBytes($Payload)
 if($raw.Length -lt 1 -or $raw.Length -gt 262144){throw 'Invalid payload size'}
 $hash=[Security.Cryptography.HashAlgorithmName]::SHA256;$padding=[Security.Cryptography.RSASignaturePadding]::Pkcs1
 $sig=$private.SignData($raw,$hash,$padding)
 if($sig.Length -ne 256 -or -not $public.VerifyData($raw,$sig,$hash,$padding)){throw 'Signature verification failed'}
 $bad=[byte[]]$raw.Clone();$bad[0]=$bad[0] -bxor 1
 if($public.VerifyData($bad,$sig,$hash,$padding)){throw 'Tamper accepted'}
 [IO.File]::WriteAllBytes($Output,$sig)
 Write-Host 'PASS: pinned production certificate and RSA public key; signature verified and tamper rejected.'
}catch{Write-Host '::error::R8 signing failed; sensitive details suppressed.';exit 1}
finally{
 if($private){$private.Dispose()};if($public){$public.Dispose()};if($cert){$cert.Dispose()}
 if($bytes){[Array]::Clear($bytes,0,$bytes.Length)}
 Remove-Item Env:TT_PFX,Env:TT_PASSWORD -ErrorAction SilentlyContinue
}
exit 0
