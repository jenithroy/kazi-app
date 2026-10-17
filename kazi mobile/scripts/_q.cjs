const fs=require('fs'),path=require('path'),{Client}=require('pg');
const ROOT=path.join(__dirname,'..');
const CFG=fs.readFileSync(path.join(ROOT,'mentions','supabase.txt'),'utf8');
const URI=(CFG.match(/postgresql:\/\/\S+pooler\.supabase\.com:\d+\/postgres/g)||[]).pop();
(async()=>{const pg=new Client({connectionString:URI,ssl:{rejectUnauthorized:false}});await pg.connect();
const sql=process.argv.slice(2).join(' ');
try{const r=await pg.query(sql);console.log(JSON.stringify(r.rows,null,1));}catch(e){console.error('ERR',e.message);process.exitCode=1;}
await pg.end();})();
