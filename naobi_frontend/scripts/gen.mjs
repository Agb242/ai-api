import{writeFileSync as w}from'fs';import{join as j,dirname as d}from'path';import{fileURLToPath as f}from'url';
const B=j(d(f(import.meta.url)),'..');
const F=(r,c)=>{w(j(B,r),c.trimStart()+'\n');console.log('✓',r)};
export{F,B};
