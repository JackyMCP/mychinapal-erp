import { createClient } from '@supabase/supabase-js'

export const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
export const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Brak VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY — sprawdź plik .env')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
