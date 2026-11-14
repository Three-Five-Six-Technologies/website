#!/usr/bin/env bash
# One-time Azure setup for the threefivesixtech.com contact form.
# Run in Azure Cloud Shell (Bash) at https://shell.azure.com, signed in to the
# Three Five Six business tenant. Safe to re-run: it skips anything that exists.
#
# Creates, in resource group rg-website (West US 2):
#   - func-threefivesix-contact  Flex Consumption function app (Node 22) with a
#                                system-assigned managed identity
#   - a storage account + small Application Insights for it
#   - id-github-website-deploy   identity GitHub Actions uses to deploy (OIDC,
#                                main branch of the website repo only)
# Then in Exchange Online: lets the function's identity send mail from
# sales@ and support@ only (RBAC for Applications).
set -euo pipefail

RG=rg-website
LOC=westus2
APP=func-threefivesix-contact
APPI=appi-website
DEPLOY_ID=id-github-website-deploy
REPO=Three-Five-Six-Technologies/website
SCOPE_NAME="Website contact form mailboxes"
MAILBOXES=("sales@threefivesixtech.com" "support@threefivesixtech.com")

trap 'echo -e "\n\033[1;31mSetup stopped at line $LINENO. Paste the output above to Claude.\033[0m"' ERR
say() { printf '\n\033[1;32m==> %s\033[0m\n' "$*"; }
az config set extension.use_dynamic_install=yes_without_prompt --only-show-errors >/dev/null

SUB_ID=$(az account show --query id -o tsv)
TENANT_ID=$(az account show --query tenantId -o tsv)
say "Subscription: $(az account show --query name -o tsv) ($SUB_ID)"

say "Resource group $RG"
az group create -n "$RG" -l "$LOC" --only-show-errors -o none

say "Storage account"
SA=$(az storage account list -g "$RG" --query "[0].name" -o tsv)
if [ -z "$SA" ]; then
  SA="st356web$(openssl rand -hex 3)"
  az storage account create -n "$SA" -g "$RG" -l "$LOC" --sku Standard_LRS \
    --allow-blob-public-access false --min-tls-version TLS1_2 --only-show-errors -o none
fi
echo "  $SA"

say "Application Insights $APPI (1 GB/day cap)"
if ! az monitor app-insights component show -a "$APPI" -g "$RG" -o none 2>/dev/null; then
  az monitor app-insights component create -a "$APPI" -g "$RG" -l "$LOC" --only-show-errors -o none
fi
az monitor app-insights component billing update -a "$APPI" -g "$RG" --cap 1 --only-show-errors -o none || true

say "Function app $APP (Flex Consumption, Node 22)"
if ! az functionapp show -n "$APP" -g "$RG" -o none 2>/dev/null; then
  az functionapp create -n "$APP" -g "$RG" --storage-account "$SA" \
    --flexconsumption-location "$LOC" --runtime node --runtime-version 22 \
    --instance-memory 512 --app-insights "$APPI" --only-show-errors -o none
fi
APP_RES_ID=$(az functionapp show -n "$APP" -g "$RG" --query id -o tsv)
HOST=$(az functionapp show -n "$APP" -g "$RG" --query defaultHostName -o tsv)

say "Managed identity for sending mail"
MI_OBJECT_ID=$(az functionapp identity assign -n "$APP" -g "$RG" --query principalId -o tsv)
MI_APP_ID=""
for i in 1 2 3 4 5 6 7 8 9 10 11 12; do
  MI_APP_ID=$(az ad sp show --id "$MI_OBJECT_ID" --query appId -o tsv 2>/dev/null || true)
  [ -n "$MI_APP_ID" ] && break; sleep 10
done
[ -n "$MI_APP_ID" ] || { echo "Managed identity not visible in Entra yet; re-run the script in a minute."; exit 1; }
echo "  objectId $MI_OBJECT_ID  appId $MI_APP_ID"

say "CORS: only the website may call it"
az functionapp cors add -n "$APP" -g "$RG" \
  --allowed-origins https://threefivesixtech.com https://www.threefivesixtech.com --only-show-errors -o none || true

say "Deploy identity for GitHub Actions ($REPO, main branch only)"
if ! az identity show -n "$DEPLOY_ID" -g "$RG" -o none 2>/dev/null; then
  az identity create -n "$DEPLOY_ID" -g "$RG" -l "$LOC" --only-show-errors -o none
fi
DEPLOY_CLIENT_ID=$(az identity show -n "$DEPLOY_ID" -g "$RG" --query clientId -o tsv)
DEPLOY_PRINCIPAL_ID=$(az identity show -n "$DEPLOY_ID" -g "$RG" --query principalId -o tsv)
if ! az identity federated-credential show -n github-main --identity-name "$DEPLOY_ID" -g "$RG" -o none 2>/dev/null; then
  az identity federated-credential create -n github-main --identity-name "$DEPLOY_ID" -g "$RG" \
    --issuer https://token.actions.githubusercontent.com \
    --subject "repo:$REPO:ref:refs/heads/main" \
    --audiences api://AzureADTokenExchange --only-show-errors -o none
fi
sleep 15
az role assignment create --assignee-object-id "$DEPLOY_PRINCIPAL_ID" --assignee-principal-type ServicePrincipal \
  --role "Website Contributor" --scope "$APP_RES_ID" --only-show-errors -o none 2>/dev/null || true

say "Exchange Online: allow sending from ${MAILBOXES[*]} only"
echo "  You'll be asked to sign in once more (device code) as an Exchange admin."
FILTER=""
for m in "${MAILBOXES[@]}"; do FILTER="${FILTER:+$FILTER -or }PrimarySmtpAddress -eq '$m'"; done
cat > /tmp/exo-rbac.ps1 <<PS
\$ErrorActionPreference = 'Stop'
Connect-ExchangeOnline -ShowBanner:\$false
if (-not (Get-ServicePrincipal -Identity '$MI_APP_ID' -ErrorAction SilentlyContinue)) {
  New-ServicePrincipal -AppId '$MI_APP_ID' -ObjectId '$MI_OBJECT_ID' -DisplayName '$APP' | Out-Null
}
if (-not (Get-ManagementScope -Identity '$SCOPE_NAME' -ErrorAction SilentlyContinue)) {
  New-ManagementScope -Name '$SCOPE_NAME' -RecipientRestrictionFilter "$FILTER" | Out-Null
}
\$existing = Get-ManagementRoleAssignment -RoleAssignee '$MI_APP_ID' -Role 'Application Mail.Send' -ErrorAction SilentlyContinue
if (-not \$existing) {
  New-ManagementRoleAssignment -App '$MI_APP_ID' -Role 'Application Mail.Send' -CustomResourceScope '$SCOPE_NAME' | Out-Null
}
Write-Host '  Exchange permission in place (can take 30 min to 2 hours to start working).'
Disconnect-ExchangeOnline -Confirm:\$false
PS
pwsh -NoLogo -NoProfile -File /tmp/exo-rbac.ps1

say "Done. Copy everything between the lines back to Claude:"
cat <<OUT
------------------------------------------------------------
AZURE_CLIENT_ID=$DEPLOY_CLIENT_ID
AZURE_TENANT_ID=$TENANT_ID
AZURE_SUBSCRIPTION_ID=$SUB_ID
FUNCTION_HOST=$HOST
------------------------------------------------------------
OUT
