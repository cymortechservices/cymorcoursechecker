# API (`/api/v1`)
Responses: `{ success: true, data }` or `{ success: false, error: { code, message, details? } }`.

## Public
| Method | Path | Notes |
|---|---|---|
| GET | `/health` | 200 ok / 503 degraded |
| GET | `/subjects` | catalogue, grades |
| GET | `/metadata` | dataset version, sources, cutoff years, methodology |
| POST | `/checker/validate` | `{grades:[{subject,grade}]}` |
| POST | `/checker/results` | body: `email` (required), `candidate`, `grades`, `preferences`, `cutoffPolicy`. Returns `reportId`, one-time `accessToken` and a free **teaser** (counts only) |
| GET | `/results/:reportId/summary` | header `X-Report-Token`; teaser + payment state (allowed before payment) |
| GET | `/pricing` | price and support contacts |
| POST | `/payments/:reportId/quote` | header `X-Report-Token`; body `couponCode?`; returns price after discount |
| POST | `/payments/:reportId/pay` | body `phone?`, `couponCode?`; starts an STK push (or unlocks with a 100% coupon) |
| GET | `/payments/:reportId/status` | polled by the browser; falls back to an STK query |
| POST | `/payments/mpesa/callback/:secret` | Safaricom callback (secret in path); always acknowledged |
| POST | `/reports/:reportId/email` | re-send the report email (paid only) |
| GET | `/programme-names?q=` | suggestions for the optional preferred-courses field |

Results, choices and the PDF return **402 PAYMENT_REQUIRED** until the order is paid.
| GET | `/results/:reportId` | header `X-Report-Token`; query `page,pageSize,q,institution,competitiveness,sort,order` (default sort `cutoff desc`) |
| GET | `/results/:reportId/choices` | six application choices |
| POST | `/reports/:reportId/pdf` | header `X-Report-Token`; returns the PDF |
| GET | `/institutions`, `/cutoff-years`, `/programmes`, `/programmes/:code` | reference data |

Tokens are **only** accepted in headers.

## Admin (Bearer JWT, `Authorization` header)
`GET /admin/stats`, `GET /admin/orders` (`status,q,limit,skip`), `GET /admin/orders.csv`, `POST /admin/orders/:reportId/resend`, `GET/POST /admin/coupons`, `POST /admin/coupons/:code/active` (reviewers read-only).

`POST /admin/login`, `POST /admin/import?dryRun=true|false` (multipart `clusterPdf`, `cutoffPdf`), `GET /admin/datasets`, `GET /admin/datasets/:v`, `GET /admin/datasets/:v/review`, `POST /admin/datasets/:v/corrections`, `POST /admin/datasets/:v/activate`, `POST /admin/rollback`, `GET /admin/audit`.
