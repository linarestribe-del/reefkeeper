const fs=require('fs'); const vm=require('vm'); const assert=require('assert');
const code=fs.readFileSync('ai/trend-engine.js','utf8'); const ctx={globalThis:{}}; vm.createContext(ctx); vm.runInContext(code,ctx);
const E=ctx.globalThis.ReefKeeperTrendEngine; assert(E,'trend engine exported');
const points=[
 {isoDate:'2026-07-01T12:00:00Z',value:.42},{isoDate:'2026-07-05T12:00:00Z',value:.34},
 {isoDate:'2026-07-10T12:00:00Z',value:.25},{isoDate:'2026-07-15T12:00:00Z',value:.16}
];
const r=E.analyze({paramKey:'po4',points,events:[{title:'Replaced GFO',isoDate:'2026-07-05T12:00:00Z',category:'maintenance'}]});
assert.equal(r.status,'falling'); assert(r.slopePerDay<0); assert(r.r2>.9); assert.equal(r.events.length,1); assert(r.summary.includes('falling'));
const osc=E.analyze({paramKey:'alk',points:[8,10,8,10,8].map((value,i)=>({isoDate:`2026-07-0${i+1}T12:00:00Z`,value}))});
assert(['oscillating','stable'].includes(osc.status));
console.log('trend-engine tests passed');
