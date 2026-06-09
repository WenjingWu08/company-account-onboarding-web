import type {
  SubmissionStatus,
  UploadedDocument,
} from "@/lib/company-account-schema";
import {
  DOCUMENTS_BUCKET,
  PDFS_BUCKET,
  SUBMISSIONS_TABLE,
} from "@/lib/account-opening-constants";
import type {
  DraftSubmissionPayload,
  SubmissionRecord,
} from "@/lib/submission-payload";
import { getSupabaseAdminClient } from "@/lib/supabase/server";
import { ensureSubmissionInfrastructure } from "@/lib/supabase/setup";

type SubmissionRow = {
  id: string;
  status: SubmissionStatus;
  created_at: string;
  updated_at: string;
  latest_review_pdf_path: string | null;
  latest_signed_pdf_path: string | null;
};

const sanitizePathSegment = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || "file";

const buildTimestampPrefix = () =>
  new Date().toISOString().replace(/[:.]/g, "-");

const bufferFromFile = async (file: File) => Buffer.from(await file.arrayBuffer());

const mapRowToRecord = (row: SubmissionRow): SubmissionRecord => ({
  id: row.id,
  status: row.status,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  latestReviewPdfPath: row.latest_review_pdf_path,
  latestSignedPdfPath: row.latest_signed_pdf_path,
});

const buildDraftMutation = (payload: DraftSubmissionPayload) => ({
  status: payload.status,
  updated_at: new Date().toISOString(),
  company_name_english: payload.formValues.companyNameEnglish,
  company_name_chinese: payload.formValues.companyNameChinese,
  client_signature_name: payload.formValues.clientSignatureName,
  review_notes: payload.formValues.reviewNotes,
  form_data: payload.formValues,
  findings: payload.findings,
  documents: payload.documents,
});

const uploadBinaryToBucket = async (
  bucket: string,
  path: string,
  file: File,
  options?: {
    contentType?: string;
    upsert?: boolean;
  },
) => {
  const supabase = getSupabaseAdminClient();
  const bytes = await bufferFromFile(file);
  const { error } = await supabase.storage.from(bucket).upload(path, bytes, {
    contentType: file.type || "application/octet-stream",
    upsert: false,
    ...options,
  });

  if (error) {
    throw new Error(error.message);
  }
};

export const saveSubmissionDraft = async (
  payload: DraftSubmissionPayload,
): Promise<SubmissionRecord> => {
  await ensureSubmissionInfrastructure();
  const supabase = getSupabaseAdminClient();
  const mutation = buildDraftMutation(payload);

  if (payload.submissionId) {
    const { data, error } = await supabase
      .from(SUBMISSIONS_TABLE)
      .update(mutation)
      .eq("id", payload.submissionId)
      .select("id,status,created_at,updated_at,latest_review_pdf_path,latest_signed_pdf_path")
      .single();

    if (error) {
      throw new Error(error.message);
    }

    return mapRowToRecord(data as SubmissionRow);
  }

  const { data, error } = await supabase
    .from(SUBMISSIONS_TABLE)
    .insert(mutation)
    .select("id,status,created_at,updated_at,latest_review_pdf_path,latest_signed_pdf_path")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return mapRowToRecord(data as SubmissionRow);
};

export const storeSubmissionDocuments = async (
  submissionId: string,
  files: File[],
  metadata: UploadedDocument[],
) => {
  await ensureSubmissionInfrastructure();
  if (files.length !== metadata.length) {
    throw new Error("Uploaded files and document metadata count do not match.");
  }

  const uploadedAt = new Date().toISOString();
  const updatedDocuments: UploadedDocument[] = [];

  for (let index = 0; index < files.length; index += 1) {
    const file = files[index];
    const document = metadata[index];
    const path = [
      submissionId,
      "documents",
      `${buildTimestampPrefix()}-${document.id}-${sanitizePathSegment(file.name)}`,
    ].join("/");

    await uploadBinaryToBucket(DOCUMENTS_BUCKET, path, file);

    updatedDocuments.push({
      ...document,
      storagePath: path,
      backendStoredAt: uploadedAt,
    });
  }

  return updatedDocuments;
};

export const storeSubmissionPdf = async ({
  submissionId,
  file,
  mode,
}: {
  submissionId: string;
  file: File;
  mode: "review" | "final";
}) => {
  await ensureSubmissionInfrastructure();
  const supabase = getSupabaseAdminClient();
  const path = [
    submissionId,
    mode,
    `${buildTimestampPrefix()}-${sanitizePathSegment(file.name)}`,
  ].join("/");

  await uploadBinaryToBucket(PDFS_BUCKET, path, file, {
    contentType: "application/pdf",
  });

  const patch =
    mode === "review"
      ? {
          latest_review_pdf_path: path,
          updated_at: new Date().toISOString(),
          status: "review_ready" as SubmissionStatus,
        }
      : {
          latest_signed_pdf_path: path,
          updated_at: new Date().toISOString(),
          status: "signed" as SubmissionStatus,
          signed_at: new Date().toISOString(),
        };

  const { data, error } = await supabase
    .from(SUBMISSIONS_TABLE)
    .update(patch)
    .eq("id", submissionId)
    .select("id,status,created_at,updated_at,latest_review_pdf_path,latest_signed_pdf_path")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return {
    submission: mapRowToRecord(data as SubmissionRow),
    storagePath: path,
  };
};
