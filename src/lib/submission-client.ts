import type {
  SubmissionStatus,
  UploadedDocument,
} from "@/lib/company-account-schema";
import type {
  DraftSubmissionPayload,
  SubmissionRecord,
} from "@/lib/submission-payload";

type BackendStatusResponse = {
  configured: boolean;
  provider: string;
  missing?: string[];
  message: string;
};

const readErrorMessage = async (response: Response) => {
  try {
    const payload = (await response.json()) as { message?: string };
    return payload.message ?? `Request failed with ${response.status}`;
  } catch {
    return `Request failed with ${response.status}`;
  }
};

export const fetchBackendStatus = async (): Promise<BackendStatusResponse> => {
  const response = await fetch("/api/backend-status", {
    method: "GET",
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  return (await response.json()) as BackendStatusResponse;
};

export const saveDraftSubmission = async (
  payload: DraftSubmissionPayload,
): Promise<{ submission: SubmissionRecord }> => {
  const response = await fetch("/api/submissions/draft", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  return (await response.json()) as { submission: SubmissionRecord };
};

export const uploadSubmissionDocuments = async ({
  files,
  draft,
  documents,
}: {
  files: File[];
  draft: DraftSubmissionPayload;
  documents: UploadedDocument[];
}): Promise<{ submission: SubmissionRecord; documents: UploadedDocument[] }> => {
  const formData = new FormData();
  files.forEach((file) => {
    formData.append("files", file);
  });
  formData.append("documents", JSON.stringify(documents));
  formData.append("draft", JSON.stringify(draft));

  const response = await fetch("/api/submissions/documents", {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  return (await response.json()) as {
    submission: SubmissionRecord;
    documents: UploadedDocument[];
  };
};

export const uploadSubmissionPdf = async ({
  submissionId,
  file,
  mode,
}: {
  submissionId: string;
  file: File;
  mode: "review" | "final";
}): Promise<{ submission: SubmissionRecord; storagePath: string }> => {
  const formData = new FormData();
  formData.append("submissionId", submissionId);
  formData.append("mode", mode);
  formData.append("file", file);

  const response = await fetch("/api/submissions/pdf", {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  return (await response.json()) as {
    submission: SubmissionRecord;
    storagePath: string;
  };
};

export const deriveSubmissionStatus = (
  mode: "draft" | "review" | "final",
): SubmissionStatus => {
  if (mode === "final") {
    return "signed";
  }

  if (mode === "review") {
    return "review_ready";
  }

  return "draft";
};
