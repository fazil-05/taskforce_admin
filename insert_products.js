const supabaseUrl = 'https://vaiwdptlcwaewbsjrvtk.supabase.co';
const supabaseKey = 'sb_publishable_bZZTnVxwclqLlEVtmrMXPw_76iSPSiX';

const productsList = [
  // Millet Pro Products
  { name: 'Millet Health Mix', price: 250, description: 'Nutritious mix of millets and grains' },
  { name: 'Signature Oat Malt', price: 300, description: 'Premium oats malt blend' },
  { name: 'Choco Millet Malt', price: 280, description: 'Chocolate flavored nutritious malt' },
  { name: 'Special Ragi Malt', price: 220, description: 'Traditional healthy Ragi malt' },
  { name: 'Multipurpose Millet Flour', price: 120, description: 'Pure gluten-free multipurpose flour' },
  { name: 'Ragi Ball', price: 80, description: 'Ready-to-eat traditional Ragi ball' },
  { name: 'Millet Ball', price: 90, description: 'Nutritious traditional Millet ball' },
  { name: 'Oats and Millets Drink Mix', price: 180, description: 'Instant healthy oats & millets beverage mix' },
  { name: 'Choco Oat Malt', price: 290, description: 'Oats malt with rich chocolate taste' },

  // SRR Pooja Products
  { name: 'Agarbatti', price: 50, description: 'Premium fragrant incense sticks' },
  { name: 'Sandalwood Bliss Agarbatti', price: 120, description: 'Pure sandalwood aroma incense' },
  { name: 'Rose Divine Agarbatti', price: 100, description: 'Divine rose fragrance incense' },
  { name: 'Lavender Calm Agarbatti', price: 100, description: 'Soothing lavender incense' },
  { name: '3-in-1 Pack (Assorted)', price: 150, description: 'Assorted fragrance agarbatti pack' },
  { name: 'Camphor', price: 40, description: 'Pure refined camphor tablets' },
  { name: 'Pooja Oil', price: 180, description: 'Special blend pooja oil for lamps' },
  { name: 'Cotton Wicks', price: 30, description: 'Pure cotton wicks for pooja lamps' },
  { name: 'Dhoop Sticks', price: 60, description: 'Premium dhoop sticks' },
  { name: 'Kumkum', price: 20, description: 'Pure traditional vermillion powder' },
  { name: 'Turmeric', price: 30, description: 'Pure pooja turmeric powder' }
];

async function insertProducts() {
  console.log('Inserting products using REST API...');

  // Delete dummy default products
  const deleteUrl = `${supabaseUrl}/rest/v1/products?name=in.("Smart%20Bluetooth%20Speaker","Ultra%20Smart%20Watch%20Pro","Active%20Noise%20Cancelling%20Earbuds","Fast%20Charging%20Power%20Bank%2020k")`;
  await fetch(deleteUrl, {
    method: 'DELETE',
    headers: {
      'apikey': supabaseKey,
      'Authorization': `Bearer ${supabaseKey}`
    }
  });

  for (const prod of productsList) {
    const checkUrl = `${supabaseUrl}/rest/v1/products?name=eq.${encodeURIComponent(prod.name)}`;
    const checkRes = await fetch(checkUrl, {
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`
      }
    });
    const checkData = await checkRes.json();

    if (checkData && checkData.length > 0) {
      console.log(`Product already exists: ${prod.name}`);
      continue;
    }

    const insertUrl = `${supabaseUrl}/rest/v1/products`;
    const res = await fetch(insertUrl, {
      method: 'POST',
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      },
      body: JSON.stringify(prod)
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error(`Failed to insert ${prod.name}:`, errText);
    } else {
      console.log(`Successfully added: ${prod.name} (₹${prod.price})`);
    }
  }

  console.log('Product insertion completed!');
}

insertProducts();
