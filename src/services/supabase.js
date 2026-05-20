import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL || '';
const supabaseKey = process.env.REACT_APP_SUPABASE_SERVICE_ROLE_KEY || '';

// Safely initialize client or return a mock proxy to prevent uncaught startup crashes
const initSupabase = () => {
  if (!supabaseUrl || !supabaseKey) {
    console.error('Supabase URL or Service Role Key is missing. Please set REACT_APP_SUPABASE_URL and REACT_APP_SUPABASE_SERVICE_ROLE_KEY in your environment.');
    const errorMsg = 'Supabase environment variables are missing. Please set REACT_APP_SUPABASE_URL and REACT_APP_SUPABASE_SERVICE_ROLE_KEY.';
    
    // Mock client to prevent initial bundle loading crashes
    return {
      from: () => {
        const chain = {
          select: () => Promise.resolve({ data: [], error: { message: errorMsg } }),
          insert: () => Promise.resolve({ data: [], error: { message: errorMsg } }),
          update: () => ({ eq: () => Promise.resolve({ data: [], error: { message: errorMsg } }) }),
          order: () => Promise.resolve({ data: [], error: { message: errorMsg } }),
        };
        return chain;
      },
      channel: () => ({
        on: () => ({
          subscribe: () => ({})
        })
      }),
      removeChannel: () => {},
      storage: {
        from: () => ({
          upload: () => Promise.resolve({ data: null, error: { message: errorMsg } }),
          getPublicUrl: () => ({ data: { publicUrl: '' } })
        })
      }
    };
  }

  return createClient(supabaseUrl, supabaseKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
};

export const supabase = initSupabase();

export const sendPushNotification = async (expoPushToken, title, body) => {
  if (!expoPushToken) return;
  try {
    await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: expoPushToken, title, body, sound: 'default' }),
    });
  } catch (err) {
    console.error('Push notification error:', err);
  }
};

