// Export the actual migrated PostgreSQL schema for documentation. No data is exported.
require('dotenv/config');
const {Pool}=require('pg');
const fs=require('node:fs/promises');
async function main() {
  const pool=new Pool({connectionString:process.env.DATABASE_URL});
  try {
    const {rows:columns}=await pool.query("SELECT table_name,column_name,data_type,udt_name,is_nullable,character_maximum_length,numeric_precision,numeric_scale FROM information_schema.columns WHERE table_schema='public' AND table_name <> '_prisma_migrations' ORDER BY table_name,ordinal_position");
    const {rows:constraints}=await pool.query("SELECT c.conname,c.contype,t.relname AS table_name,pg_get_constraintdef(c.oid) AS definition FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname='public' ORDER BY t.relname,c.conname");
    const {rows:enums}=await pool.query("SELECT t.typname,e.enumlabel FROM pg_type t JOIN pg_enum e ON e.enumtypid=t.oid ORDER BY t.typname,e.enumsortorder");
    let output='// Generated from migrated PostgreSQL. SQL migrations remain authoritative.\n';
    for(const name of new Set(enums.map(e=>e.typname))) output+=`Enum ${name} {\n${enums.filter(e=>e.typname===name).map(e=>'  '+e.enumlabel).join('\n')}\n}\n\n`;
    for(const table of new Set(columns.map(c=>c.table_name))) {
      output+=`Table ${table} {\n`;
      for(const c of columns.filter(c=>c.table_name===table)) {
        let type=c.data_type==='USER-DEFINED'?c.udt_name:c.data_type==='ARRAY'?'text[]':c.data_type==='timestamp with time zone'?'timestamptz':c.data_type==='character varying'?`varchar(${c.character_maximum_length})`:c.data_type==='numeric'?`decimal(${c.numeric_precision},${c.numeric_scale})`:c.data_type;
        const pk=constraints.some(k=>k.table_name===table&&k.contype==='p'&&k.definition===`PRIMARY KEY (${c.column_name})`);
        const unique=constraints.some(k=>k.table_name===table&&k.contype==='u'&&k.definition===`UNIQUE (${c.column_name})`);
        const settings=[...(pk?['pk']:[]),...(unique?['unique']:[]),...(c.is_nullable==='NO'?['not null']:[])];
        output+=`  ${c.column_name} ${type}${settings.length?' ['+settings.join(', ')+']':''}\n`;
      }
      const composite=constraints.filter(k=>k.table_name===table&&['p','u'].includes(k.contype)&&k.definition.includes(','));
      if(composite.length) output+='  indexes {\n'+composite.map(k=>'    ('+k.definition.match(/\((.*?)\)/)[1]+') ['+(k.contype==='p'?'pk':'unique')+']').join('\n')+'\n  }\n';
      output+='}\n\n';
    }
    for(const c of constraints.filter(c=>c.contype==='f')) {
      const match=c.definition.match(/FOREIGN KEY \((.*?)\) REFERENCES (.*?)\((.*?)\)/);
      if(match) output+=`Ref: ${c.table_name}.${match[1]} > ${match[2]}.${match[3]}\n`;
    }
    output+='\n// Additional SQL constraints (see migrations):\n'+constraints.filter(c=>['c','x'].includes(c.contype)).map(c=>'// '+c.table_name+'.'+c.conname+': '+c.definition).join('\n')+'\n// appointments_active_slot: unique slot_id WHERE status IN (PENDING, CONFIRMED)\n';
    await fs.writeFile('docs/schema.dbml',output);
  } finally {await pool.end();}
}
main().catch(()=>{console.error('Schema export failed. Check database access.');process.exitCode=1;});
