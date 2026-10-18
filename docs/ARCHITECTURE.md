# Architecture

```
Browser (React/Vite on Vercel)  --HTTPS-->  Express API (Render)  -->  MongoDB Atlas
```

## Backend layers (`backend/src`)
| Layer | Folder | Rule |
|---|---|---|
| HTTP | `http/` | validation (zod), auth, rate limits, no business logic |
| Services | `services/` | orchestration + access control (`CheckerService`, `AdminService`, `DatasetCache`) |
| Domain | `modules/` | pure functions: scoring, requirements grammar, eligibility, cutoff policy, recommendations, PDF import, report PDF |
| Storage | `repositories/` | interfaces (`types.ts`) + MongoDB implementation (`mongo.repository.ts`) |

Domain modules never touch HTTP or the database, which is why they are tested without either.

## Request flow (check)
1. `POST /checker/results` validates grades, loads the **active** dataset (cached), runs `evaluateCandidate`.
2. A report row (grades + policy + dataset version, token **hash**) is stored with a TTL.
3. Results/PDF are recomputed from the stored grades against the **same dataset version**, so a later activation never changes an existing report.

## Dataset lifecycle
`draft -> active -> archived` (`failed` for broken imports). A unique sparse `activeFlag` guarantees one active dataset. Corrections only on drafts. Activation passes a readiness gate. Rollback re-activates the previous version.
