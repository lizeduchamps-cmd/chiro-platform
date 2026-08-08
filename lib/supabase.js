import { createClient } from "@supabase/supabase-js";

// Server-side client met volledige rechten (service_role key) — NOOIT naar de browser sturen.
// Enkel gebruiken in API routes / server components.
export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

// Client-side client met beperkte rechten (anon/publishable key) — veilig voor de browser,
// werkt samen met de Row Level Security policies in de database.
export function createBrowserSupabaseClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}
