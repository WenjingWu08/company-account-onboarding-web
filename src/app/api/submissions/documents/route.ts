import { NextResponse } from "next/server";

import {
  saveSubmissionDraft,
  storeSubmissionDocuments,
} from "@/lib/account-opening-submissions";
import { getSupabaseServerEnv } from "@/lib/supabase/env";
import type { UploadedDocument } from "@/lib/company-account-schema";
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
    const formData = await request.formData();
    const files = formData
      .getAll("files")
      .filter((value): value is File => value instanceof File);
    const metadata = JSON.parse(String(formData.get("documents") ?? "[]")) as UploadedDocument[];
    const draft = JSON.parse(String(formData.get("draft") ?? "{}")) as DraftSubmissionPayload;

    if (files.length === 0) {
      return NextResponse.json({ message: "No files were uploaded." }, { status: 400 });
    }

    const submission = await saveSubmissionDraft(draft);
    const storedDocuments = await storeSubmissionDocuments(submission.id, files, metadata);
    const mergedDocuments = draft.documents.map((document) => {
      const stored = storedDocuments.find((item) => item.id === document.id);
      return stored ?? document;
    });
    const updatedSubmission = await saveSubmissionDraft({
      ...draft,
      submissionId: submission.id,
      documents: mergedDocuments,
    });

    return NextResponse.json({
      submission: updatedSubmission,
      documents: mergedDocuments,
    });
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error ? error.message : "Failed to store uploaded documents.",
      },
      { status: 500 },
    );
  }
}
