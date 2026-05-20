const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://vaiwdptlcwaewbsjrvtk.supabase.co';
const supabaseKey = 'sb_publishable_bZZTnVxwclqLlEVtmrMXPw_76iSPSiX';

const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const tables = ['products', 'product_requests', 'agent_products', 'inventory', 'sales'];
  for (const table of tables) {
    try {
      const { data, error } = await supabase.from(table).select('*').limit(1);
      if (error) {
        console.log(`Table '${table}': Error - ${error.message}`);
      } else {
        console.log(`Table '${table}': Exists! Data count: ${data.length}`);
      }
    } catch (e) {
      console.log(`Table '${table}': Exception - ${e.message}`);
    }
  }
}

check();
