import { spawnSync } from 'node:child_process';
import { access, mkdir, copyFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const root=process.cwd();
const node=resolve('spfx/node_modules/node/bin/node');
try{await access(node);}catch{throw new Error('SPFx build dependencies missing. Run npm run spfx:install first.');}
for(const args of [['build','--clean','--production'],['package-solution','--production']]){
 const result=spawnSync(node,['node_modules/@rushstack/heft/lib/start.js',...args],{cwd:resolve('spfx'),stdio:'inherit',env:{...process.env,npm_config_cache:resolve('.npm-cache')}});
 if(result.status!==0)process.exit(result.status||1);
}
await mkdir(resolve(root,'dist'),{recursive:true});
await copyFile(resolve(root,'spfx/sharepoint/solution/rolealpha-meetings.sppkg'),resolve(root,'dist/rolealpha-meetings.sppkg'));
await copyFile(resolve(root,'LICENSE.md'),resolve(root,'dist/LICENSE.md'));
console.log('Installable customer package: dist/rolealpha-meetings.sppkg');
