import { NextResponse } from "next/server";

import { saveSubmissionDraft } from "@/lib/account-opening-submissions";
import { getSupabaseServerEnv } from "@/lib/supabase/env";
import type { DraftSubmissionPayload } from "@/lib/submission-payload";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const env = getSupabaseServerEnv();

  if (!env.configured) {
    return NextResponse.json(
      {
        message: "Supabase backend is not configured.",
        missing: env.missing,
      },
      { status: 503 },
    );
  }

  try {
    const payload = (await request.json()) as DraftSubmissionPayload;
    const submission = await saveSubmissionDraft(payload);

    return NextResponse.json({
      submission,
    });
  } catch (error) {
    return NextResponse.json(
      {
        message: error instanceof Error ? error.message : "Failed to save draft.",
      },
      { status: 500 },
    );
  }
}
