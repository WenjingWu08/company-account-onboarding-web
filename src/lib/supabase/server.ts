import { createClient } from "@supabase/supabase-js";

import { assertSupabaseServerEnv } from "@/lib/supabase/env";

export const getSupabaseAdminClient = () => {
  const { url, serviceRoleKey } = assertSupabaseServerEnv();

  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
};
