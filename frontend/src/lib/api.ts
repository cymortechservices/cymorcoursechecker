/** Typed API client. Report access tokens travel in the X-Report-Token header, never in URLs. */
/**
 * API base URL. Tolerant of the common misconfigurations that cause "Route not found":
 * a missing "/api/v1" suffix, a trailing slash, or a missing protocol.
 */
function normaliseBase(raw: string | undefined): string {
  let b = (raw ?? '').trim();
  if (!b) return 'http://localhost:4000/api/v1';
  if (!/^https?:\/\//i.test(b)) b = `https://${b}`;
  b = b.replace(/\/+$/, '');
  if (!/\/api\/v1$/i.test(b)) b = `${b.replace(/\/api$/i, '')}/api/v1`;
  return b;
}
export const API_BASE = normaliseBase(import.meta.env.VITE_API_BASE_URL as string | undefined);
const BASE = API_BASE;

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: unknown) {
    super(message);
  }
}

async function call<T>(path: string, init: RequestInit = {}, token?: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...(token ? { 'X-Report-Token': token } : {}), ...(init.headers ?? {}) },
    });
  } catch {
    throw new ApiError(0, 'NETWORK', 'Could not reach the server. Check your internet connection and try again.');
  }
  if (!res.ok) {
    let body: { error?: { code?: string; message?: string; details?: unknown } } = {};
    try { body = await res.json(); } catch { /* not JSON */ }
    const hint = res.status === 404 && (body.error?.code === 'NOT_FOUND' || !body.error) ? ' The website could not find the API. Check that VITE_API_BASE_URL points to your Render service.' : '';
    throw new ApiError(res.status, body.error?.code ?? 'ERROR', (body.error?.message ?? 'Something went wrong.') + hint, body.error?.details);
  }
  return ((await res.json()) as { data: T }).data;
}

export interface SubjectInfo { code: string; name: string; group: string; compulsory?: boolean }
export interface PublicOption {
  programmeCode: string; programmeName: string; institutionCode: string; institutionName: string;
  score: number; scoreDisplay: string; cutoff: string; cutoffYear: number; cutoffBasis: 'programme-specific' | 'shared-minimum';
  margin: number; marginDisplay: string;
}
export interface Page { total: number; page: number; pageSize: number; totalPages: number; items: PublicOption[] }
export interface Summary { qualifyingOptions: number; aggregatePoints: number; estimatedMeanGrade: string | null; sharedCutoffOptions: number; cutoffYearsUsed: Record<string, number>; datasetVersion: string }
export interface ChoiceRow { choice: string; option: (PublicOption & { cutoffIsShared?: boolean }) | null }
export interface Choices { mode: 'preferences' | 'suggested'; rows: ChoiceRow[]; notes: string[]; method: string }
export interface RunResult { reportId: string; accessToken: string; expiresAt: string; warnings: string[]; summary: Summary; results: Page; cutoffPolicy: string }

export interface ResultsQuery { page: number; pageSize: number; q?: string; competitiveness?: string; sort: string; order: 'asc' | 'desc' }

export const api = {
  subjects: () => call<{ grades: { grade: string; points: number }[]; subjects: SubjectInfo[] }>('/subjects'),
  metadata: () => call<{ datasetVersion: string; cutoffYears: number[]; reportRetentionDays: number }>('/metadata'),
  validate: (grades: { subject: string; grade: string }[]) => call<{ valid: boolean; errors: string[]; warnings: string[] }>('/checker/validate', { method: 'POST', body: JSON.stringify({ grades }) }),
  run: (body: unknown) => call<RunResult>('/checker/results', { method: 'POST', body: JSON.stringify(body) }),
  results: (id: string, token: string, q: ResultsQuery) => {
    const p = new URLSearchParams({ page: String(q.page), pageSize: String(q.pageSize), sort: q.sort, order: q.order });
    if (q.q) p.set('q', q.q);
    if (q.competitiveness) p.set('competitiveness', q.competitiveness);
    return call<{ summary: Summary; results: Page }>(`/results/${encodeURIComponent(id)}?${p}`, {}, token);
  },
  choices: (id: string, token: string) => call<Choices>(`/results/${encodeURIComponent(id)}/choices`, {}, token),
  async pdf(id: string, token: string): Promise<Blob> {
    let res: Response;
    try { res = await fetch(`${BASE}/reports/${encodeURIComponent(id)}/pdf`, { method: 'POST', headers: { 'X-Report-Token': token } }); }
    catch { throw new ApiError(0, 'NETWORK', 'Could not reach the server.'); }
    if (!res.ok) throw new ApiError(res.status, 'PDF', res.status === 429 ? 'Too many downloads. Please wait a few minutes.' : 'The PDF could not be generated. Please try again.');
    return res.blob();
  },
};

/** Report credentials live only for this browser tab (sessionStorage). */
const KEY = 'cymor-report';
export const session = {
  save(v: { reportId: string; token: string }) { try { sessionStorage.setItem(KEY, JSON.stringify(v)); } catch { /* storage unavailable */ } },
  load(): { reportId: string; token: string } | null { try { const r = sessionStorage.getItem(KEY); return r ? JSON.parse(r) : null; } catch { return null; } },
  clear() { try { sessionStorage.removeItem(KEY); } catch { /* ignore */ } },
};
