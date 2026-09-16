export interface Repository {
  initialize(): Promise<void>;
  list<T>(tenant: string, kind: string): Promise<T[]>;
  get<T>(tenant: string, kind: string, id: string): Promise<T>;
  save(tenant: string, kind: string, id: string, version: number, body: unknown, expected?: number): Promise<void>;
  delete(tenant: string, kind: string, id: string, expected: number): Promise<void>;
  seed(tenant: string, language?: string): Promise<void>;
}
