# TGM Check-in

A visitor-management portal for companies. Visitors scan one reusable reception QR code, enter their contact details, choose the employee they are visiting, and give a reason for their visit. Their arrival waits for an administrator to approve it; approval checks them in and emails the selected host.

## Get started

Install dependencies and start the development server:

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Without Supabase credentials, the portal opens in **demo mode**. Sample visits and reception settings are saved in this browser. Try the visitor flow from **Show QR code**, or add a visitor from the reception dashboard.

## Supabase setup

1. Create a Supabase project and copy `.env.example` to `.env.local`.
2. Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` to your project URL and publishable anon key.
3. Apply both migrations in `supabase/migrations/` using the Supabase SQL editor or your migration workflow, in filename order.
4. Enable email/password authentication in Supabase Auth. Company administrators create an account or sign in from the portal.
5. Create a Resend account, verify a sender domain/address, and set `RESEND_API_KEY` and `RESEND_FROM_EMAIL` in the server environment. Do not prefix these values with `NEXT_PUBLIC_`.
6. Restart the development server after changing environment variables.

Visitor records are protected by row-level security and belong to the company administrator. A company-specific reception QR token routes visitors to a public check-in form. Narrow `SECURITY DEFINER` functions validate that QR token and record the visit without exposing private visitor records. Keep the anon key public and never put a Supabase service-role key in a browser environment variable.

Add employee names and work email addresses under **Settings → Employee host directory**. The public QR form exposes employee names only, never their email addresses. An administrator approves arrivals from the visitor log; the server-side approval endpoint then emails the selected employee through Resend. If email delivery fails after approval, the administrator can retry it from the visitor row. Demo mode supports the approval flow locally but never sends real email.

## Features

- Daily reception dashboard showing today's visitors, visitors currently on site, and completed visits.
- Reusable company reception QR code and mobile visitor request form.
- Visitor name, email, company, employee host, and visit purpose.
- Admin approval queue, host email notifications, visitor log, status filters, and manual check-in/check-out.
- Employee directory with host names and work email addresses.
- Today's arrival chart, attendance status, and visits-by-host report.
- Supabase Auth, owner-scoped Postgres storage, and Realtime dashboard updates.
- Browser-local demo mode when Supabase is not configured.
