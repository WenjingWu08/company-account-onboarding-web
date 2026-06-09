type SupabaseServerEnv = {
  url: string;
  serviceRoleKey: string;
  postgresUrl: string;
  configured: boolean;
  missing: string[];
};

const readValue = (...keys: string[]) => {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) {
      return value;
    }
  }

  return "";
};

export const getSupabaseServerEnv = (): SupabaseServerEnv => {
  const url = readValue("SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = readValue("SUPABASE_SERVICE_ROLE_KEY");
  const postgresUrl = readValue("POSTGRES_URL_NON_POOLING", "POSTGRES_URL");
  const missing: string[] = [];

  if (!url) {
    missing.push("SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL");
  }

  if (!serviceRoleKey) {
    missing.push("SUPABASE_SERVICE_ROLE_KEY");
  }

  if (!postgresUrl) {
    missing.push("POSTGRES_URL or POSTGRES_URL_NON_POOLING");
  }

  return {
    url,
    serviceRoleKey,
    postgresUrl,
    configured: missing.length === 0,
    missing,
  };
};

export const assertSupabaseServerEnv = () => {
  const env = getSupabaseServerEnv();

  if (!env.configured) {
    throw new Error(`Supabase server env missing: ${env.missing.join(", ")}`);
  }

  return env;
};
