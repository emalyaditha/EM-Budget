import { syncStateFromSupabase, getSupabaseClient } from './src/supabase';

async function test() {
  const client = getSupabaseClient();
  if (client) {
    const res = await client.from('bank_cards').select('*');
    console.log("DB EXACT ROWS:", JSON.stringify(res.data, null, 2));
  }
}

test();
