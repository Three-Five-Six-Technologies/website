// POST /api/contact — receives the website contact form and emails it to the
// right shared mailbox through Microsoft Graph, using the function app's own
// managed identity (no secrets). Exchange RBAC limits that identity to sending
// from sales@ and support@ only.
const { app } = require('@azure/functions');

const DOMAIN = 'threefivesixtech.com';
const SALES = `sales@${DOMAIN}`;
const SUPPORT = `support@${DOMAIN}`;

// The browser sends a topic key; only these keys are accepted, and the server
// alone decides which mailbox it goes to.
const TOPICS = {
  project: { label: 'New project', to: SALES },
  setup: { label: 'Consulting & setup', to: SALES },
  extension: { label: 'Custom extension', to: SALES },
  reporting: { label: 'Reporting & insights', to: SALES },
  telemetry: { label: 'Telemetry app early access', to: SALES },
  support: { label: 'Support request', to: SUPPORT },
  other: { label: 'General question', to: SALES },
};

const ALLOWED_ORIGINS = [`https://${DOMAIN}`, `https://www.${DOMAIN}`];
const EMAIL_RE = /^[^\s@<>"]{1,64}@[^\s@<>"]{1,255}\.[a-z]{2,}$/i;

const clean = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const esc = (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

async function graphToken() {
  const url = `${process.env.IDENTITY_ENDPOINT}?resource=https://graph.microsoft.com&api-version=2019-08-01`;
  const res = await fetch(url, { headers: { 'X-IDENTITY-HEADER': process.env.IDENTITY_HEADER } });
  if (!res.ok) throw new Error(`Managed identity token failed: ${res.status}`);
  return (await res.json()).access_token;
}

app.http('contact', {
  methods: ['POST'],
  authLevel: 'anonymous',
  handler: async (request, context) => {
    const reply = (status, body) => ({ status, jsonBody: body });

    const origin = request.headers.get('origin') || '';
    if (process.env.ALLOW_ANY_ORIGIN !== 'true' && !ALLOWED_ORIGINS.includes(origin)) {
      return reply(403, { ok: false, error: 'Forbidden' });
    }

    let data;
    try { data = await request.json(); } catch { return reply(400, { ok: false, error: 'Bad request' }); }

    // Bot traps: a hidden field people never fill in, and a minimum time on the form.
    if (clean(data.website, 200)) return reply(200, { ok: true });
    if (Number(data.elapsed) > 0 && Number(data.elapsed) < 2500) return reply(200, { ok: true });

    const name = clean(data.name, 120);
    const email = clean(data.email, 254);
    const company = clean(data.company, 160);
    const message = clean(data.message, 5000);
    const topic = TOPICS[data.topic] || TOPICS.other;

    if (!EMAIL_RE.test(email)) return reply(400, { ok: false, error: 'Please enter a valid email address.' });

    const who = name || email;
    const rows = [
      ['Name', name || '—'],
      ['Email', email],
      ['Company', company || '—'],
      ['Topic', topic.label],
    ].map(([k, v]) => `<tr><td style="padding:4px 16px 4px 0;color:#6b7a8f">${k}</td><td style="padding:4px 0">${esc(v)}</td></tr>`).join('');
    const html = `<div style="font-family:Segoe UI,Arial,sans-serif;font-size:14px;color:#0f1b2d">
<p style="margin:0 0 12px">New message from the website contact form.</p>
<table style="border-collapse:collapse;margin-bottom:16px">${rows}</table>
<div style="white-space:pre-wrap;border-left:3px solid #12b886;padding:8px 12px;background:#f7f8fa">${message ? esc(message) : '<i>(no message)</i>'}</div>
<p style="margin:16px 0 0;color:#6b7a8f;font-size:12px">Hit Reply to answer ${esc(who)} directly.</p></div>`;

    const mail = {
      message: {
        subject: `Website: ${topic.label} from ${who}`,
        body: { contentType: 'HTML', content: html },
        toRecipients: [{ emailAddress: { address: topic.to } }],
        replyTo: [{ emailAddress: { address: email, name: name || undefined } }],
      },
      saveToSentItems: false,
    };

    try {
      const token = await graphToken();
      const res = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(topic.to)}/sendMail`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(mail),
      });
      if (!res.ok) {
        context.error(`Graph sendMail failed ${res.status}: ${await res.text()}`);
        return reply(502, { ok: false, error: 'Could not send right now.' });
      }
    } catch (err) {
      context.error(err);
      return reply(502, { ok: false, error: 'Could not send right now.' });
    }

    context.log(`Contact form sent to ${topic.to} (${topic.label})`);
    return reply(200, { ok: true });
  },
});
