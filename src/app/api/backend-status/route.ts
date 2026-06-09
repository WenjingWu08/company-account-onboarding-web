import { NextResponse } from "next/server";

import { getSupabaseServerEnv } from "@/lib/supabase/env";
import { ensureSubmissionInfrastructure } from "@/lib/supabase/setup";

export const runtime = "nodejs";

export async function GET() {
  const env = getSupabaseServerEnv();

  if (!env.configured) {
    return NextResponse.json(
      {
        configured: false,
        provider: "supabase",
        missing: env.missing,
        message: "Supabase server env is not configured.",
      },
      { status: 200 },
    );
  }

  try {
    await ensureSubmissionInfrastructure();

    return NextResponse.json({
      configured: true,
      provider: "supabase",
      message: "Supabase backend is ready.",
    });
  } catch (error) {
    return NextResponse.json(
      {
        configured: false,
        provider: "supabase",
        message:
          error instanceof Error
            ? error.message
            : "Supabase backend initialization failed.",
      },
      { status: 503 },
    );
  }
}
