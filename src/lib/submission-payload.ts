import type {
  CompanyAccountFormValues,
  PrefillFinding,
  SubmissionStatus,
  UploadedDocument,
} from "@/lib/company-account-schema";

export type DraftSubmissionPayload = {
  submissionId?: string | null;
  formValues: CompanyAccountFormValues;
  findings: PrefillFinding[];
  documents: UploadedDocument[];
  status: SubmissionStatus;
};

export type SubmissionRecord = {
  id: string;
  status: SubmissionStatus;
  createdAt: string;
  updatedAt: string;
  latestReviewPdfPath: string | null;
  latestSignedPdfPath: string | null;
};
