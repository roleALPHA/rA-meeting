export type Job = { id: string; tenant: string; meeting: string; kind: string; attempts: number };
export interface Repository {
  readonly external: boolean;
  initialize(): Promise<void>;
  list<T>(tenant: string, kind: string): Promise<T[]>;
  get<T>(tenant: string, kind: string, id: string): Promise<T>;
  save(tenant: string, kind: string, id: string, version: number, body: unknown, expected?: number): Promise<void>;
  delete(tenant: string, kind: string, id: string, expected: number): Promise<void>;
  seed(tenant: string, language?: string): Promise<void>;
  enqueue(id: string, tenant: string, meeting: string, kind: string, payload: unknown): Promise<void>;
  claimJob(): Promise<Job | undefined>;
  finishJob(id: string): Promise<void>;
  failJob(job: Job, error: string): Promise<boolean>;
  close(): Promise<void>;
}
