import 'dotenv/config';
import { Pool } from 'pg';
import { retainCustomerOrders } from './customer-retention.js';

const args=process.argv.slice(2);
const allowed=args.every(arg=>arg==='--apply'||/^--batch=\d+$/.test(arg));
if(!allowed)throw new Error('Usage: customer-retention [--apply] [--batch=1..500]. Default: dry-run.');
if(!process.env.DATABASE_URL)throw new Error('DATABASE_URL must be explicitly configured.');
const batchSize=Number(args.find(arg=>arg.startsWith('--batch='))?.slice(8)??100);
const pool=new Pool({connectionString:process.env.DATABASE_URL,max:1,connectionTimeoutMillis:10_000,statement_timeout:30_000});
try {console.log(JSON.stringify(await retainCustomerOrders(pool,{apply:args.includes('--apply'),batchSize})));}
finally {await pool.end();}
