import fs from 'fs';

let content = fs.readFileSync('src/supabase.ts', 'utf8');

const cleanupRegex = /\/\/\s*Clean up [\w\s]+ removed locally\n\s*const (active\w+Ids) = (.*?)\.map[\s\S]*?if \(\w+Field\) \{\n\s*if \(\1\.length > 0\) \{\n\s*const \{ error: delErr \} = await client\.from\('([^']+)'\)\.delete\(\)\.eq\([^,]+, email\)\.not\([^)]+\);\n\s*if \(delErr\) \{\n\s*console\.warn\([^)]+\);\n\s*\}\n\s*\}\n\s*\}/g;

content = content.replace(cleanupRegex, (match, activeArray, arraySource, tableName) => {
  return `// Clean up missing ${tableName}
        const ${activeArray} = ${arraySource}.map((c: any) => c.id);
        const emailField = ${tableName}Cols ? (${tableName}Cols.includes('user_email') ? 'user_email' : ${tableName}Cols.includes('userEmail') ? 'userEmail' : '') : '';
        if (emailField && ${activeArray}.length > 0) {
            const { data: existing } = await client.from('${tableName}').select('id').eq(emailField, email);
            const toDelete = (existing || []).map((e: any) => e.id).filter((id: string) => !${activeArray}.includes(id));
            if (toDelete.length > 0) {
              const { error: delErr } = await client.from('${tableName}').delete().in('id', toDelete.slice(0, 100));
              if (delErr) {
                console.warn('Supabase ${tableName} delete warning:', delErr);
              }
            }
        }`;
});

fs.writeFileSync('src/supabase.ts', content);
console.log("Rewrote cleanup blocks!");
