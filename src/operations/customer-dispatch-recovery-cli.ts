import 'dotenv/config';
import { Pool } from 'pg';
import { recoverCustomerDispatch } from './customer-dispatch-recovery.js';

const args=process.argv.slice(2);
if(!args.every(arg=>arg==='--apply'||/^--batch=\d+$/.test(arg)))throw new Error('Usage: customer-dispatch-recovery [--apply] [--batch=1..100]. Default: dry-run.');
if(!process.env.DATABASE_URL)throw new Error('DATABASE_URL must be explicitly configured.');
const pool=new Pool({connectionString:process.env.DATABASE_URL,max:1,connectionTimeoutMillis:10_000,statement_timeout:30_000});
try{
  const result=await recoverCustomerDispatch(pool,{apply:args.includes('--apply'),batchSize:Number(args.find(arg=>arg.startsWith('--batch='))?.slice(8)??20)});
  console.log(JSON.stringify(result));
  if(args.includes('--apply')&&result.unresolved>0)process.exitCode=1;
}finally{await pool.end();}
