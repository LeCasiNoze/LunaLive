import {readFileSync,readdirSync,writeFileSync,mkdirSync} from "node:fs";
import {dirname,resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {deflateRawSync} from "node:zlib";
const root=resolve(dirname(fileURLToPath(import.meta.url)),"../..");
const source=resolve(root,"extension/hunt-slot-switcher");
function crc32(buffer){let crc=0xffffffff;for(const byte of buffer){crc^=byte;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return (crc^0xffffffff)>>>0;}
let offset=0;const chunks=[],central=[];
for(const name of readdirSync(source).filter(n=>/\.(js|json|html|md)$/.test(n)).sort()){
 const raw=readFileSync(resolve(source,name)),data=deflateRawSync(raw),filename=Buffer.from(name),crc=crc32(raw);
 const local=Buffer.alloc(30);local.writeUInt32LE(0x04034b50,0);local.writeUInt16LE(20,4);local.writeUInt16LE(8,6);local.writeUInt16LE(8,8);local.writeUInt32LE(crc,14);local.writeUInt32LE(data.length,18);local.writeUInt32LE(raw.length,22);local.writeUInt16LE(filename.length,26);
 // Sizes and checksum are known; no data descriptor flag.
 local.writeUInt16LE(0,6);
 const entry=Buffer.alloc(46);entry.writeUInt32LE(0x02014b50,0);entry.writeUInt16LE(20,4);entry.writeUInt16LE(20,6);entry.writeUInt16LE(8,10);entry.writeUInt32LE(crc,16);entry.writeUInt32LE(data.length,20);entry.writeUInt32LE(raw.length,24);entry.writeUInt16LE(filename.length,28);entry.writeUInt32LE(offset,42);
 chunks.push(local,filename,data);central.push(entry,filename);offset+=local.length+filename.length+data.length;
}
const directory=Buffer.concat(central),end=Buffer.alloc(22),count=central.length/2;
end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(count,8);end.writeUInt16LE(count,10);end.writeUInt32LE(directory.length,12);end.writeUInt32LE(offset,16);
const destination=resolve(root,"web/public/downloads/lunalive-slot-switcher.zip");
mkdirSync(dirname(destination),{recursive:true});writeFileSync(destination,Buffer.concat([...chunks,directory,end]));
console.log("Extension packaged:",count,"files");