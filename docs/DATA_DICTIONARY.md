# Data dictionary

| Collection | Key fields |
|---|---|
| `datasetversions` | version, contentId (SHA-256 of both PDFs), status, activeFlag (unique, sparse), previousActive, quality, sources |
| `sourcedocuments` | filename, sha256, pageCount, title/publication date **only if printed**, PDF file-metadata dates (labelled as metadata) |
| `clusters` | clusterId, slotRules[4] (what may fill each scoring slot), verificationStatus |
| `subject_requirements` | subClusterId (e.g. `2A`), slots (OR-list of subject + minimum grade), verificationStatus |
| `programmes` | programmeCode, programmeName, institutionCode/Name, clusterId, subClusterId, matchTier, verificationStatus, issues |
| `cutoffs` | programmeCode, year, raw (as printed), value, **shared** flag, sourcePage |
| `reviewitems` | programme rows that could not be mapped safely, with suggestions |
| `reports` | reportId, tokenHash, grades, policy, expiresAt (TTL index) |
| `adminusers` | email, bcrypt hash, role, failedLogins, lockedUntil |
| `audits` | actor, action, datasetVersion, details |

`verificationStatus`: `validated` (usable), `needs_review`, `rejected`. Only `validated` programmes are ever evaluated.
