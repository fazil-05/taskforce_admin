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
    const props = doc.definitions?.transactions?.properties;
    if (props) {
      console.log('Transactions columns:');
      for (const [colName, colDef] of Object.entries(props)) {
        console.log(`- ${colName} (${colDef.type})`);
      }
    } else {
      console.log('Transactions definition not found. Definitions:');
      console.log(Object.keys(doc.definitions || {}));
    }
  } catch (err) {
    console.error('Error:', err.message);
  }
}

run();
