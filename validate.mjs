import fs from 'node:fs';
import assert from 'node:assert/strict';
const seed=JSON.parse(fs.readFileSync('./web/seed.json','utf8'));
assert.equal(seed.length,96,'Must have 96 preparation sessions');
assert.equal(new Set(seed.map(x=>x.id)).size,96,'Session IDs must be unique');
assert.ok(seed.every(x=>/^\d{4}-\d{2}-\d{2}$/.test(x.date)));
const config=JSON.parse(fs.readFileSync('./web/staticwebapp.config.json','utf8'));
assert.equal(config.platform.apiRuntime,'dotnet-isolated:10.0');
assert.ok(
  config.routes.some(
    x => x.route === '/api/*' &&
         x.allowedRoles.includes('owner') &&
         !x.allowedRoles.includes('authenticated')
  ),
  'API must be restricted to owner'
);

assert.ok(
  config.routes.some(
    x => x.route === '/*' &&
         x.allowedRoles.includes('owner') &&
         !x.allowedRoles.includes('authenticated')
  ),
  'Website must be restricted to owner'
);
assert.equal(seed.filter(x=>x.type==='System design').length,12);
assert.equal(seed.filter(x=>x.type==='Coding + concept' && x.resourceUrl?.startsWith('https://www.hackerrank.com/challenges/')).length,60);
assert.ok(seed.filter(x=>x.type==='System design').every(x=>x.resourceUrl?.startsWith('https://learn.microsoft.com/')));
const problems=JSON.parse(fs.readFileSync('./web/problem-library.json','utf8'));
assert.ok(problems.length>=20,'Problem library should include a useful starter set');
assert.equal(new Set(problems.map(x=>x.id)).size,problems.length,'Problem IDs must be unique');
assert.ok(problems.every(x=>x.id&&x.title&&x.pattern&&['Easy','Medium','Hard'].includes(x.difficulty)&&Number.isInteger(x.minutes)&&x.minutes>0));
assert.ok(problems.every(x=>{try{const u=new URL(x.url);return u.protocol==='https:'&&u.hostname==='leetcode.com'}catch{return false}}));
console.log(`CareerSprint checks passed: ${seed.length} sessions, ${problems.length} problems, 60 HackerRank links, 12 design references, authenticated app/API, .NET 10.`);
