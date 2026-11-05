// Optional: run with Node 22+ from anywhere after extracting this bundle.
// Downloads the pinned MIT distribution and switches index.html only after success.
import {writeFile,readFile} from 'node:fs/promises';
const base=new URL('../',import.meta.url);
const urls=['https://cdn.jsdelivr.net/npm/peerjs@1.5.5/dist/peerjs.min.js','https://cdn.jsdelivr.net/npm/peerjs@1.5.5/LICENSE'];
const contents=await Promise.all(urls.map(async url=>{const r=await fetch(url,{signal:AbortSignal.timeout(30000)});if(!r.ok)throw Error(`${url}: HTTP ${r.status}`);return r.text();}));
if(contents[0].length<10000||!contents[1].includes('MIT'))throw Error('Unexpected library or license content. No changes made.');
await writeFile(new URL('assets/peerjs-1.5.5.min.js',base),contents[0]);
await writeFile(new URL('assets/PEERJS-LICENSE.txt',base),contents[1]);
const index=new URL('index.html',base);
await writeFile(index,(await readFile(index,'utf8')).replace(urls[0],'./assets/peerjs-1.5.5.min.js'));
console.log('PeerJS 1.5.5 and license are local; index.html updated.');
