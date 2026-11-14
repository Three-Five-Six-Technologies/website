# Exchange Online part of the contact form setup. Run in Azure Cloud Shell (PowerShell).
$ErrorActionPreference = 'Stop'
$appId = '0318ad4c-dc01-4e6b-9863-f33b5f4fdb16'   # func-threefivesix-contact managed identity
$objId = '15ecf42a-604b-4766-b26d-5b9e6c9161d0'
$scope = 'Website contact form mailboxes'
$filter = "PrimarySmtpAddress -eq 'sales@threefivesixtech.com' -or PrimarySmtpAddress -eq 'support@threefivesixtech.com'"

Write-Host "`n==> Connecting to Exchange Online" -ForegroundColor Green
Connect-ExchangeOnline -ShowBanner:$false

Write-Host "==> Registering the function's identity with Exchange" -ForegroundColor Green
if (-not (Get-ServicePrincipal -Identity $appId -ErrorAction SilentlyContinue)) {
  New-ServicePrincipal -AppId $appId -ObjectId $objId -DisplayName 'func-threefivesix-contact' | Out-Null
}
Write-Host "==> Limiting it to sales@ and support@" -ForegroundColor Green
if (-not (Get-ManagementScope -Identity $scope -ErrorAction SilentlyContinue)) {
  New-ManagementScope -Name $scope -RecipientRestrictionFilter $filter | Out-Null
}
if (-not (Get-ManagementRoleAssignment -RoleAssignee $appId -Role 'Application Mail.Send' -ErrorAction SilentlyContinue)) {
  New-ManagementRoleAssignment -App $appId -Role 'Application Mail.Send' -CustomResourceScope $scope | Out-Null
}
Get-ManagementRoleAssignment -RoleAssignee $appId | Format-Table Name, Role, CustomResourceScope

Write-Host "==> Done. Copy everything between the lines back to Claude:" -ForegroundColor Green
'------------------------------------------------------------'
"AZURE_CLIENT_ID=$(az identity show -n id-github-website-deploy -g rg-website --query clientId -o tsv)"
"AZURE_TENANT_ID=$(az account show --query tenantId -o tsv)"
"AZURE_SUBSCRIPTION_ID=$(az account show --query id -o tsv)"
"FUNCTION_HOST=$(az functionapp show -n func-threefivesix-contact -g rg-website --query defaultHostName -o tsv)"
'------------------------------------------------------------'
