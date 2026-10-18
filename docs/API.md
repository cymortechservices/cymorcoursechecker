# API (`/api/v1`)
Responses: `{ success: true, data }` or `{ success: false, error: { code, message, details? } }`.

## Public
| Method | Path | Notes |
|---|---|---|
| GET | `/health` | 200 ok / 503 degraded |
| GET | `/subjects` | catalogue, grades |
| GET | `/metadata` | dataset version, sources, cutoff years, methodology |
| POST | `/checker/validate` | `{grades:[{subject,grade}]}` |
| POST | `/checker/results` | body: `candidate`, `grades`, `preferences`, `cutoffPolicy`, `page`, `pageSize`. Returns `reportId` + one-time `accessToken` |
| GET | `/results/:reportId` | header `X-Report-Token`; query `page,pageSize,q,institution,competitiveness,sort,order` (default sort `cutoff desc`) |
| GET | `/results/:reportId/choices` | six application choices |
| POST | `/reports/:reportId/pdf` | header `X-Report-Token`; returns the PDF |
| GET | `/institutions`, `/cutoff-years`, `/programmes`, `/programmes/:code` | reference data |

Tokens are **only** accepted in headers.

## Admin (Bearer JWT, `Authorization` header)
`POST /admin/login`, `POST /admin/import?dryRun=true|false` (multipart `clusterPdf`, `cutoffPdf`), `GET /admin/datasets`, `GET /admin/datasets/:v`, `GET /admin/datasets/:v/review`, `POST /admin/datasets/:v/corrections`, `POST /admin/datasets/:v/activate`, `POST /admin/rollback`, `GET /admin/audit`.
