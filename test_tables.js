require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

async function checkDatabase() {
  console.log('--- Checking Supabase tables ---');
  
  // Check categories
  const { count: catCount, error: catErr } = await supabase.from('yn_categories').select('*', { count: 'exact', head: true });
  console.log('yn_categories count status:', catErr ? `ERROR: ${catErr.message}` : `Success (${catCount} rows)`);

  // Check services
  const { count: servCount, error: servErr } = await supabase.from('yn_services').select('*', { count: 'exact', head: true });
  console.log('yn_services count status:', servErr ? `ERROR: ${servErr.message}` : `Success (${servCount} rows)`);

  // Check bookings
  const { count: bookCount, error: bookErr } = await supabase.from('yn_bookings').select('*', { count: 'exact', head: true });
  console.log('yn_bookings count status:', bookErr ? `ERROR: ${bookErr.message}` : `Success (${bookCount} rows)`);

  // Check booking items
  const { count: itemCount, error: itemErr } = await supabase.from('yn_booking_items').select('*', { count: 'exact', head: true });
  console.log('yn_booking_items count status:', itemErr ? `ERROR: ${itemErr.message}` : `Success (${itemCount} rows)`);

  // Test insert
  console.log('\n--- Testing Insert into yn_bookings ---');
  const testId = '11111111-2222-3333-4444-555555555555';
  const { error: insErr } = await supabase.from('yn_bookings').insert([
    {
      id: testId,
      customer_name: 'Test Diagnostics',
      customer_phone: '0909000000',
      event_date: '2026-06-20',
      event_address: 'Test Address'
    }
  ]);
  
  if (insErr) {
    console.error('Insert yn_bookings FAILED:', insErr);
  } else {
    console.log('Insert yn_bookings: SUCCESS!');
    
    // Clean up test insert
    const { error: delErr } = await supabase.from('yn_bookings').delete().eq('id', testId);
    console.log('Delete test booking clean-up:', delErr ? `ERROR: ${delErr.message}` : 'Success');
  }
}

checkDatabase();
