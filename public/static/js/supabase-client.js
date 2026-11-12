// Creates one Supabase client and shares it with the other scripts.
// The URL and key come from the .env file via app.py -> base.html.
(() => {
  const { supabaseUrl, supabaseKey } = window.APP_CONFIG;
  window.sb = supabase.createClient(supabaseUrl, supabaseKey);
})();
