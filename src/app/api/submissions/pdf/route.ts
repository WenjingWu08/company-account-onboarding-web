import { NextResponse } from "next/server";

import { storeSubmissionPdf } from "@/lib/account-opening-submissions";
import { getSupabaseServerEnv } from "@/lib/supabase/env";

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
    const formData = await request.formData();
    const file = formData.get("file");
    const submissionId = String(formData.get("submissionId") ?? "").trim();
    const mode = String(formData.get("mode") ?? "").trim();

    if (!(file instanceof File)) {
      return NextResponse.json({ message: "Missing PDF file." }, { status: 400 });
    }

    if (!submissionId) {
      return NextResponse.json({ message: "Missing submissionId." }, { status: 400 });
    }

    if (mode !== "review" && mode !== "final") {
      return NextResponse.json({ message: "Invalid PDF mode." }, { status: 400 });
    }

    const result = await storeSubmissionPdf({
      submissionId,
      file,
      mode,
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        message: error instanceof Error ? error.message : "Failed to store generated PDF.",
      },
      { status: 500 },
    );
  }
}
