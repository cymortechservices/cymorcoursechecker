# Privacy

- No accounts for candidates. Optional name/reference appear only on the PDF.
- Stored per report: grades, policy, dataset version, optional name/reference, token **hash**. TTL (default 30 days, `REPORT_TTL_DAYS`) deletes it automatically.
- Report IDs are 128-bit random; access also needs a 192-bit token sent in a header, kept by the browser in `sessionStorage` only.
- IP addresses are not stored in reports; request logs hold method, path (IDs masked), status, duration - no bodies, headers or query strings.
- PDFs are generated on demand and not stored.
- Admin: bcrypt-hashed passwords, no default accounts, lockout after 5 failures, JWT in header only, all admin actions audited.
- No secrets or candidate data are in the repository; `.env` is git-ignored.


## Emails, payments and orders
- An email address is required so the report can be sent; it is stored on the order and used only to send the report and for support.
- Payment: only a masked phone number (e.g. 2547******78), amount, M-Pesa receipt and status are stored. Full numbers are never stored or logged. M-Pesa credentials live only in environment variables.
- Reports (grades) expire after `REPORT_TTL_DAYS`. Orders (email, amount, receipt, status, no grades) are kept for accounting and the dashboard.
- Contact for privacy or deletion requests: simion@karimique.com.
