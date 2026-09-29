import type { SPRequest } from '../../shared/storage/sharepoint-rest.js';
export const tenant = '11111111-1111-4111-8111-111111111111';
export const user = '22222222-2222-4222-8222-222222222222';
export const indexId = '33333333-3333-4333-8333-333333333333';
export const libraryId = '44444444-4444-4444-8444-444444444444';
export const connectionsId = '55555555-5555-4555-8555-555555555555';
/** SharePoint's built-in permission levels with their real low permission words. */
export const roles = {
  fullControl: { Id: 1073741829, BasePermissions: { Low: '4294967295' } },
  edit: { Id: 1073741830, BasePermissions: { Low: '1011030767' } },
  read: { Id: 1073741826, BasePermissions: { Low: '138612833' } },
  limitedAccess: { Id: 1073741825, BasePermissions: { Low: '134287360' } },
};
type Binding = (typeof roles)[keyof typeof roles];
export function fakeSharePoint() {
  const records = new Map<number, Record<string, unknown>>();
  const files = new Map<string, unknown>();
  /** Library item metadata per content file. */
  const fileMeta = new Map<string, { name: string; created: string }>();
  const recycled: string[] = [];
  const calls: { path: string; method: string }[] = [];
  const state = { write: true, provision: true, owner: true, ready: true, failIndexWrite: false };
  /** The protected connections list; `assignments` are what breaking inheritance copies from the site. */
  const connections = {
    exists: false,
    unique: false,
    items: new Map<number, { Id: number; Title: string; Settings: string; etag: string }>(),
    siteAssignments: [
      { PrincipalId: 3, RoleDefinitionBindings: [roles.fullControl] as Binding[] },
      { PrincipalId: 5, RoleDefinitionBindings: [roles.edit] as Binding[] },
      { PrincipalId: 4, RoleDefinitionBindings: [roles.read] as Binding[] },
      { PrincipalId: 7, RoleDefinitionBindings: [roles.limitedAccess] as Binding[] },
    ],
    assignments: [] as { PrincipalId: number; RoleDefinitionBindings: Binding[] }[],
  };
  const created = new Set<string>();
  let serial = 0;
  const json = (value: unknown, status = 200, headers: HeadersInit = {}) =>
    new Response(JSON.stringify(value), { status, headers });
  const empty = () => new Response('', { status: 200 });
  function connectionsRequest(path: string, method: string, headers: Headers, raw: unknown): Response | undefined {
    if (path.startsWith("/web/lists/getbytitle('rA Meetings Connections')"))
      return connections.exists
        ? json({ Id: connectionsId, HasUniqueRoleAssignments: connections.unique })
        : json({}, 404);
    const body = raw ? JSON.parse(String(raw)) : undefined;
    if (path === '/web/lists' && method === 'POST' && body.Title === 'rA Meetings Connections') {
      connections.exists = true;
      return json({ Id: connectionsId });
    }
    if (path === '/web/roledefinitions/getbytype(2)?$select=Id') return json({ Id: roles.read.Id });
    const prefix = `/web/lists(guid'${connectionsId}')`;
    if (!path.startsWith(prefix)) return undefined;
    const rest = path.slice(prefix.length);
    if (rest === '/fields/createfieldasxml') return json({});
    if (rest.startsWith('/breakroleinheritance(copyRoleAssignments=true')) {
      if (!state.owner) return json({}, 403);
      if (!connections.unique)
        connections.assignments = connections.siteAssignments.map(a => ({
          ...a,
          RoleDefinitionBindings: [...a.RoleDefinitionBindings],
        }));
      connections.unique = true;
      return empty();
    }
    if (rest.startsWith('/roleassignments?')) return json({ value: connections.assignments });
    const change = /^\/roleassignments\/(add|remove)roleassignment\(principalid=(\d+),roledefid=(\d+)\)$/.exec(rest);
    if (change) {
      const principal = Number(change[2]);
      const role = Object.values(roles).find(r => r.Id === Number(change[3]))!;
      let assignment = connections.assignments.find(a => a.PrincipalId === principal);
      if (!assignment)
        connections.assignments.push((assignment = { PrincipalId: principal, RoleDefinitionBindings: [] }));
      if (change[1] === 'add') assignment.RoleDefinitionBindings.push(role);
      else assignment.RoleDefinitionBindings = assignment.RoleDefinitionBindings.filter(b => b.Id !== role.Id);
      return empty();
    }
    // Site members write through their Edit permission unless the list has its own, narrowed permissions.
    const canWrite = state.owner || !connections.unique;
    if (rest.startsWith('/items?') && method === 'GET') {
      const title = /Title eq '([^']*)'/.exec(decodeURIComponent(rest))?.[1];
      return json({ value: [...connections.items.values()].filter(i => !title || i.Title === title) });
    }
    if (rest === '/items' && method === 'POST') {
      if (!canWrite) return json({}, 403);
      const Id = connections.items.size + 1;
      connections.items.set(Id, { Id, Title: body.Title, Settings: body.Settings, etag: `"${++serial}"` });
      return json({ Id });
    }
    const item = /^\/items\((\d+)\)/.exec(rest);
    if (item) {
      const current = connections.items.get(Number(item[1]));
      if (!current) return json({}, 404);
      if (method === 'GET') return json({ Id: current.Id }, 200, { ETag: current.etag });
      if (!canWrite) return json({}, 403);
      if (headers.get('IF-MATCH') !== current.etag) return json({}, 412);
      connections.items.set(current.Id, { ...current, ...body, etag: `"${++serial}"` });
      return new Response(null, { status: 204 });
    }
    throw new Error('Unexpected SharePoint request: ' + path);
  }
  const request: SPRequest = async (path, init = {}) => {
    const method = init.method || 'GET';
    const headers = new Headers(init.headers);
    calls.push({ path, method });
    if (path === '/web/EffectiveBasePermissions')
      return json({
        Low: String((state.write ? 14 : 0) + (state.provision ? 2048 : 0) + (state.owner ? 0x2000000 : 0)),
      });
    if (method !== 'GET' && !state.write) return json({}, 403);
    const own = connectionsRequest(path, method, headers, init.body);
    if (own) return own;
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
    const recycle = /^\/web\/GetFileById\('([^']+)'\)\/recycle$/.exec(path);
    if (recycle && method === 'POST') {
      if (!files.delete(recycle[1])) return json({}, 404);
      fileMeta.delete(recycle[1]);
      recycled.push(recycle[1]);
      return new Response(null, { status: 204 });
    }
    if (path.startsWith(`/web/lists(guid'${libraryId}')/items?`) && method === 'GET')
      return json({
        value: [...fileMeta.entries()].map(([UniqueId, meta], index) => ({
          Id: index + 1,
          UniqueId,
          FileLeafRef: meta.name,
          Created: meta.created,
          File: { Length: JSON.stringify(files.get(UniqueId)).length },
        })),
      });
    const file = /GetFileById\('([^']+)'\)/.exec(path);
    if (file) return files.has(file[1]) ? json(files.get(file[1])) : json({}, 404);
    const body = init.body ? JSON.parse(String(init.body)) : undefined;
    if (path.includes('/Files/add')) {
      const UniqueId = crypto.randomUUID();
      files.set(UniqueId, body);
      fileMeta.set(UniqueId, { name: /add\(url='([^']+)'/.exec(path)![1], created: new Date().toISOString() });
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
      if (state.failIndexWrite) return json({}, 500);
      if (headers.get('X-HTTP-Method') === 'DELETE') {
        records.delete(id);
        // SharePoint Online answers a DELETE tunnelled through POST with 200 and an empty body.
        return new Response('', { status: 200 });
      }
      records.set(id, { ...body, Id: id, 'odata.etag': `"${++serial}"` });
      return new Response(null, { status: 204 });
    }
    if (path.includes('/items')) {
      if (method === 'GET') {
        const filter = new URL(path, 'https://customer.sharepoint.com').searchParams.get('$filter');
        if (!filter) return json({ value: [...records.values()] });
        const m = /^(\w+) eq '(.*)'$/.exec(filter)!;
        return json({ value: [...records.values()].filter(r => r[m[1]] === m[2].replaceAll("''", "'")) });
      }
      if ([...records.values()].some(r => r.RecordKey === body.RecordKey)) return json({}, 409);
      if (state.failIndexWrite) return json({}, 500);
      const Id = ++serial;
      records.set(Id, { ...body, Id, 'odata.etag': `"${serial}"` });
      return json({ Id });
    }
    throw new Error('Unexpected SharePoint request: ' + path);
  };
  return { records, files, fileMeta, recycled, calls, state, connections, request };
}
