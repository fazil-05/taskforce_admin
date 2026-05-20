const supabaseUrl = 'https://vaiwdptlcwaewbsjrvtk.supabase.co/rest/v1/';
const apiKey = 'sb_publishable_bZZTnVxwclqLlEVtmrMXPw_76iSPSiX';

const headers = {
  'apikey': apiKey,
  'Authorization': `Bearer ${apiKey}`,
};

async function check() {
  const tables = ['products', 'product_requests', 'agent_products', 'inventory', 'sales'];
  for (const table of tables) {
    try {
      const res = await fetch(`${supabaseUrl}${table}?limit=1`, { headers });
      const status = res.status;
      const text = await res.text();
      if (status === 200 || status === 204 || status === 206) {
        console.log(`Table '${table}': Exists! Status ${status}`);
      } else {
        console.log(`Table '${table}': Error Status ${status} - ${text}`);
      }
    } catch (e) {
      console.log(`Table '${table}': Exception - ${e.message}`);
    }
  }
}

check();
