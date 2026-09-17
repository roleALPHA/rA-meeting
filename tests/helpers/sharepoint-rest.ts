import type { SPRequest } from '../../shared/storage/sharepoint-rest.js';
export const tenant = '11111111-1111-4111-8111-111111111111';
export const user = '22222222-2222-4222-8222-222222222222';
export const indexId = '33333333-3333-4333-8333-333333333333';
export const libraryId = '44444444-4444-4444-8444-444444444444';
export function fakeSharePoint() {
  const records = new Map<number, Record<string, unknown>>();
  const files = new Map<string, unknown>();
  const calls: { path: string; method: string }[] = [];
  const state = { write: true, provision: true, ready: true };
  const created = new Set<string>();
  let serial = 0;
  const json = (value: unknown, status = 200, headers: HeadersInit = {}) =>
    new Response(JSON.stringify(value), { status, headers });
  const request: SPRequest = async (path, init = {}) => {
    const method = init.method || 'GET';
    const headers = new Headers(init.headers);
    calls.push({ path, method });
    if (path === '/web/EffectiveBasePermissions')
      return json({ Low: String((state.write ? 14 : 0) + (state.provision ? 2048 : 0)) });
    if (method !== 'GET' && !state.write) return json({}, 403);
    if (path === '/web?$select=Title,Url')
      return json({ Title: 'Test Workspace', Url: 'https://customer.sharepoint.com/sites/circle' });
    if (path.includes('getbytitle'))
      return state.ready || created.has(path.includes('Index') ? 'index' : 'library')
        ? json({ Id: path.includes('Index') ? indexId : libraryId })
        : json({}, 404);
    if (path === '/web/lists' && method === 'POST') {
      const data = JSON.parse(String(init.body));
      created.add(data.BaseTemplate === 100 ? 'index' : 'library');
      return json({ Id: data.BaseTemplate === 100 ? indexId : libraryId });
    }
    if (/^\/web\/lists\(guid'[^']+'\)$/.test(path) && method === 'POST') return new Response(null, { status: 204 });
    if (path.includes('/fields?'))
      return json({
        value: ['RecordKey', 'RecordKind', 'RecordId', 'RecordVersion', 'PayloadId'].map(InternalName => ({
          InternalName,
          Indexed: true,
          EnforceUniqueValues: InternalName === 'RecordKey',
        })),
      });
    const file = /GetFileById\('([^']+)'\)/.exec(path);
    if (file) return files.has(file[1]) ? json(files.get(file[1])) : json({}, 404);
    const body = init.body ? JSON.parse(String(init.body)) : undefined;
    if (path.includes('/Files/add')) {
      const UniqueId = crypto.randomUUID();
      files.set(UniqueId, body);
      return json({ UniqueId });
    }
    const item = /\/items\((\d+)\)/.exec(path);
    if (item) {
      const id = Number(item[1]);
      const old = records.get(id);
      if (!old) return json({}, 404);
      const etag = String(old['odata.etag']);
      if (method === 'GET') return json(old, 200, { ETag: etag });
      if (headers.get('IF-MATCH') !== etag) return json({}, 412);
      if (headers.get('X-HTTP-Method') === 'DELETE') {
        records.delete(id);
        return new Response(null, { status: 204 });
      }
      records.set(id, { ...body, Id: id, 'odata.etag': `"${++serial}"` });
      return new Response(null, { status: 204 });
    }
    if (path.includes('/items')) {
      if (method === 'GET') {
        const filter = new URL(path, 'https://customer.sharepoint.com').searchParams.get('$filter') || '';
        const m = /^(\w+) eq '(.*)'$/.exec(filter)!;
        return json({ value: [...records.values()].filter(r => r[m[1]] === m[2].replaceAll("''", "'")) });
      }
      if ([...records.values()].some(r => r.RecordKey === body.RecordKey)) return json({}, 409);
      const Id = ++serial;
      records.set(Id, { ...body, Id, 'odata.etag': `"${serial}"` });
      return json({ Id });
    }
    throw new Error('Unexpected SharePoint request: ' + path);
  };
  return { records, files, calls, state, request };
}
