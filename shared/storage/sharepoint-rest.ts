import { AppError, assert } from '../model.js';
import type { Repository } from './repository.js';
import { seedTemplates } from '../templates.js';
export type SPRequest = (path: string, init?: RequestInit) => Promise<Response>;
export const recordListTitle = 'rA Meetings Browser Index';
export const dataLibraryTitle = 'rA Meetings Browser Data';
const guid = (s: string) => {
  assert(/^[\da-f-]{36}$/i.test(s), 'error.sharepointRest.invalidId');
  return s;
};
const quote = (s: string) => s.replaceAll("'", "''");
type Row = {
  Id: number;
  RecordKey: string;
  RecordId: string;
  RecordKind: string;
  RecordVersion: number;
  PayloadId: string;
  'odata.etag'?: string;
  '@odata.etag'?: string;
};
type LibraryFile = {
  Id: number;
  UniqueId: string;
  FileLeafRef: string;
  Created: string;
  File?: { Length?: number | string };
};
export type OrphanFile = { id: string; name: string; created: string; size: number };
const orphanMinAge = 24 * 60 * 60 * 1000;
const recordSegment = (value: string) => {
  assert(/^[A-Za-z0-9.-]{1,120}$/.test(value), 'error.sharepointRest.invalidRecordIdentifier');
  return value;
};
/** Content file name: record kind, record ID and version identify superseded or interrupted writes later. */
export const payloadName = (kind: string, id: string, version: number) =>
  `${recordSegment(kind)}__${recordSegment(id)}__v${version}__${crypto.randomUUID()}.json`;
const payloadPattern = /^([A-Za-z0-9.-]+)__([A-Za-z0-9.-]+)__v(\d+)__[0-9a-f-]{36}\.json$/i;
export type WorkspaceAccess = { write: boolean; provision: boolean };
export async function spJson<T>(request: SPRequest, path: string, init?: RequestInit): Promise<T> {
  const r = await request(path, init);
  if (r.status === 409 || r.status === 412) throw new AppError(409, 'error.sharepointRest.recordHasChangedPlease');
  if (r.status === 404) throw new AppError(404, 'error.sharepointRest.recordFound');
  if (r.status === 401 || r.status === 403) throw new AppError(403, 'error.runtime.permissionSharepointWorkspace');
  assert(r.ok, 'error.sharepointRest.http', 502, { status: r.status });
  return r.status === 204 ? (undefined as T) : ((await r.json()) as T);
}
export async function workspaceAccess(request: SPRequest): Promise<WorkspaceAccess> {
  const response = await spJson<{ EffectiveBasePermissions?: { Low: string }; Low?: string }>(
    request,
    '/web/EffectiveBasePermissions',
  );
  const low = Number(response.EffectiveBasePermissions?.Low ?? response.Low ?? '0') >>> 0;
  return { write: (low & 14) === 14, provision: (low & 2048) === 2048 };
}
const jsonHeaders = { 'Content-Type': 'application/json;odata=nometadata' };
/** Only a site owner/admin calls this explicit first-run action. All ACLs inherit from the selected workspace. */
export async function provisionWorkspace(request: SPRequest) {
  assert((await workspaceAccess(request)).provision, 'error.sharepointRest.onlySharepointAdministrationCan', 403);
  for (const [title, template] of [
    [recordListTitle, 100],
    [dataLibraryTitle, 101],
  ] as const) {
    let list: { Id: string };
    try {
      list = await spJson(request, `/web/lists/getbytitle('${quote(title)}')?$select=Id`);
    } catch (e) {
      if (!(e instanceof AppError && e.status === 404)) throw e;
      list = await spJson(request, '/web/lists', {
        method: 'POST',
        headers: jsonHeaders,
        body: JSON.stringify({
          Title: title,
          BaseTemplate: template,
          Description: 'roleALPHA Meetings – Arbeitsbereich',
        }),
      });
    }
    const path = `/web/lists(guid'${guid(list.Id)}')`;
    // Library versioning is additional to immutable snapshots; never loosen inherited ACLs.
    await spJson(request, path, {
      method: 'POST',
      headers: { ...jsonHeaders, 'X-HTTP-Method': 'MERGE', 'IF-MATCH': '*' },
      body: JSON.stringify({ EnableVersioning: true }),
    });
    if (template === 100) {
      const fields = await spJson<{ value: { InternalName: string }[] }>(
        request,
        path + '/fields?$select=InternalName',
      );
      for (const name of ['RecordKey', 'RecordKind', 'RecordId', 'RecordVersion', 'PayloadId'])
        if (!fields.value.some(f => f.InternalName === name)) {
          const xml = `<Field Type="${name === 'RecordVersion' ? 'Number' : 'Text'}" Name="${name}" StaticName="${name}" DisplayName="${name}" ${name === 'RecordKey' ? 'Indexed="TRUE" EnforceUniqueValues="TRUE"' : name === 'RecordKind' ? 'Indexed="TRUE"' : ''} />`;
          await spJson(request, path + '/fields/createfieldasxml', {
            method: 'POST',
            headers: jsonHeaders,
            body: JSON.stringify({ parameters: { SchemaXml: xml, Options: 0 } }),
          });
        }
    }
  }
}
export class SharePointRestStore implements Repository {
  private listId = '';
  private libraryId = '';
  constructor(
    readonly tenantId: string,
    readonly webUrl: string,
    private request: SPRequest,
  ) {}
  private tenant(tenant: string) {
    assert(tenant === this.tenantId, 'error.sharepointRest.invalidTenantPermissions', 403);
  }
  private get prefix() {
    return `/web/lists(guid'${guid(this.listId)}')`;
  }
  async initialize() {
    const index = await spJson<{ Id: string }>(this.request, `/web/lists/getbytitle('${recordListTitle}')?$select=Id`);
    const library = await spJson<{ Id: string }>(
      this.request,
      `/web/lists/getbytitle('${dataLibraryTitle}')?$select=Id`,
    );
    this.listId = guid(index.Id);
    this.libraryId = guid(library.Id);
    const fields = await spJson<{ value: { InternalName: string; Indexed: boolean; EnforceUniqueValues: boolean }[] }>(
      this.request,
      this.prefix + '/fields?$select=InternalName,Indexed,EnforceUniqueValues',
    );
    assert(
      ['RecordKey', 'RecordKind', 'RecordId', 'RecordVersion', 'PayloadId'].every(n =>
        fields.value.some(f => f.InternalName === n),
      ) &&
        fields.value.some(f => f.InternalName === 'RecordKey' && f.Indexed && f.EnforceUniqueValues) &&
        fields.value.some(f => f.InternalName === 'RecordKind' && f.Indexed),
      'error.sharepointRest.sharepointWorkspaceSetUp',
      503,
    );
  }
  /** Reads all pages of a list query; continuation links must stay on the same list. */
  private async pages<T>(list: string, query: string): Promise<T[]> {
    let path: string | undefined = `${list}/items?${query}`;
    const items: T[] = [];
    const seen = new Set<string>();
    while (path) {
      assert(!seen.has(path), 'error.sharepointRest.invalidSharepointContinuationPage', 502);
      seen.add(path);
      const p: { value: T[]; 'odata.nextLink'?: string; '@odata.nextLink'?: string } = await spJson(this.request, path);
      items.push(...p.value);
      const next = p['odata.nextLink'] || p['@odata.nextLink'];
      if (!next) break;
      const u = new URL(next, this.webUrl);
      const base = new URL(this.webUrl);
      const prefix = base.pathname.replace(/\/$/, '') + '/_api';
      assert(
        u.origin === base.origin &&
          decodeURIComponent(u.pathname).toLowerCase() === (prefix + list + '/items').toLowerCase(),
        'error.sharepointRest.invalidSharepointContinuationPage',
        502,
      );
      path = u.pathname.slice(prefix.length) + u.search;
    }
    return items;
  }
  private rows(filter?: string) {
    return this.pages<Row>(
      this.prefix,
      `$select=Id,RecordKey,RecordKind,RecordId,RecordVersion,PayloadId${filter ? `&$filter=${encodeURIComponent(filter)}&$top=200` : '&$top=5000'}`,
    );
  }
  private async head(kind: string, id: string) {
    return (await this.rows(`RecordKey eq '${quote(kind + ':' + id)}'`))[0];
  }
  private async payload<T>(row: Row): Promise<T> {
    return spJson<T>(this.request, `/web/GetFileById('${guid(row.PayloadId)}')/$value`);
  }
  async list<T>(tenant: string, kind: string) {
    this.tenant(tenant);
    const rows = await this.rows(`RecordKind eq '${quote(kind)}'`);
    const data: T[] = [];
    for (let i = 0; i < rows.length; i += 6)
      data.push(...(await Promise.all(rows.slice(i, i + 6).map(row => this.payload<T>(row)))));
    return data;
  }
  async get<T>(tenant: string, kind: string, id: string) {
    this.tenant(tenant);
    const row = await this.head(kind, id);
    assert(row, 'error.sharepointRest.recordFound', 404);
    return this.payload<T>(row);
  }
  private async etag(row: Row) {
    const r = await this.request(`${this.prefix}/items(${row.Id})?$select=Id,RecordVersion`);
    assert(r.ok, 'error.sharepointRest.sharepointUnavailablePleaseTry', 502);
    const current = (await r.json()) as Row;
    assert(current.RecordVersion === row.RecordVersion, 'error.sharepointRest.recordHasChangedPlease', 409);
    const tag = r.headers.get('ETag') || current['odata.etag'] || current['@odata.etag'];
    assert(tag, 'error.sharepointRest.sharepointReturnedVersionIdentifier', 502);
    return tag;
  }
  async save(tenant: string, kind: string, id: string, version: number, body: unknown, expected?: number) {
    this.tenant(tenant);
    const old = await this.head(kind, id);
    assert(
      expected === undefined ? !old : old && old.RecordVersion === expected,
      'error.sharepointRest.recordHasChangedPlease',
      409,
    );
    const etag = old ? await this.etag(old) : undefined;
    const serialized = JSON.stringify(body);
    assert(new TextEncoder().encode(serialized).length < 20_000_000, 'error.sharepointRest.recordTooLarge', 413);
    const file = await spJson<{ UniqueId: string }>(
      this.request,
      `/web/lists(guid'${this.libraryId}')/RootFolder/Files/add(url='${payloadName(kind, id, version)}',overwrite=false)`,
      { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: serialized },
    );
    const fields = {
      Title: kind + ':' + id,
      RecordKey: kind + ':' + id,
      RecordKind: kind,
      RecordId: id,
      RecordVersion: version,
      PayloadId: guid(file.UniqueId),
    };
    try {
      await spJson(this.request, old ? `${this.prefix}/items(${old.Id})` : this.prefix + '/items', {
        method: 'POST',
        headers: { ...jsonHeaders, ...(old ? { 'X-HTTP-Method': 'MERGE', 'IF-MATCH': etag! } : {}) },
        body: JSON.stringify(fields),
      });
    } catch (error) {
      // The index still references the previous payload; move the unused upload to the recycle bin.
      await this.recycle(file.UniqueId).catch(() => {});
      throw error;
    }
  }
  private async recycle(uniqueId: string) {
    await spJson(this.request, `/web/GetFileById('${guid(uniqueId)}')/recycle`, { method: 'POST' });
  }
  /**
   * Content files that no index entry references and that belong to an interrupted or superseded
   * write: the record exists and its current version is not newer than the file. Historical
   * snapshots, files of deleted records, files named by earlier versions and files younger than
   * 24 hours are never included.
   */
  async findOrphans(tenant: string, now = Date.now()): Promise<OrphanFile[]> {
    this.tenant(tenant);
    const rows = await this.rows();
    const referenced = new Set(rows.map(r => String(r.PayloadId).toLowerCase()));
    const versions = new Map(rows.map(r => [r.RecordKey, r.RecordVersion]));
    const files = await this.pages<LibraryFile>(
      `/web/lists(guid'${guid(this.libraryId)}')`,
      '$select=Id,UniqueId,FileLeafRef,Created,File/Length&$expand=File&$top=5000',
    );
    return files
      .filter(f => {
        const name = payloadPattern.exec(f.FileLeafRef);
        if (!name || referenced.has(String(f.UniqueId).toLowerCase())) return false;
        const current = versions.get(`${name[1]}:${name[2]}`);
        return current !== undefined && current <= Number(name[3]) && now - Date.parse(f.Created) > orphanMinAge;
      })
      .map(f => ({ id: guid(f.UniqueId), name: f.FileLeafRef, created: f.Created, size: Number(f.File?.Length ?? 0) }));
  }
  /** Moves the given files to the recycle bin if they are still orphaned; returns the number moved. */
  async recycleOrphans(tenant: string, ids: string[], now = Date.now()) {
    const wanted = new Set(ids.map(id => id.toLowerCase()));
    const orphans = (await this.findOrphans(tenant, now)).filter(o => wanted.has(o.id.toLowerCase()));
    for (const orphan of orphans) await this.recycle(orphan.id);
    return orphans.length;
  }
  async delete(tenant: string, kind: string, id: string, expected: number) {
    this.tenant(tenant);
    const old = await this.head(kind, id);
    assert(old && old.RecordVersion === expected, 'error.sharepointRest.recordHasChangedPlease', 409);
    const tag = await this.etag(old);
    await spJson(this.request, `${this.prefix}/items(${old.Id})`, {
      method: 'POST',
      headers: { 'X-HTTP-Method': 'DELETE', 'IF-MATCH': tag },
    });
  }
  async seed(tenant: string, language = 'de') {
    this.tenant(tenant);
    if (await this.head('initialized', 'seed')) return;
    for (const [index, t] of seedTemplates(language).entries()) {
      t.id = `5d7507e5-b513-48f5-8de0-00100000000${index + 1}`;
      try {
        if (!(await this.head('template', t.id))) await this.save(tenant, 'template', t.id, 1, t);
      } catch (e) {
        if (!(e instanceof AppError && e.status === 409)) throw e;
      }
    }
    try {
      await this.save(tenant, 'initialized', 'seed', 1, {});
    } catch (e) {
      if (!(e instanceof AppError && e.status === 409)) throw e;
    }
  }
}
