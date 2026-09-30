param(
  [Parameter(Mandatory = $true, ValueFromRemainingArguments = $true)]
  [string[]]$Paths
)

$failed = $false
foreach ($filePath in $Paths) {
  $resolved = (Resolve-Path -LiteralPath $filePath -ErrorAction Stop).Path
  $signature = Get-AuthenticodeSignature -LiteralPath $resolved
  [pscustomobject]@{
    Path = $resolved
    Status = $signature.Status
    Signer = $signature.SignerCertificate.Subject
    Timestamp = $signature.TimeStamperCertificate.Subject
  } | Format-List
  if ($signature.Status -ne 'Valid') { $failed = $true }
}

if ($failed) { throw 'One or more Field Kit release files do not have a valid Authenticode signature.' }
