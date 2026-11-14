# Contact form API

The website's "Send message" form posts to an Azure Function, which emails the
message to sales@ or support@ (support topic goes to support@, everything else
to sales@). Hitting **Reply** on that email answers the customer directly.

- Code: `src/functions/contact.js`
- Deploys automatically: any push to `main` that touches `api/` runs
  `.github/workflows/deploy-api.yml`. Nothing to install locally; edit on
  github.com or any computer and merge.
- Azure: resource group `rg-website` (West US 2), function app
  `func-threefivesix-contact` on the Flex Consumption plan, logs in
  Application Insights `appi-website`.
- Sending uses the function app's managed identity through Microsoft Graph.
  Exchange Online RBAC limits it to sending from sales@ and support@ only.
  No passwords or secrets are stored anywhere.
- One-time setup (already done once): `setup/setup.sh` in Azure Cloud Shell.
  Safe to re-run.

To change where a topic goes, edit `TOPICS` in `contact.js`. To add another
sending mailbox, add it to the Exchange scope "Website contact form mailboxes"
(and to `MAILBOXES` in `setup/setup.sh`).
