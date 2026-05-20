const supabaseUrl = 'https://vaiwdptlcwaewbsjrvtk.supabase.co/rest/v1/';
const apiKey = 'sb_publishable_bZZTnVxwclqLlEVtmrMXPw_76iSPSiX';

const headers = {
  'apikey': apiKey,
  'Authorization': `Bearer ${apiKey}`,
};

async function run() {
  try {
    const res = await fetch(supabaseUrl, {
      headers: headers
    });
    if (!res.ok) throw new Error(await res.text());
    const doc = await res.json();
    const paths = Object.keys(doc.paths || {});
    const rpcs = paths.filter(p => p.startsWith('/rpc/'));
    console.log('Available RPCs:');
    rpcs.forEach(r => console.log(`- ${r}`));
  } catch (err) {
    console.error('Error:', err.message);
  }
}

run();
