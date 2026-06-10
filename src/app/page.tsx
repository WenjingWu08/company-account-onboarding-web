"use client";

import Image from "next/image";
import {
  AlertCircle,
  ArrowRight,
  BadgeCheck,
  Building2,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  Database,
  FileCheck2,
  FilePenLine,
  FileSearch,
  LoaderCircle,
  PenSquare,
  RefreshCcw,
  ScanSearch,
  Send,
  ShieldCheck,
  Sparkles,
  Upload,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type Dispatch,
  type SetStateAction,
} from "react";

import SignatureCapture, {
  type SignatureCaptureHandle,
} from "@/components/signature-capture";
import { generateCompanyAccountPdf } from "@/lib/company-account-pdf";
import {
  accountTypeOptions,
  capitalBandOptions,
  derivativeKnowledgeOptions,
  entityTypeOptions,
  experienceRows,
  fundingSourceOptions,
  investmentObjectiveOptions,
  materialRequirements,
  previewDeck,
  sourceRegionOptions,
  steps,
  type AccountTypeKey,
  type AuthorizedPerson,
  type CompanyAccountFormValues,
  type DerivativeKnowledgeKey,
  type EntityTypeKey,
  type ExperienceKey,
  type FundingSourceKey,
  type InvestmentObjectiveKey,
  type MaterialApplicability,
  type MaterialRequirement,
  type MaterialRequirementKey,
  type PrefillFinding,
  type SubmissionStatus,
  type StepId,
  type UploadedDocument,
} from "@/lib/company-account-schema";
import {
  deriveSubmissionStatus,
  fetchBackendStatus,
  saveDraftSubmission,
  uploadSubmissionDocuments,
  uploadSubmissionPdf,
} from "@/lib/submission-client";
import type { SubmissionRecord } from "@/lib/submission-payload";
import {
  countCompletedExperiences,
  createInitialFormValues,
  deriveCompanyIncorporationRegion,
  extractDocumentDataWithContext,
  formatBytes,
  getApplicableMaterialRequirements,
  getApplicableUploadMaterialRequirements,
  getCoreMaterialRequirementKeys,
  getFirstIncompleteStep,
  getMissingItems,
  getRequiredUploadMaterialRequirements,
  getStepValidationMessage,
  mergePatchIntoValues,
  stepIndex,
  summarizeSelections,
  todayString,
} from "@/lib/company-account-utils";

const stepCards: Record<
  StepId,
  {
    title: string;
    description: string;
    icon: typeof Upload;
  }
> = {
  upload: {
    title: "先收齐支持文件",
    description: "按材料清单逐项上传，系统先保存原件，并对文字型资料做首轮自动摘取。",
    icon: Upload,
  },
  company: {
    title: "整理自动摘取结果",
    description: "把 OCR / 文本解析命中的字段集中展示，确认哪些已经可预填写，哪些还要人工补。",
    icon: ScanSearch,
  },
  funding: {
    title: "检查并补全开户信息",
    description: "把公司资料、账户类型、资金来源、授权人和风险经验一次补齐，准备生成申请文件。",
    icon: FilePenLine,
  },
  review: {
    title: "生成 PDF 并签署",
    description: "先出复核版，再完成电子签名并导出签署版 PDF，作为最终开户申请文件。",
    icon: PenSquare,
  },
  sign: {
    title: "确认材料包并发送后台",
    description: "把支持文件和签署版申请文件整合成完整材料包，确认后提交到后端数据库。",
    icon: Send,
  },
};

const textInputClassName =
  "min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/15";

const textareaClassName =
  "min-h-28 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/15";

const panelClassName =
  "rounded-lg border border-white/70 bg-white/88 shadow-[0_24px_60px_-40px_rgba(15,23,42,0.38)] backdrop-blur";

const autosaveDelayMs = 900;
const uploadAccept =
  ".pdf,.txt,.csv,.md,.markdown,.json,.jpg,.jpeg,.png,.webp,.heic,.heif,image/*";
const extractionMethodLabels: Record<string, string> = {
  json: "结构化数据",
  text: "文本直读",
  "pdf-text": "PDF 文本",
  "pdf-ocr": "PDF OCR",
  "image-ocr": "图片 OCR",
};

const applicabilityMeta: Record<
  MaterialApplicability,
  { label: string; className: string }
> = {
  all: {
    label: "通用",
    className: "bg-slate-100 text-slate-600",
  },
  generated: {
    label: "系统生成",
    className: "bg-amber-100 text-amber-700",
  },
  hongKongOnly: {
    label: "香港公司",
    className: "bg-sky-100 text-sky-700",
  },
  overseasOnly: {
    label: "海外公司",
    className: "bg-violet-100 text-violet-700",
  },
  highRiskOnly: {
    label: "高风险客户",
    className: "bg-rose-100 text-rose-700",
  },
  professionalInvestorOnly: {
    label: "专业投资者",
    className: "bg-emerald-100 text-emerald-700",
  },
};

const buildInitialFormValues = () => {
  const initial = createInitialFormValues();
  initial.intakeDate = todayString();
  initial.declarationDate = todayString();
  return initial;
};

const formatSyncTime = (value: string) =>
  new Intl.DateTimeFormat("zh-HK", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));

const toggleArrayValue = <T extends string>(items: T[], value: T) =>
  items.includes(value) ? items.filter((item) => item !== value) : [...items, value];

const sectionButtonClass = (active: boolean) =>
  `inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
    active
      ? "border-emerald-500 bg-emerald-500 text-white shadow-sm"
      : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900"
  }`;

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-2">
      <span className="text-sm font-medium text-slate-800">{label}</span>
      {children}
      {hint ? <span className="text-xs text-slate-500">{hint}</span> : null}
    </label>
  );
}

function SectionHeading({
  eyebrow,
  title,
  body,
}: {
  eyebrow: string;
  title: string;
  body: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-semibold uppercase tracking-[0.12em] text-emerald-700">
        {eyebrow}
      </span>
      <h2 className="text-xl font-semibold text-slate-950 sm:text-2xl">{title}</h2>
      <p className="max-w-3xl text-sm leading-7 text-slate-600 sm:text-[15px]">{body}</p>
    </div>
  );
}

function CheckboxRow({
  label,
  checked,
  onChange,
  description,
}: {
  label: string;
  checked: boolean;
  onChange: () => void;
  description?: string;
}) {
  return (
    <button
      type="button"
      onClick={onChange}
      className={`flex w-full items-start gap-3 rounded-lg border px-3.5 py-3 text-left transition ${
        checked
          ? "border-emerald-400 bg-emerald-50/90"
          : "border-slate-200 bg-white hover:border-slate-300"
      }`}
    >
      <span
        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border text-[11px] ${
          checked
            ? "border-emerald-500 bg-emerald-500 text-white"
            : "border-slate-300 bg-white text-transparent"
        }`}
      >
        ✓
      </span>
      <span className="flex flex-col gap-1">
        <span className="text-sm font-medium text-slate-900">{label}</span>
        {description ? (
          <span className="text-xs leading-5 text-slate-500">{description}</span>
        ) : null}
      </span>
    </button>
  );
}

function RadioTile({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg border px-3.5 py-3 text-sm font-medium transition ${
        active
          ? "border-emerald-500 bg-emerald-500 text-white"
          : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
      }`}
    >
      {label}
    </button>
  );
}

function StepRail({
  activeStep,
  setActiveStep,
  completedSteps,
}: {
  activeStep: StepId;
  setActiveStep: Dispatch<SetStateAction<StepId>>;
  completedSteps: StepId[];
}) {
  return (
    <nav className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
      {steps.map((step, index) => {
        const stepCard = stepCards[step.id];
        const Icon = stepCard.icon;
        const active = activeStep === step.id;
        const completed = completedSteps.includes(step.id);

        return (
          <button
            key={step.id}
            type="button"
            onClick={() => setActiveStep(step.id)}
            className={`flex items-start gap-4 rounded-xl border px-4 py-4 text-left transition ${
              active
                ? "border-emerald-400 bg-slate-950 text-white shadow-[0_24px_60px_-40px_rgba(16,185,129,0.65)]"
                : "border-white/70 bg-white/88 text-slate-800 hover:border-slate-200"
            }`}
          >
            <div
              className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg ${
                active
                  ? "bg-white/12 text-white"
                  : completed
                    ? "bg-emerald-50 text-emerald-700"
                    : "bg-slate-100 text-slate-600"
              }`}
            >
              {completed ? <BadgeCheck className="h-5 w-5" /> : <Icon className="h-5 w-5" />}
            </div>
            <div className="min-w-0">
              <div className="mb-1 flex items-center gap-2">
                <span
                  className={`inline-flex h-6 min-w-6 items-center justify-center rounded-full px-2 text-[11px] font-semibold ${
                    active ? "bg-white/12 text-white" : "bg-slate-100 text-slate-500"
                  }`}
                >
                  {index + 1}
                </span>
                <span className="truncate text-sm font-semibold">{step.label}</span>
              </div>
              <p className={`text-xs leading-5 ${active ? "text-white/72" : "text-slate-500"}`}>
                {steps[index]?.hint}
              </p>
            </div>
          </button>
        );
      })}
    </nav>
  );
}

function MaterialRequirementCell({
  requirement,
  documents,
  generatedReady,
  uploading,
  onUpload,
  onClear,
}: {
  requirement: MaterialRequirement;
  documents: UploadedDocument[];
  generatedReady: boolean;
  uploading: boolean;
  onUpload: (event: ChangeEvent<HTMLInputElement>) => void;
  onClear: () => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const meta = applicabilityMeta[requirement.applicability];
  const isGenerated = Boolean(requirement.generated);
  const hasDocuments = documents.length > 0;
  const showComplete = isGenerated ? generatedReady : hasDocuments;
  const extractableCount = documents.filter((document) => document.extractable).length;

  return (
    <div className="h-full bg-white px-4 py-4 lg:px-5">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start gap-2">
            <p className="text-[15px] font-medium leading-7 text-slate-900">
              {requirement.label}
            </p>
            <span
              className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ${meta.className}`}
            >
              {meta.label}
            </span>
          </div>
          {requirement.note ? (
            <p className="mt-1 text-xs leading-5 text-slate-500">{requirement.note}</p>
          ) : null}

          {isGenerated ? (
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <span
                className={`inline-flex rounded-full px-2 py-0.5 font-medium ${
                  generatedReady
                    ? "bg-emerald-50 text-emerald-700"
                    : "bg-amber-50 text-amber-700"
                }`}
              >
                {generatedReady ? "签署版已入包" : "第4步生成"}
              </span>
              <span>系统自动生成，不需要首步上传。</span>
            </div>
          ) : hasDocuments ? (
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <span className="inline-flex rounded-full bg-emerald-50 px-2 py-0.5 font-medium text-emerald-700">
                已上传 {documents.length} 份
              </span>
              {extractableCount > 0 ? (
                <span className="inline-flex rounded-full bg-sky-50 px-2 py-0.5 font-medium text-sky-700">
                  {extractableCount} 份可预填
                </span>
              ) : null}
              {documents.slice(0, 2).map((document) => (
                <span
                  key={document.id}
                  className="max-w-[260px] truncate rounded-full bg-slate-100 px-2 py-0.5 text-slate-700"
                  title={`${document.name} · ${formatBytes(document.size)}`}
                >
                  {document.name}
                </span>
              ))}
              {documents.length > 2 ? (
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-700">
                  +{documents.length - 2} 份
                </span>
              ) : null}
            </div>
          ) : (
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-600">
                未上传
              </span>
              <span>支持 PDF、图片、TXT、CSV、Markdown、JSON。</span>
            </div>
          )}
        </div>

        {isGenerated ? (
          <span
            className={`inline-flex min-h-10 items-center justify-center rounded-lg border px-3 py-2 text-xs font-medium ${
              generatedReady
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : "border-amber-200 bg-amber-50 text-amber-700"
            }`}
          >
            {generatedReady ? "已生成" : "系统生成"}
          </span>
        ) : (
          <div className="flex shrink-0 items-center gap-2 xl:self-start">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className={`inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition ${
                uploading
                  ? "border-slate-200 bg-slate-100 text-slate-500"
                  : showComplete
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:border-emerald-300"
                    : "border-slate-300 bg-white text-slate-700 hover:border-slate-400"
              }`}
              disabled={uploading}
            >
              {uploading ? (
                <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Upload className="h-3.5 w-3.5" />
              )}
              {uploading ? "上传中" : "上传文件"}
            </button>
            <input
              ref={inputRef}
              type="file"
              multiple
              onChange={onUpload}
              className="sr-only"
              accept={uploadAccept}
              disabled={uploading}
            />
            {hasDocuments ? (
              <button
                type="button"
                onClick={onClear}
                className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition hover:border-slate-400"
              >
                <RefreshCcw className="h-3.5 w-3.5" />
                清空
              </button>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}

function AuthorizedPersonForm({
  index,
  value,
  onChange,
}: {
  index: number;
  value: AuthorizedPerson;
  onChange: (patch: Partial<AuthorizedPerson>) => void;
}) {
  return (
    <div className="grid gap-4 rounded-xl border border-slate-200 bg-white px-4 py-4 lg:grid-cols-2">
      <div className="flex items-center justify-between lg:col-span-2">
        <h3 className="text-sm font-semibold text-slate-900">授权人 {index + 1}</h3>
        <span className="text-xs text-slate-500">对应开户表授权及签名样本信息</span>
      </div>
      <Field label="全名">
        <input
          className={textInputClassName}
          value={value.fullName}
          onChange={(event) => onChange({ fullName: event.target.value })}
        />
      </Field>
      <Field label="国籍">
        <input
          className={textInputClassName}
          value={value.nationality}
          onChange={(event) => onChange({ nationality: event.target.value })}
        />
      </Field>
      <Field label="电话号码">
        <input
          className={textInputClassName}
          value={value.phone}
          onChange={(event) => onChange({ phone: event.target.value })}
        />
      </Field>
      <Field label="身份证/护照号码">
        <input
          className={textInputClassName}
          value={value.idNumber}
          onChange={(event) => onChange({ idNumber: event.target.value })}
        />
      </Field>
      <Field label="住宅地址">
        <textarea
          className={textareaClassName}
          value={value.residentialAddress}
          onChange={(event) => onChange({ residentialAddress: event.target.value })}
        />
      </Field>
      <Field label="职业/业务地址">
        <textarea
          className={textareaClassName}
          value={value.occupationAddress}
          onChange={(event) => onChange({ occupationAddress: event.target.value })}
        />
      </Field>
      <div className="lg:col-span-2">
        <Field label="与最终负责发出交易指示人士之关系">
          <textarea
            className={textareaClassName}
            value={value.instructionRelationship}
            onChange={(event) =>
              onChange({ instructionRelationship: event.target.value })
            }
          />
        </Field>
      </div>
    </div>
  );
}

export default function Home() {
  const signatureRef = useRef<SignatureCaptureHandle | null>(null);
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [activeStep, setActiveStep] = useState<StepId>("upload");
  const [formValues, setFormValues] = useState<CompanyAccountFormValues>(buildInitialFormValues);
  const [documents, setDocuments] = useState<UploadedDocument[]>([]);
  const [findings, setFindings] = useState<PrefillFinding[]>([]);
  const [uploadingRequirement, setUploadingRequirement] =
    useState<MaterialRequirementKey | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [isSubmittingPackage, setIsSubmittingPackage] = useState(false);
  const [reviewPdfUrl, setReviewPdfUrl] = useState<string | null>(null);
  const [signedPdfUrl, setSignedPdfUrl] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState("等待上传支持文件");
  const [errorMessage, setErrorMessage] = useState("");
  const [signaturePreview, setSignaturePreview] = useState<string | null>(null);
  const [submissionId, setSubmissionId] = useState<string | null>(null);
  const [submissionRecord, setSubmissionRecord] = useState<SubmissionRecord | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [backendState, setBackendState] = useState<
    "checking" | "ready" | "missing" | "error"
  >("checking");
  const [backendDetail, setBackendDetail] = useState("正在检查 Supabase 后端状态");
  const [backendConfigured, setBackendConfigured] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const backendReady = backendConfigured;

  useEffect(() => {
    return () => {
      if (reviewPdfUrl) {
        URL.revokeObjectURL(reviewPdfUrl);
      }
      if (signedPdfUrl) {
        URL.revokeObjectURL(signedPdfUrl);
      }
      if (autosaveTimerRef.current) {
        clearTimeout(autosaveTimerRef.current);
      }
    };
  }, [reviewPdfUrl, signedPdfUrl]);

  const applySubmissionRecord = useCallback((submission: SubmissionRecord) => {
    setSubmissionRecord(submission);
    setSubmissionId(submission.id);
    setLastSyncedAt(submission.updatedAt);
  }, []);

  useEffect(() => {
    let cancelled = false;

    fetchBackendStatus()
      .then((payload) => {
        if (cancelled) {
          return;
        }

        if (payload.configured) {
          setBackendConfigured(true);
          setBackendState("ready");
          setBackendDetail("Supabase 已接通，可保存文件、草稿与最终材料包。");
          return;
        }

        setBackendConfigured(false);
        setBackendState("missing");
        setBackendDetail(
          payload.missing?.length
            ? `Supabase 尚未配置：${payload.missing.join("、")}`
            : payload.message,
        );
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }

        setBackendConfigured(false);
        setBackendState("error");
        setBackendDetail(
          error instanceof Error ? error.message : "无法确认 Supabase 后端状态。",
        );
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const documentsByRequirement = useMemo(() => {
    const map = new Map<MaterialRequirementKey, UploadedDocument[]>();

    for (const document of documents) {
      const key = document.requirementKey;
      if (!key) {
        continue;
      }
      const items = map.get(key) ?? [];
      items.push(document);
      map.set(key, items);
    }

    return map;
  }, [documents]);

  const companyRegion = useMemo(
    () => deriveCompanyIncorporationRegion(formValues, { findings, documents }),
    [documents, findings, formValues],
  );
  const applicableMaterialRequirements = useMemo(
    () => getApplicableMaterialRequirements(formValues, { findings, documents }),
    [documents, findings, formValues],
  );
  const applicableUploadRequirements = useMemo(
    () => getApplicableUploadMaterialRequirements(formValues, { findings, documents }),
    [documents, findings, formValues],
  );
  const requiredUploadRequirements = useMemo(
    () => getRequiredUploadMaterialRequirements(formValues, { findings, documents }),
    [documents, findings, formValues],
  );
  const applicableRequirementKeySet = useMemo(
    () => new Set(applicableMaterialRequirements.map((item) => item.key)),
    [applicableMaterialRequirements],
  );
  const visibleUploadRequirements = useMemo(() => {
    const uploadedKeys = new Set(
      documents
        .map((document) => document.requirementKey)
        .filter((key): key is MaterialRequirementKey => Boolean(key)),
    );

    return materialRequirements.filter(
      (item) =>
        !item.generated &&
        (applicableRequirementKeySet.has(item.key) || uploadedKeys.has(item.key)),
    );
  }, [applicableRequirementKeySet, documents]);
  const coreRequirementKeys = useMemo(
    () => getCoreMaterialRequirementKeys(formValues, { findings, documents }),
    [documents, findings, formValues],
  );
  const summary = useMemo(() => summarizeSelections(formValues), [formValues]);
  const missingItems = useMemo(() => getMissingItems(formValues), [formValues]);
  const missingRequiredUploadRequirements = useMemo(
    () =>
      requiredUploadRequirements.filter(
        (item) => (documentsByRequirement.get(item.key) ?? []).length === 0,
      ),
    [documentsByRequirement, requiredUploadRequirements],
  );
  const uploadedRequirementCount = useMemo(
    () =>
      applicableUploadRequirements.filter(
        (item) => (documentsByRequirement.get(item.key) ?? []).length > 0,
      ).length,
    [applicableUploadRequirements, documentsByRequirement],
  );
  const coreUploadedCount = useMemo(
    () =>
      coreRequirementKeys.filter(
        (key) => (documentsByRequirement.get(key) ?? []).length > 0,
      ).length,
    [coreRequirementKeys, documentsByRequirement],
  );
  const extractedFieldCount = useMemo(
    () => new Set(findings.map((finding) => finding.field)).size,
    [findings],
  );
  const reviewReady = Boolean(reviewPdfUrl || submissionRecord?.latestReviewPdfPath);
  const signedReady = Boolean(
    signedPdfUrl ||
      submissionRecord?.latestSignedPdfPath ||
      submissionRecord?.status === "signed" ||
      submissionRecord?.status === "submitted",
  );
  const packageSubmitted = submissionRecord?.status === "submitted";
  const companyRegionMeta = useMemo(() => {
    if (companyRegion === "hongKong") {
      return {
        label: "香港公司",
        note: "香港专属材料会按必需项处理。",
        className: "bg-sky-100 text-sky-700",
      };
    }

    if (companyRegion === "overseas") {
      return {
        label: "海外公司",
        note: "香港专属材料当前可跳过，海外公司材料保留为必需项。",
        className: "bg-violet-100 text-violet-700",
      };
    }

    return {
      label: "待确认",
      note: "尚未稳定判断公司注册地，香港/海外专属项暂同时显示。",
      className: "bg-amber-100 text-amber-700",
    };
  }, [companyRegion]);

  const completedSteps = useMemo<StepId[]>(() => {
    const done: StepId[] = [];
    if (documents.length > 0 && missingRequiredUploadRequirements.length === 0) {
      done.push("upload");
    }
    if (documents.length > 0) {
      done.push("company");
    }
    if (!getStepValidationMessage("funding", formValues)) {
      done.push("funding");
    }
    if (signedReady) {
      done.push("review");
    }
    if (packageSubmitted) {
      done.push("sign");
    }
    return done;
  }, [
    documents.length,
    formValues,
    missingRequiredUploadRequirements.length,
    packageSubmitted,
    signedReady,
  ]);

  const progress = Math.round(((stepIndex(activeStep) + 1) / steps.length) * 100);
  const currentStepCard = stepCards[activeStep];
  const CurrentStepIcon = currentStepCard.icon;

  const persistDraft = useCallback(
    async (status: SubmissionStatus = "draft", next?: {
      formValues?: CompanyAccountFormValues;
      findings?: PrefillFinding[];
      documents?: UploadedDocument[];
    }) => {
      if (!backendReady) {
        return null;
      }

      const payloadFormValues = next?.formValues ?? formValues;
      const payloadFindings = next?.findings ?? findings;
      const payloadDocuments = next?.documents ?? documents;

      setIsSavingDraft(true);

      try {
        const { submission } = await saveDraftSubmission({
          submissionId,
          formValues: payloadFormValues,
          findings: payloadFindings,
          documents: payloadDocuments,
          status,
        });

        applySubmissionRecord(submission);
        setBackendState("ready");
        setBackendDetail(
          status === "submitted"
            ? "完整材料包已同步到 Supabase。"
            : status === "signed"
              ? "签署版申请文件已同步到 Supabase。"
              : status === "review_ready"
                ? "复核版申请文件已同步到 Supabase。"
                : "草稿已同步到 Supabase。",
        );
        setHasUnsavedChanges(false);

        return submission;
      } catch (error) {
        setBackendState("error");
        setBackendDetail(
          error instanceof Error
            ? `Supabase 同步失败：${error.message}`
            : "Supabase 同步失败。",
        );
        return null;
      } finally {
        setIsSavingDraft(false);
      }
    },
    [applySubmissionRecord, backendReady, documents, findings, formValues, submissionId],
  );

  const updateField = <K extends keyof CompanyAccountFormValues>(
    key: K,
    value: CompanyAccountFormValues[K],
  ) => {
    setFormValues((current) => ({
      ...current,
      [key]: value,
    }));
    setHasUnsavedChanges(true);
  };

  const updateAuthorizedPerson = (
    index: number,
    patch: Partial<AuthorizedPerson>,
  ) => {
    setFormValues((current) => ({
      ...current,
      authorizedPersons: current.authorizedPersons.map((person, personIndex) =>
        personIndex === index ? { ...person, ...patch } : person,
      ),
    }));
    setHasUnsavedChanges(true);
  };

  const updateExperience = (
    key: ExperienceKey,
    patch: {
      enabled?: boolean;
      years?: string;
    },
  ) => {
    setFormValues((current) => ({
      ...current,
      experiences: {
        ...current.experiences,
        [key]: {
          ...current.experiences[key],
          ...patch,
        },
      },
    }));
    setHasUnsavedChanges(true);
  };

  const handleRequirementUpload = async (
    requirement: MaterialRequirement,
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    const input = event.target;
    const fileList = input.files;
    if (!fileList?.length) {
      return;
    }

    const selectedFiles = Array.from(fileList);
    setUploadingRequirement(requirement.key);
    setIsExtracting(true);
    setErrorMessage("");
    setStatusMessage(`正在接收 ${requirement.label}`);

    try {
      let nextValues = formValues;
      const nextDocuments: UploadedDocument[] = [];
      const nextFindings: PrefillFinding[] = [];

      for (const file of selectedFiles) {
        const result = await extractDocumentDataWithContext(file, {
          kind: "supporting",
          requirementKey: requirement.key,
          requirementLabel: requirement.label,
        });
        nextDocuments.push(result.document);
        nextFindings.push(...result.findings);
        nextValues = mergePatchIntoValues(nextValues, result.patch);
      }

      const mergedDocuments = [
        ...documents.filter((document) => document.requirementKey !== requirement.key),
        ...nextDocuments,
      ];
      const mergedFindings = [
        ...findings.filter((finding) => finding.requirementKey !== requirement.key),
        ...nextFindings,
      ];

      setDocuments(mergedDocuments);
      setFindings(mergedFindings);
      setFormValues(nextValues);
      setHasUnsavedChanges(true);

      if (backendReady) {
        setStatusMessage(`已接收 ${requirement.label}，正在写入 Supabase`);

        const response = await uploadSubmissionDocuments({
          files: selectedFiles,
          documents: nextDocuments,
          draft: {
            submissionId,
            formValues: nextValues,
            findings: mergedFindings,
            documents: mergedDocuments,
            status: "draft",
          },
        });

        setDocuments(response.documents);
        applySubmissionRecord(response.submission);
        setBackendState("ready");
        setBackendDetail(`${requirement.label} 已存入 Supabase。`);
        setHasUnsavedChanges(false);
        setStatusMessage(`已更新 ${requirement.label}`);
      } else {
        setStatusMessage(`${requirement.label} 已更新，当前仅保存在本地页面`);
      }
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "资料解析失败，请稍后重试。",
      );
      setStatusMessage("资料处理失败");
      if (backendReady) {
        setBackendState("error");
        setBackendDetail(
          error instanceof Error
            ? `文件入库失败：${error.message}`
            : "文件入库失败。",
        );
      }
    } finally {
      setIsExtracting(false);
      setUploadingRequirement(null);
      input.value = "";
    }
  };

  const clearRequirementDocuments = async (requirement: MaterialRequirement) => {
    const nextDocuments = documents.filter(
      (document) => document.requirementKey !== requirement.key,
    );
    const nextFindings = findings.filter(
      (finding) => finding.requirementKey !== requirement.key,
    );

    setDocuments(nextDocuments);
    setFindings(nextFindings);
    setHasUnsavedChanges(true);
    setStatusMessage(`已清空 ${requirement.label}`);
    setErrorMessage("");

    if (!backendReady) {
      return;
    }

    const submission = await persistDraft("draft", {
      documents: nextDocuments,
      findings: nextFindings,
    });

    if (submission) {
      setBackendState("ready");
      setBackendDetail(`${requirement.label} 的最新状态已同步到 Supabase。`);
    }
  };

  const generatePdf = async (mode: "review" | "final") => {
    if (mode === "final") {
      const reviewValidation = getStepValidationMessage("review", formValues);
      if (reviewValidation) {
        setErrorMessage(reviewValidation);
        setActiveStep("review");
        return;
      }

      if (signatureRef.current?.isEmpty()) {
        setErrorMessage("请先完成电子签名，再生成签署版 PDF。");
        return;
      }
    }

    if (mode === "review") {
      const firstIncompleteStep = getFirstIncompleteStep(formValues);
      if (firstIncompleteStep !== "review" && firstIncompleteStep !== "sign") {
        setErrorMessage("仍有基础字段未补齐，请先完成检查补全。");
        setActiveStep(firstIncompleteStep);
        return;
      }
    }

    setIsGeneratingPdf(true);
    setErrorMessage("");
    setStatusMessage(mode === "review" ? "正在生成复核版 PDF" : "正在生成签署版 PDF");

    try {
      const signatureDataUrl =
        mode === "final" ? signatureRef.current?.toDataUrl() ?? null : null;
      if (mode === "final") {
        setSignaturePreview(signatureDataUrl);
      }

      const blob = await generateCompanyAccountPdf({
        values: formValues,
        signatureDataUrl,
      });
      const objectUrl = URL.createObjectURL(blob);

      if (mode === "review") {
        setReviewPdfUrl((current) => {
          if (current) {
            URL.revokeObjectURL(current);
          }
          return objectUrl;
        });
      } else {
        setSignedPdfUrl((current) => {
          if (current) {
            URL.revokeObjectURL(current);
          }
          return objectUrl;
        });
      }

      if (backendReady) {
        const draftSubmission =
          (await persistDraft(deriveSubmissionStatus(mode))) ?? submissionRecord;

        if (draftSubmission?.id) {
          const uploadResult = await uploadSubmissionPdf({
            submissionId: draftSubmission.id,
            file: new File(
              [blob],
              mode === "review"
                ? "company-account-review.pdf"
                : "company-account-signed.pdf",
              { type: "application/pdf" },
            ),
            mode,
          });

          applySubmissionRecord(uploadResult.submission);
          setBackendState("ready");
          setBackendDetail(
            mode === "review"
              ? "复核版申请文件已上传到 Supabase。"
              : "签署版申请文件已上传到 Supabase。",
          );
        }
      }

      if (mode === "review") {
        setStatusMessage("复核版已生成，可先检查，如无误再签字导出签署版。");
      } else {
        setStatusMessage("签署版已生成，下一步可确认完整材料包并发送后台。");
        setActiveStep("sign");
      }
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "PDF 生成失败，请稍后重试。",
      );
      setStatusMessage("PDF 生成失败");
      if (backendReady) {
        setBackendState("error");
        setBackendDetail(
          error instanceof Error ? `PDF 入库失败：${error.message}` : "PDF 入库失败。",
        );
      }
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const submitPackage = async () => {
    if (!backendReady) {
      setErrorMessage("当前后端未接通，无法提交最终材料包。");
      return;
    }

    const fundingValidation = getStepValidationMessage("funding", formValues);
    if (fundingValidation) {
      setErrorMessage(fundingValidation);
      setActiveStep("funding");
      return;
    }

    if (missingRequiredUploadRequirements.length > 0) {
      setErrorMessage(
        `仍有必需材料未上传：${missingRequiredUploadRequirements
          .map((item) => item.label)
          .join("、")}`,
      );
      setActiveStep("upload");
      return;
    }

    if (!signedReady) {
      setErrorMessage("请先生成签署版 PDF，再发送完整材料包。");
      setActiveStep("review");
      return;
    }

    setIsSubmittingPackage(true);
    setErrorMessage("");
    setStatusMessage("正在提交完整材料包到后台");

    try {
      const submission = await persistDraft("submitted");
      if (!submission) {
        throw new Error("材料包提交失败。");
      }

      setBackendState("ready");
      setBackendDetail("完整材料包已提交到 Supabase。");
      setStatusMessage("完整材料包已发送到后台。");
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "材料包提交失败，请稍后重试。",
      );
      setStatusMessage("材料包提交失败");
    } finally {
      setIsSubmittingPackage(false);
    }
  };

  useEffect(() => {
    if (
      !backendReady ||
      !hasUnsavedChanges ||
      isExtracting ||
      isGeneratingPdf ||
      isSubmittingPackage
    ) {
      return;
    }

    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
    }

    autosaveTimerRef.current = setTimeout(() => {
      void persistDraft("draft");
    }, autosaveDelayMs);

    return () => {
      if (autosaveTimerRef.current) {
        clearTimeout(autosaveTimerRef.current);
      }
    };
  }, [
    backendReady,
    hasUnsavedChanges,
    isExtracting,
    isGeneratingPdf,
    isSubmittingPackage,
    persistDraft,
  ]);

  const helperText = useMemo(() => {
    if (activeStep === "upload") {
      if (documents.length === 0) {
        return "请先按清单上传支持文件。";
      }

      return missingRequiredUploadRequirements.length > 0
        ? `已上传 ${documents.length} 份文件；仍有 ${missingRequiredUploadRequirements.length} 项必需材料未上传。`
        : `必需材料已上传 ${uploadedRequirementCount}/${requiredUploadRequirements.length} 项。`;
    }

    if (activeStep === "company") {
      return findings.length > 0
        ? `已自动命中 ${extractedFieldCount} 个预填字段。`
        : "尚未命中预填字段，仍可直接进入人工填写。";
    }

    if (activeStep === "funding") {
      return (
        getStepValidationMessage("funding", formValues) ||
        "基础字段已补齐，可以进入文件生成与签署。"
      );
    }

    if (activeStep === "review") {
      if (signedReady) {
        return "签署版申请文件已生成，可以进入最终确认发送。";
      }
      if (reviewReady) {
        return "复核版已生成，确认无误后请签字并导出签署版。";
      }
      return "请先生成复核版，再完成电子签名与签署版导出。";
    }

    return packageSubmitted ? "材料包已发送后台。" : "确认最终材料包后发送后台。";
  }, [
    activeStep,
    documents.length,
    extractedFieldCount,
    findings.length,
    formValues,
    missingRequiredUploadRequirements.length,
    packageSubmitted,
    requiredUploadRequirements.length,
    reviewReady,
    signedReady,
    uploadedRequirementCount,
  ]);

  const jumpToNextStep = () => {
    if (activeStep === "upload") {
      if (documents.length === 0) {
        setErrorMessage("请先上传至少一项支持文件。");
        return;
      }
      setErrorMessage("");
      setActiveStep("company");
      return;
    }

    if (activeStep === "company") {
      setErrorMessage("");
      setActiveStep("funding");
      return;
    }

    if (activeStep === "funding") {
      const validation = getStepValidationMessage("funding", formValues);
      if (validation) {
        setErrorMessage(validation);
        return;
      }
      setErrorMessage("");
      setActiveStep("review");
      return;
    }

    if (activeStep === "review") {
      if (!signedReady) {
        setErrorMessage("请先生成签署版 PDF，再进入最终确认发送。");
        return;
      }
      setErrorMessage("");
      setActiveStep("sign");
    }
  };

  const leftRequirements = visibleUploadRequirements.filter((item) => item.side === "left");
  const rightRequirements = visibleUploadRequirements.filter((item) => item.side === "right");
  const uploadRows = Array.from(
    { length: Math.max(leftRequirements.length, rightRequirements.length) },
    (_, index) => ({
      left: leftRequirements[index] ?? null,
      right: rightRequirements[index] ?? null,
    }),
  );
  const findingsByRequirement = useMemo(() => {
    const map = new Map<string, PrefillFinding[]>();

    for (const finding of findings) {
      const key = finding.requirementLabel ?? finding.source;
      const items = map.get(key) ?? [];
      items.push(finding);
      map.set(key, items);
    }

    return Array.from(map.entries());
  }, [findings]);

  const metricCards = [
    {
      label: "必需材料",
      value: `${uploadedRequirementCount}/${requiredUploadRequirements.length}`,
      accent: "from-amber-500/35 to-orange-500/10",
    },
    {
      label: "自动预填字段",
      value: String(extractedFieldCount),
      accent: "from-emerald-500/35 to-teal-500/10",
    },
    {
      label: "最终材料包",
      value: signedReady ? "已生成" : "待生成",
      accent: "from-sky-500/35 to-cyan-500/10",
    },
  ];

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(245,158,11,0.16),_transparent_24%),radial-gradient(circle_at_top_right,_rgba(16,185,129,0.12),_transparent_24%),linear-gradient(180deg,_#f7f6f2_0%,_#eef3f7_52%,_#f4f7fb_100%)] text-slate-900">
      <main className="mx-auto flex w-full max-w-[1540px] flex-col gap-8 px-4 py-4 sm:px-6 lg:px-8 lg:py-6">
        <section className={`${panelClassName} overflow-hidden`}>
          <div className="grid gap-6 px-5 py-5 sm:px-6 lg:grid-cols-[1.15fr_0.85fr] lg:px-8 lg:py-7">
            <div className="flex flex-col gap-6">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-2 rounded-full bg-slate-950 px-3 py-1.5 text-xs font-semibold text-white">
                  <ClipboardCheck className="h-3.5 w-3.5" />
                  Company account onboarding
                </span>
                <span className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-xs font-medium text-slate-600 ring-1 ring-slate-200">
                  <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                  支持文件上传、预填、签署与后台归档
                </span>
              </div>

              <div className="flex flex-col gap-3">
                <h1 className="max-w-4xl text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl lg:text-[2.75rem]">
                  把公司开户材料整理成一条完整的电子化提交链路
                </h1>
                <p className="max-w-3xl text-sm leading-7 text-slate-600 sm:text-[15px]">
                  客户先上传所有支持文件，系统对可读取资料做自动摘取并预填写；客户再检查和补全开户表；随后生成与原始 PDF 一致的申请文件供检查、签字；最后把签署版申请文件和全部支持文件一起发送到后台。
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                {metricCards.map((metric) => (
                  <div
                    key={metric.label}
                    className={`rounded-xl border border-white/65 bg-gradient-to-br ${metric.accent} p-[1px]`}
                  >
                    <div className="rounded-[11px] bg-white/92 px-4 py-4">
                      <p className="text-xs font-medium uppercase tracking-[0.14em] text-slate-500">
                        {metric.label}
                      </p>
                      <p className="mt-2 text-2xl font-semibold text-slate-950">{metric.value}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
              <div className="rounded-xl border border-slate-200 bg-slate-950 px-5 py-4 text-white">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-emerald-300">
                      当前阶段
                    </p>
                    <h2 className="mt-2 text-lg font-semibold">{currentStepCard.title}</h2>
                  </div>
                  <span className="inline-flex h-12 w-12 items-center justify-center rounded-lg bg-white/10">
                    <CurrentStepIcon className="h-5 w-5" />
                  </span>
                </div>
                <p className="mt-3 text-sm leading-6 text-white/70">
                  {currentStepCard.description}
                </p>
                <div className="mt-5">
                  <div className="mb-2 flex items-center justify-between text-xs text-white/60">
                    <span>流程完成度</span>
                    <span>{progress}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-white/10">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-amber-300"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white px-5 py-4">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                  流程状态
                </p>
                <div className="mt-3 flex items-center gap-2 text-sm font-medium text-slate-900">
                  {errorMessage ? (
                    <AlertCircle className="h-4 w-4 text-rose-500" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  )}
                  {errorMessage || statusMessage}
                </div>
                <p className="mt-3 text-xs leading-5 text-slate-500">{helperText}</p>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white px-5 py-4">
                <div className="flex items-center gap-2">
                  <Database
                    className={`h-4 w-4 ${
                      backendState === "ready"
                        ? "text-emerald-600"
                        : backendState === "checking"
                          ? "text-amber-500"
                          : "text-rose-500"
                    }`}
                  />
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                    Supabase 同步
                  </p>
                </div>
                <div className="mt-3 space-y-2">
                  <p className="text-sm font-medium text-slate-900">{backendDetail}</p>
                  <div className="grid gap-1 text-xs text-slate-500">
                    <span>当前提交：{submissionId ? submissionId.slice(0, 8) : "尚未创建"}</span>
                    <span>
                      最近同步：{lastSyncedAt ? formatSyncTime(lastSyncedAt) : "尚未同步"}
                    </span>
                    <span>
                      草稿状态：
                      {isSavingDraft
                        ? "同步中"
                        : hasUnsavedChanges
                          ? "有未同步改动"
                          : submissionRecord?.status ?? "未开始"}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)_420px]">
          <aside className="flex flex-col gap-6 xl:sticky xl:top-6 xl:self-start">
            <div className={`${panelClassName} p-4`}>
              <StepRail
                activeStep={activeStep}
                setActiveStep={setActiveStep}
                completedSteps={completedSteps}
              />
            </div>

            <div className={`${panelClassName} p-4`}>
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-900">提交概览</h3>
                <span className="text-xs text-slate-500">
                  {countCompletedExperiences(formValues)} 项经验已填写
                </span>
              </div>
              <div className="grid gap-3 text-sm">
                <div className="rounded-xl bg-slate-50 px-3 py-3">
                  <p className="text-xs font-medium uppercase tracking-[0.12em] text-slate-500">
                    公司
                  </p>
                  <p className="mt-2 font-semibold text-slate-900">
                    {formValues.companyNameEnglish || "未填写"}
                  </p>
                  <p className="text-slate-500">
                    {formValues.companyNameChinese || "未填写中文名称"}
                  </p>
                </div>
                <div className="rounded-xl bg-slate-50 px-3 py-3">
                  <p className="text-xs font-medium uppercase tracking-[0.12em] text-slate-500">
                    上传完成
                  </p>
                  <p className="mt-2 leading-6 text-slate-700">
                    核心材料 {coreUploadedCount}/{coreRequirementKeys.length}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    必需材料 {uploadedRequirementCount}/{requiredUploadRequirements.length}
                  </p>
                  <p className="mt-2 text-xs text-slate-500">{companyRegionMeta.note}</p>
                </div>
                <div className="rounded-xl bg-slate-50 px-3 py-3">
                  <p className="text-xs font-medium uppercase tracking-[0.12em] text-slate-500">
                    账户类型
                  </p>
                  <p className="mt-2 leading-6 text-slate-700">
                    {summary.accountTypes || "尚未选择"}
                  </p>
                </div>
                <div className="rounded-xl bg-slate-50 px-3 py-3">
                  <p className="text-xs font-medium uppercase tracking-[0.12em] text-slate-500">
                    最终申请文件
                  </p>
                  <p className="mt-2 leading-6 text-slate-700">
                    {signedReady ? "签署版已生成" : reviewReady ? "复核版已生成" : "尚未生成"}
                  </p>
                </div>
              </div>
            </div>
          </aside>

          <div className="flex min-w-0 flex-col gap-6">
            {activeStep === "upload" ? (
              <section className={`${panelClassName} px-5 py-5 sm:px-6 lg:px-8 lg:py-7`}>
                <SectionHeading
                  eyebrow="Step 1"
                  title="先按材料清单上传所有支持文件"
                  body="这一阶段只上传支持文件，不上传最终开户申请表。开户申请表会在客户检查、补全并签字后由系统生成，并自动并入最终材料包。"
                />

                <div className="mt-6 grid gap-4">
                  <div className="rounded-2xl border border-slate-200 bg-[linear-gradient(135deg,rgba(255,255,255,0.92),rgba(245,247,250,0.96))] px-5 py-5">
                    <div className="flex items-start gap-4">
                      <span className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
                        <Building2 className="h-5 w-5" />
                      </span>
                      <div>
                        <h3 className="text-lg font-semibold text-slate-950">材料上传规则</h3>
                        <p className="mt-2 text-sm leading-7 text-slate-600">
                          支持文件按清单逐项上传即可。桌面端按左右两栏横向排列，尽量贴近原始材料清单；手机端会自动折成上下结构。文字型 PDF、TXT、CSV、JSON 会直接读取文本；扫描版 PDF、照片和截图会额外尝试 OCR 自动摘取。
                        </p>
                        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                          <span
                            className={`inline-flex rounded-full px-2.5 py-1 font-medium ${companyRegionMeta.className}`}
                          >
                            {companyRegionMeta.label}
                          </span>
                          <span className="text-slate-500">{companyRegionMeta.note}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                    <div className="hidden bg-slate-50 lg:grid lg:grid-cols-2">
                      <div className="border-r border-slate-200 px-5 py-3 text-sm font-semibold text-slate-700">
                        材料清单 A
                      </div>
                      <div className="px-5 py-3 text-sm font-semibold text-slate-700">
                        材料清单 B
                      </div>
                    </div>

                    <div className="grid">
                      {uploadRows.map((row, index) => (
                        <div
                          key={`upload-row-${index}`}
                          className="grid border-t border-slate-200 first:border-t-0 lg:grid-cols-2"
                        >
                          <div className="border-slate-200 lg:border-r">
                            {row.left ? (
                              <MaterialRequirementCell
                                requirement={row.left}
                                documents={documentsByRequirement.get(row.left.key) ?? []}
                                generatedReady={signedReady}
                                uploading={uploadingRequirement === row.left.key}
                                onUpload={(event) => {
                                  void handleRequirementUpload(row.left, event);
                                }}
                                onClear={() => {
                                  void clearRequirementDocuments(row.left);
                                }}
                              />
                            ) : (
                              <div className="h-full px-4 py-4" />
                            )}
                          </div>

                          <div className="border-t border-slate-200 lg:border-t-0">
                            {row.right ? (
                              <MaterialRequirementCell
                                requirement={row.right}
                                documents={documentsByRequirement.get(row.right.key) ?? []}
                                generatedReady={signedReady}
                                uploading={uploadingRequirement === row.right.key}
                                onUpload={(event) => {
                                  void handleRequirementUpload(row.right, event);
                                }}
                                onClear={() => {
                                  void clearRequirementDocuments(row.right);
                                }}
                              />
                            ) : (
                              <div className="h-full px-4 py-4" />
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </section>
            ) : null}

            {activeStep === "company" ? (
              <section className={`${panelClassName} px-5 py-5 sm:px-6 lg:px-8 lg:py-7`}>
                <SectionHeading
                  eyebrow="Step 2"
                  title="整理自动摘取和预填写结果"
                  body="系统会把上传资料里可读取的信息先整理出来。这里重点看两件事：一是有哪些字段已经可以直接预填；二是哪些资料虽然已上传，但仍需人工录入。"
                />

                <div className="mt-6 grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
                  <div className="grid gap-4">
                    <div className="grid gap-4 md:grid-cols-3">
                      <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
                        <p className="text-xs font-medium uppercase tracking-[0.12em] text-slate-500">
                          已收文件
                        </p>
                        <p className="mt-2 text-2xl font-semibold text-slate-950">
                          {documents.length}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          必需材料已完成 {uploadedRequirementCount}/{requiredUploadRequirements.length}
                        </p>
                      </div>
                      <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
                        <p className="text-xs font-medium uppercase tracking-[0.12em] text-slate-500">
                          可预填字段
                        </p>
                        <p className="mt-2 text-2xl font-semibold text-slate-950">
                          {extractedFieldCount}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          来源于 {findingsByRequirement.length} 类资料
                        </p>
                      </div>
                      <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
                        <p className="text-xs font-medium uppercase tracking-[0.12em] text-slate-500">
                          人工补录
                        </p>
                        <p className="mt-2 text-2xl font-semibold text-slate-950">
                          {missingItems.length}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">后续在检查补全步骤完成</p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${companyRegionMeta.className}`}
                      >
                        {companyRegionMeta.label}
                      </span>
                      <span className="text-xs text-slate-500">{companyRegionMeta.note}</span>
                    </div>

                    <div className="rounded-2xl border border-slate-200 bg-slate-950 px-5 py-5 text-white">
                      <div className="mb-4 flex items-center gap-2">
                        <Sparkles className="h-4 w-4 text-amber-300" />
                        <h3 className="text-sm font-semibold">自动命中字段</h3>
                      </div>
                      {findingsByRequirement.length === 0 ? (
                        <p className="text-sm leading-6 text-white/68">
                          当前还没有自动命中字段。系统仍会保留原件并显示解析说明；如需更高命中率，优先上传清晰、正向、无遮挡的 PDF 或照片。
                        </p>
                      ) : (
                        <div className="grid gap-3">
                          {findingsByRequirement.map(([group, groupFindings]) => (
                            <div
                              key={group}
                              className="rounded-xl border border-white/10 bg-white/6 px-4 py-4"
                            >
                              <div className="flex items-center justify-between gap-3">
                                <h3 className="text-sm font-semibold text-white">{group}</h3>
                                <span className="text-xs text-white/55">
                                  {groupFindings.length} 项命中
                                </span>
                              </div>
                              <div className="mt-3 grid gap-2">
                                {groupFindings.map((finding, index) => (
                                  <div
                                    key={`${finding.field}-${group}-${index}`}
                                    className="rounded-lg border border-white/8 bg-white/5 px-3 py-3"
                                  >
                                    <div className="flex items-center justify-between gap-2">
                                      <span className="text-xs font-semibold text-white">
                                        {finding.label}
                                      </span>
                                      <span className="truncate text-[11px] text-white/55">
                                        {finding.source}
                                      </span>
                                    </div>
                                    <p className="mt-1 text-sm text-emerald-200">
                                      {finding.value}
                                    </p>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="grid gap-4">
                    <div className="rounded-2xl border border-slate-200 bg-white px-5 py-5">
                      <div className="mb-4 flex items-center justify-between">
                        <div>
                          <h3 className="text-sm font-semibold text-slate-900">
                            资料解析状态
                          </h3>
                          <p className="mt-1 text-xs text-slate-500">
                            每份资料都会显示是否参与预填写，以及当前解析说明。
                          </p>
                        </div>
                      </div>
                      <div className="grid gap-3">
                        {documents.length === 0 ? (
                          <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-sm text-slate-500">
                            还没有上传资料。
                          </div>
                        ) : (
                          documents.map((document) => (
                            <div
                              key={document.id}
                              className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-4"
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-semibold text-slate-900">
                                    {document.requirementLabel || document.name}
                                  </p>
                                  <p className="mt-1 truncate text-xs text-slate-500">
                                    {document.name}
                                  </p>
                                </div>
                                <span
                                  className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-medium ${
                                    document.extractable
                                      ? "bg-emerald-50 text-emerald-700"
                                      : "bg-slate-200 text-slate-600"
                                  }`}
                                >
                                  {document.extractable ? "已解析" : "仅归档"}
                                </span>
                              </div>
                              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                                {document.extractionMethod ? (
                                  <span className="inline-flex rounded-full bg-white px-2 py-0.5 font-medium text-slate-600 ring-1 ring-slate-200">
                                    {extractionMethodLabels[document.extractionMethod] ??
                                      document.extractionMethod}
                                  </span>
                                ) : null}
                                <span className="inline-flex rounded-full bg-white px-2 py-0.5 font-medium text-slate-600 ring-1 ring-slate-200">
                                  命中 {document.matchedFieldCount ?? 0} 项
                                </span>
                                <span className="leading-5">{document.parseNote}</span>
                              </div>
                              {document.extractedTextSample ? (
                                <div className="mt-2 rounded-lg bg-white px-3 py-2">
                                  <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-slate-400">
                                    OCR / 解析片段
                                  </p>
                                  <p className="mt-1 text-xs leading-5 text-slate-600">
                                    {document.extractedTextSample}
                                  </p>
                                </div>
                              ) : null}
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                      <div className="relative aspect-[1.24] w-full bg-slate-100">
                        <Image
                          src={previewDeck[0]?.src ?? "/companyAccount-cover.png"}
                          alt={previewDeck[0]?.title ?? "开户表预览"}
                          fill
                          className="object-cover object-top"
                          sizes="(max-width: 1024px) 100vw, 28vw"
                        />
                      </div>
                      <div className="px-4 py-4">
                        <h3 className="text-sm font-semibold text-slate-900">
                          最终生成文件仍沿用原始 PDF 模板
                        </h3>
                        <p className="mt-1 text-xs leading-5 text-slate-500">
                          上传步骤解决“先收资料”，检查补全步骤解决“把内容填对”，生成步骤再解决“输出与签字”。
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </section>
            ) : null}

            {activeStep === "funding" ? (
              <section className={`${panelClassName} px-5 py-5 sm:px-6 lg:px-8 lg:py-7`}>
                <SectionHeading
                  eyebrow="Step 3"
                  title="检查自动预填结果，并补全开户信息"
                  body="这里把公司资料、账户类型、通讯方式、资金来源、资本结构、授权人和风险经验一次补齐。系统命中的字段已经先带入，你只需要核对和修正。"
                />

                <div className="mt-6 grid gap-8">
                  <div className="rounded-2xl border border-emerald-200 bg-emerald-50/80 px-5 py-4 text-sm leading-7 text-emerald-800">
                    已从上传资料中命中 <span className="font-semibold">{extractedFieldCount}</span>{" "}
                    个字段。建议先检查公司名称、地址、注册编号、联络方式和资金来源，再继续生成申请文件。
                  </div>

                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    <Field label="开户号码">
                      <input
                        className={textInputClassName}
                        value={formValues.intakeReference}
                        onChange={(event) => updateField("intakeReference", event.target.value)}
                      />
                    </Field>
                    <Field label="开户日期">
                      <input
                        type="date"
                        className={textInputClassName}
                        value={formValues.intakeDate}
                        onChange={(event) => updateField("intakeDate", event.target.value)}
                      />
                    </Field>
                    <Field label="公司中文名称">
                      <input
                        className={textInputClassName}
                        value={formValues.companyNameChinese}
                        onChange={(event) =>
                          updateField("companyNameChinese", event.target.value)
                        }
                      />
                    </Field>
                    <Field label="公司英文名称">
                      <input
                        className={textInputClassName}
                        value={formValues.companyNameEnglish}
                        onChange={(event) =>
                          updateField("companyNameEnglish", event.target.value)
                        }
                      />
                    </Field>
                  </div>

                  <div className="grid gap-4 xl:grid-cols-2">
                    <Field label="注册地址">
                      <textarea
                        className={textareaClassName}
                        value={formValues.registeredAddress}
                        onChange={(event) =>
                          updateField("registeredAddress", event.target.value)
                        }
                      />
                    </Field>
                    <Field label="营业地址">
                      <textarea
                        className={textareaClassName}
                        value={formValues.businessAddress}
                        onChange={(event) =>
                          updateField("businessAddress", event.target.value)
                        }
                      />
                    </Field>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    <Field
                      label="商业登记号码"
                      hint={
                        companyRegion === "overseas"
                          ? "当前判断为海外公司，此项可留空。"
                          : "适用于香港成立公司；如已自动命中，请核对后保留。"
                      }
                    >
                      <input
                        className={textInputClassName}
                        value={formValues.businessRegistrationNo}
                        onChange={(event) =>
                          updateField("businessRegistrationNo", event.target.value)
                        }
                      />
                    </Field>
                    <Field label="注册成立证书号码">
                      <input
                        className={textInputClassName}
                        value={formValues.incorporationNo}
                        onChange={(event) =>
                          updateField("incorporationNo", event.target.value)
                        }
                      />
                    </Field>
                    <Field label="注册日期">
                      <input
                        type="date"
                        className={textInputClassName}
                        value={formValues.incorporationDate}
                        onChange={(event) =>
                          updateField("incorporationDate", event.target.value)
                        }
                      />
                    </Field>
                    <Field label="业务性质">
                      <input
                        className={textInputClassName}
                        value={formValues.natureOfBusiness}
                        onChange={(event) =>
                          updateField("natureOfBusiness", event.target.value)
                        }
                      />
                    </Field>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    <Field label="营业电话">
                      <input
                        className={textInputClassName}
                        value={formValues.businessPhone}
                        onChange={(event) => updateField("businessPhone", event.target.value)}
                      />
                    </Field>
                    <Field label="联络人电话">
                      <input
                        className={textInputClassName}
                        value={formValues.contactPhone}
                        onChange={(event) => updateField("contactPhone", event.target.value)}
                      />
                    </Field>
                    <Field label="电邮地址">
                      <input
                        className={textInputClassName}
                        value={formValues.email}
                        onChange={(event) => updateField("email", event.target.value)}
                      />
                    </Field>
                    <Field label="传真号码">
                      <input
                        className={textInputClassName}
                        value={formValues.fax}
                        onChange={(event) => updateField("fax", event.target.value)}
                      />
                    </Field>
                  </div>

                  <Field label="CCASS 投资者户口名称及号码">
                    <input
                      className={textInputClassName}
                      value={formValues.ccassAccount}
                      onChange={(event) => updateField("ccassAccount", event.target.value)}
                    />
                  </Field>

                  <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
                    <div className="grid gap-3">
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-semibold text-slate-900">账户类型</h3>
                        <span className="text-xs text-slate-500">对应开户表 Account Type</span>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        {accountTypeOptions.map((option) => (
                          <CheckboxRow
                            key={option.key}
                            label={option.label}
                            description={option.description}
                            checked={formValues.accountTypes.includes(option.key)}
                            onChange={() =>
                              updateField(
                                "accountTypes",
                                toggleArrayValue(
                                  formValues.accountTypes,
                                  option.key as AccountTypeKey,
                                ),
                              )
                            }
                          />
                        ))}
                      </div>
                      <Field label="其他账户类型说明">
                        <input
                          className={textInputClassName}
                          value={formValues.accountTypeOther}
                          onChange={(event) =>
                            updateField("accountTypeOther", event.target.value)
                          }
                        />
                      </Field>
                    </div>

                    <div className="grid gap-5">
                      <div className="grid gap-3">
                        <h3 className="text-sm font-semibold text-slate-900">通讯方式</h3>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <RadioTile
                            label="电邮发送通知与电子结单"
                            active={formValues.communicationMethod === "email"}
                            onClick={() => updateField("communicationMethod", "email")}
                          />
                          <RadioTile
                            label="邮寄至公司地址"
                            active={formValues.communicationMethod === "post"}
                            onClick={() => updateField("communicationMethod", "post")}
                          />
                        </div>
                      </div>

                      <div className="grid gap-3">
                        <div className="flex items-center justify-between">
                          <h3 className="text-sm font-semibold text-slate-900">电子交易服务</h3>
                          <button
                            type="button"
                            onClick={() =>
                              updateField("electronicTrading", !formValues.electronicTrading)
                            }
                            className={sectionButtonClass(formValues.electronicTrading)}
                          >
                            {formValues.electronicTrading ? "已开通" : "未开通"}
                          </button>
                        </div>
                      </div>

                      <div className="grid gap-3">
                        <h3 className="text-sm font-semibold text-slate-900">实体性质</h3>
                        <div className="grid gap-3 sm:grid-cols-2">
                          {entityTypeOptions.map((option) => (
                            <RadioTile
                              key={option.key}
                              label={option.label}
                              active={formValues.entityType === option.key}
                              onClick={() =>
                                updateField("entityType", option.key as EntityTypeKey)
                              }
                            />
                          ))}
                        </div>
                        {formValues.entityType === "other" ? (
                          <Field label="其他实体性质">
                            <input
                              className={textInputClassName}
                              value={formValues.entityTypeOther}
                              onChange={(event) =>
                                updateField("entityTypeOther", event.target.value)
                              }
                            />
                          </Field>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-6 xl:grid-cols-2">
                    <div className="grid gap-4">
                      <div className="grid gap-3">
                        <h3 className="text-sm font-semibold text-slate-900">开户目的</h3>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <RadioTile
                            label="投资"
                            active={formValues.openingPurpose === "investment"}
                            onClick={() => updateField("openingPurpose", "investment")}
                          />
                          <RadioTile
                            label="其他"
                            active={formValues.openingPurpose === "other"}
                            onClick={() => updateField("openingPurpose", "other")}
                          />
                        </div>
                        {formValues.openingPurpose === "other" ? (
                          <Field label="其他开户目的">
                            <input
                              className={textInputClassName}
                              value={formValues.openingPurposeOther}
                              onChange={(event) =>
                                updateField("openingPurposeOther", event.target.value)
                              }
                            />
                          </Field>
                        ) : null}
                      </div>

                      <div className="grid gap-3">
                        <h3 className="text-sm font-semibold text-slate-900">资金来源地</h3>
                        <div className="grid gap-3 sm:grid-cols-3">
                          {sourceRegionOptions.map((option) => (
                            <RadioTile
                              key={option.key}
                              label={option.label}
                              active={formValues.sourceRegion === option.key}
                              onClick={() => updateField("sourceRegion", option.key)}
                            />
                          ))}
                        </div>
                        {formValues.sourceRegion === "other" ? (
                          <Field label="其他来源地">
                            <input
                              className={textInputClassName}
                              value={formValues.sourceRegionOther}
                              onChange={(event) =>
                                updateField("sourceRegionOther", event.target.value)
                              }
                            />
                          </Field>
                        ) : null}
                      </div>
                    </div>

                    <div className="grid gap-4 rounded-2xl bg-slate-950 px-5 py-5 text-white">
                      <h3 className="text-sm font-semibold">资本结构与财务资料</h3>
                      <div className="grid gap-4 md:grid-cols-2">
                        <Field label="法定资本（HK$）">
                          <input
                            className={`${textInputClassName} border-white/12 bg-white/8 text-white placeholder:text-white/45`}
                            value={formValues.authorizedShareCapital}
                            onChange={(event) =>
                              updateField("authorizedShareCapital", event.target.value)
                            }
                          />
                        </Field>
                        <Field label="法定股份">
                          <input
                            className={`${textInputClassName} border-white/12 bg-white/8 text-white placeholder:text-white/45`}
                            value={formValues.authorizedShareCount}
                            onChange={(event) =>
                              updateField("authorizedShareCount", event.target.value)
                            }
                          />
                        </Field>
                        <Field label="每股面值（法定）">
                          <input
                            className={`${textInputClassName} border-white/12 bg-white/8 text-white placeholder:text-white/45`}
                            value={formValues.authorizedShareFaceValue}
                            onChange={(event) =>
                              updateField("authorizedShareFaceValue", event.target.value)
                            }
                          />
                        </Field>
                        <Field label="缴足资本（HK$）">
                          <input
                            className={`${textInputClassName} border-white/12 bg-white/8 text-white placeholder:text-white/45`}
                            value={formValues.paidUpCapital}
                            onChange={(event) =>
                              updateField("paidUpCapital", event.target.value)
                            }
                          />
                        </Field>
                        <Field label="已发行股份">
                          <input
                            className={`${textInputClassName} border-white/12 bg-white/8 text-white placeholder:text-white/45`}
                            value={formValues.issuedShareCount}
                            onChange={(event) =>
                              updateField("issuedShareCount", event.target.value)
                            }
                          />
                        </Field>
                        <Field label="每股面值（已发行）">
                          <input
                            className={`${textInputClassName} border-white/12 bg-white/8 text-white placeholder:text-white/45`}
                            value={formValues.issuedShareFaceValue}
                            onChange={(event) =>
                              updateField("issuedShareFaceValue", event.target.value)
                            }
                          />
                        </Field>
                      </div>
                      <div className="grid gap-3">
                        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-white/55">
                          缴足资本区间
                        </p>
                        <div className="grid gap-3 sm:grid-cols-2">
                          {capitalBandOptions.map((option) => (
                            <RadioTile
                              key={option.key}
                              label={option.label}
                              active={formValues.capitalBand === option.key}
                              onClick={() => updateField("capitalBand", option.key)}
                            />
                          ))}
                        </div>
                      </div>
                      <div className="grid gap-3">
                        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-white/55">
                          是否提供最近财务账目记录
                        </p>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <RadioTile
                            label="是"
                            active={formValues.financialAccountsProvided === true}
                            onClick={() => updateField("financialAccountsProvided", true)}
                          />
                          <RadioTile
                            label="否"
                            active={formValues.financialAccountsProvided === false}
                            onClick={() => updateField("financialAccountsProvided", false)}
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-6 xl:grid-cols-2">
                    <div className="grid gap-4">
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-semibold text-slate-900">初始资金来源</h3>
                        <span className="text-xs text-slate-500">对应表内初始来源勾选</span>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        {fundingSourceOptions.map((option) => (
                          <CheckboxRow
                            key={`initial-${option.key}`}
                            label={option.label}
                            checked={formValues.initialFundingSources.includes(option.key)}
                            onChange={() =>
                              updateField(
                                "initialFundingSources",
                                toggleArrayValue(
                                  formValues.initialFundingSources,
                                  option.key as FundingSourceKey,
                                ),
                              )
                            }
                          />
                        ))}
                      </div>
                      {formValues.initialFundingSources.includes("other") ? (
                        <Field label="初始资金来源其他说明">
                          <input
                            className={textInputClassName}
                            value={formValues.initialFundingOther}
                            onChange={(event) =>
                              updateField("initialFundingOther", event.target.value)
                            }
                          />
                        </Field>
                      ) : null}
                    </div>

                    <div className="grid gap-4">
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-semibold text-slate-900">持续资金来源</h3>
                        <span className="text-xs text-slate-500">对应表内持续来源勾选</span>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        {fundingSourceOptions.map((option) => (
                          <CheckboxRow
                            key={`ongoing-${option.key}`}
                            label={option.label}
                            checked={formValues.ongoingFundingSources.includes(option.key)}
                            onChange={() =>
                              updateField(
                                "ongoingFundingSources",
                                toggleArrayValue(
                                  formValues.ongoingFundingSources,
                                  option.key as FundingSourceKey,
                                ),
                              )
                            }
                          />
                        ))}
                      </div>
                      {formValues.ongoingFundingSources.includes("other") ? (
                        <Field label="持续资金来源其他说明">
                          <input
                            className={textInputClassName}
                            value={formValues.ongoingFundingOther}
                            onChange={(event) =>
                              updateField("ongoingFundingOther", event.target.value)
                            }
                          />
                        </Field>
                      ) : null}
                    </div>
                  </div>

                  <div className="grid gap-4">
                    {formValues.authorizedPersons.map((person, index) => (
                      <AuthorizedPersonForm
                        key={`authorized-person-${index}`}
                        index={index}
                        value={person}
                        onChange={(patch) => updateAuthorizedPerson(index, patch)}
                      />
                    ))}
                  </div>

                  <div className="grid gap-8 xl:grid-cols-[0.95fr_1.05fr]">
                    <div className="grid gap-4">
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-semibold text-slate-900">投资目标</h3>
                        <span className="text-xs text-slate-500">对应风险偏好与目的</span>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        {investmentObjectiveOptions.map((option) => (
                          <RadioTile
                            key={option.key}
                            label={option.label}
                            active={formValues.investmentObjective === option.key}
                            onClick={() =>
                              updateField(
                                "investmentObjective",
                                option.key as InvestmentObjectiveKey,
                              )
                            }
                          />
                        ))}
                      </div>
                      {formValues.investmentObjective === "other" ? (
                        <Field label="其他投资目标说明">
                          <input
                            className={textInputClassName}
                            value={formValues.investmentObjectiveOther}
                            onChange={(event) =>
                              updateField("investmentObjectiveOther", event.target.value)
                            }
                          />
                        </Field>
                      ) : null}

                      <div className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-4">
                        <div className="flex items-center justify-between">
                          <h3 className="text-sm font-semibold text-slate-900">衍生产品认知</h3>
                          <span className="text-xs text-slate-500">风险声明区</span>
                        </div>
                        <div className="grid gap-3">
                          {derivativeKnowledgeOptions.map((option) => (
                            <CheckboxRow
                              key={option.key}
                              label={option.label}
                              checked={formValues.derivativeKnowledge.includes(option.key)}
                              onChange={() =>
                                updateField(
                                  "derivativeKnowledge",
                                  toggleArrayValue(
                                    formValues.derivativeKnowledge,
                                    option.key as DerivativeKnowledgeKey,
                                  ),
                                )
                              }
                            />
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="grid gap-4">
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-semibold text-slate-900">投资经验矩阵</h3>
                        <span className="text-xs text-slate-500">
                          已填写 {countCompletedExperiences(formValues)} / {experienceRows.length}
                        </span>
                      </div>
                      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                        <div className="grid grid-cols-[minmax(0,1.6fr)_0.7fr_0.7fr] gap-px bg-slate-200 text-xs font-semibold text-slate-600">
                          <div className="bg-slate-50 px-4 py-3">经验项目</div>
                          <div className="bg-slate-50 px-4 py-3">无</div>
                          <div className="bg-slate-50 px-4 py-3">有 / 年数</div>
                        </div>
                        <div className="grid gap-px bg-slate-200">
                          {experienceRows.map((row) => {
                            const entry = formValues.experiences[row.key as ExperienceKey];
                            return (
                              <div
                                key={row.key}
                                className="grid grid-cols-[minmax(0,1.6fr)_0.7fr_0.7fr] gap-px"
                              >
                                <div className="bg-white px-4 py-3">
                                  <p className="text-sm font-medium text-slate-900">{row.label}</p>
                                  <p className="mt-1 text-xs text-slate-500">
                                    {row.englishLabel}
                                  </p>
                                </div>
                                <div className="bg-white px-3 py-3">
                                  <button
                                    type="button"
                                    onClick={() => updateExperience(row.key, { enabled: false, years: "" })}
                                    className={sectionButtonClass(!entry.enabled)}
                                  >
                                    无
                                  </button>
                                </div>
                                <div className="bg-white px-3 py-3">
                                  <div className="flex items-center gap-2">
                                    <button
                                      type="button"
                                      onClick={() => updateExperience(row.key, { enabled: true })}
                                      className={sectionButtonClass(entry.enabled)}
                                    >
                                      有
                                    </button>
                                    <input
                                      className="min-h-10 w-20 rounded-lg border border-slate-300 px-3 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/15"
                                      value={entry.years}
                                      onChange={(event) =>
                                        updateExperience(row.key, {
                                          enabled: true,
                                          years: event.target.value,
                                        })
                                      }
                                      placeholder="年数"
                                    />
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </section>
            ) : null}

            {activeStep === "review" ? (
              <section className={`${panelClassName} px-5 py-5 sm:px-6 lg:px-8 lg:py-7`}>
                <SectionHeading
                  eyebrow="Step 4"
                  title="生成申请文件、检查、签字并导出签署版"
                  body="先生成复核版 PDF 供客户检查；发现问题时可直接返回上一步修改。确认无误后，在这里完成电子签名并导出签署版 PDF。"
                />

                <div className="mt-6 grid gap-6 xl:grid-cols-[0.96fr_1.04fr]">
                  <div className="grid gap-4">
                    <div className="rounded-2xl border border-slate-200 bg-white px-5 py-5">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <h3 className="text-sm font-semibold text-slate-900">缺项检查</h3>
                          <p className="mt-1 text-xs text-slate-500">
                            先确认是否还有会影响生成申请文件的字段缺失。
                          </p>
                        </div>
                        <span
                          className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
                            missingItems.filter((item) => item.step === "funding").length === 0
                              ? "bg-emerald-50 text-emerald-700"
                              : "bg-amber-50 text-amber-700"
                          }`}
                        >
                          {missingItems.filter((item) => item.step === "funding").length === 0
                            ? "可生成"
                            : `${missingItems.filter((item) => item.step === "funding").length} 项待补`}
                        </span>
                      </div>
                      <div className="mt-4 grid gap-2">
                        {missingItems.filter((item) => item.step === "funding").length === 0 ? (
                          <div className="rounded-xl bg-emerald-50 px-4 py-4 text-sm text-emerald-700">
                            基础字段已齐，可以生成复核版 PDF。
                          </div>
                        ) : (
                          missingItems
                            .filter((item) => item.step === "funding")
                            .map((item) => (
                              <button
                                key={`${item.step}-${item.label}`}
                                type="button"
                                onClick={() => setActiveStep(item.step)}
                                className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-left transition hover:border-slate-300 hover:bg-white"
                              >
                                <div>
                                  <p className="text-sm font-medium text-slate-900">
                                    {item.label}
                                  </p>
                                  <p className="mt-1 text-xs text-slate-500">
                                    返回 {steps.find((step) => step.id === item.step)?.label}
                                  </p>
                                </div>
                                <ChevronRight className="h-4 w-4 text-slate-400" />
                              </button>
                            ))
                        )}
                      </div>
                    </div>

                    <div className="rounded-2xl border border-slate-200 bg-white px-5 py-5">
                      <Field
                        label="复核备注"
                        hint="如果客户在检查版 PDF 上指出问题，可先记录在这里，便于回退修改。"
                      >
                        <textarea
                          className={textareaClassName}
                          value={formValues.reviewNotes}
                          onChange={(event) => updateField("reviewNotes", event.target.value)}
                          placeholder="例如：第 2 页注册号码需要更正；授权人住址需补齐。"
                        />
                      </Field>

                      <div className="mt-4 flex flex-wrap gap-3">
                        <button
                          type="button"
                          onClick={() => {
                            void generatePdf("review");
                          }}
                          disabled={isGeneratingPdf}
                          className="inline-flex items-center gap-2 rounded-full bg-slate-950 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
                        >
                          {isGeneratingPdf ? (
                            <LoaderCircle className="h-4 w-4 animate-spin" />
                          ) : (
                            <FileSearch className="h-4 w-4" />
                          )}
                          生成复核版 PDF
                        </button>
                        <button
                          type="button"
                          onClick={() => setActiveStep(getFirstIncompleteStep(formValues))}
                          className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:text-slate-950"
                        >
                          <RefreshCcw className="h-4 w-4" />
                          回到待补步骤
                        </button>
                        {reviewPdfUrl ? (
                          <a
                            href={reviewPdfUrl}
                            download="company-account-review.pdf"
                            className="inline-flex items-center gap-2 rounded-full border border-emerald-300 bg-emerald-50 px-4 py-2.5 text-sm font-medium text-emerald-700 transition hover:border-emerald-400"
                          >
                            <BadgeCheck className="h-4 w-4" />
                            下载复核版
                          </a>
                        ) : null}
                      </div>
                    </div>

                    <div className="grid gap-4 rounded-2xl border border-slate-200 bg-white px-5 py-5 md:grid-cols-2">
                      <Field label="客户签署姓名">
                        <input
                          className={textInputClassName}
                          value={formValues.clientSignatureName}
                          onChange={(event) =>
                            updateField("clientSignatureName", event.target.value)
                          }
                        />
                      </Field>
                      <Field label="获授权签署人">
                        <input
                          className={textInputClassName}
                          value={formValues.authorizedSignatoryName}
                          onChange={(event) =>
                            updateField("authorizedSignatoryName", event.target.value)
                          }
                        />
                      </Field>
                      <Field label="见证人姓名">
                        <input
                          className={textInputClassName}
                          value={formValues.witnessName}
                          onChange={(event) => updateField("witnessName", event.target.value)}
                        />
                      </Field>
                      <Field label="见证人职业">
                        <input
                          className={textInputClassName}
                          value={formValues.witnessOccupation}
                          onChange={(event) =>
                            updateField("witnessOccupation", event.target.value)
                          }
                        />
                      </Field>
                      <Field label="见证人所属公司">
                        <input
                          className={textInputClassName}
                          value={formValues.witnessCompanyName}
                          onChange={(event) =>
                            updateField("witnessCompanyName", event.target.value)
                          }
                        />
                      </Field>
                      <Field label="签署日期">
                        <input
                          type="date"
                          className={textInputClassName}
                          value={formValues.declarationDate}
                          onChange={(event) =>
                            updateField("declarationDate", event.target.value)
                          }
                        />
                      </Field>
                      <div className="md:col-span-2">
                        <Field label="见证人公司地址">
                          <textarea
                            className={textareaClassName}
                            value={formValues.witnessCompanyAddress}
                            onChange={(event) =>
                              updateField("witnessCompanyAddress", event.target.value)
                            }
                          />
                        </Field>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-slate-200 bg-white px-5 py-5">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <h3 className="text-sm font-semibold text-slate-900">电子签字板</h3>
                          <p className="mt-1 text-xs text-slate-500">
                            这份签名会落到最终签署版申请文件中。
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            signatureRef.current?.clear();
                            setSignaturePreview(null);
                          }}
                          className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:border-slate-400"
                        >
                          <RefreshCcw className="h-3.5 w-3.5" />
                          清除签名
                        </button>
                      </div>

                      <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-[linear-gradient(180deg,#fffef9_0%,#fff8ee_100%)]">
                        <SignatureCapture
                          ref={signatureRef}
                          onEnd={() => {
                            setSignaturePreview(signatureRef.current?.toDataUrl() ?? null);
                            setStatusMessage("签名已捕捉，可生成签署版 PDF。");
                          }}
                        />
                      </div>

                      <div className="mt-3 flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3">
                        <span className="text-xs text-slate-500">当前签名状态</span>
                        <span
                          className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-medium ${
                            signaturePreview
                              ? "bg-emerald-50 text-emerald-700"
                              : "bg-slate-200 text-slate-600"
                          }`}
                        >
                          {signaturePreview ? "已捕捉签名" : "尚未签名"}
                        </span>
                      </div>

                      <div className="mt-4 flex flex-wrap gap-3">
                        <button
                          type="button"
                          onClick={() => {
                            void generatePdf("final");
                          }}
                          disabled={isGeneratingPdf}
                          className="inline-flex items-center gap-2 rounded-full bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-400"
                        >
                          {isGeneratingPdf ? (
                            <LoaderCircle className="h-4 w-4 animate-spin" />
                          ) : (
                            <ShieldCheck className="h-4 w-4" />
                          )}
                          生成签署版 PDF
                        </button>
                        {signedPdfUrl ? (
                          <a
                            href={signedPdfUrl}
                            download="company-account-signed.pdf"
                            className="inline-flex items-center gap-2 rounded-full border border-emerald-300 bg-emerald-50 px-4 py-2.5 text-sm font-medium text-emerald-700 transition hover:border-emerald-400"
                          >
                            <FileCheck2 className="h-4 w-4" />
                            下载签署版
                          </a>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-4">
                    <div className="rounded-2xl border border-slate-200 bg-white px-5 py-5">
                      <div className="mb-4 flex items-center justify-between gap-3">
                        <div>
                          <h3 className="text-sm font-semibold text-slate-900">
                            {signedPdfUrl
                              ? "签署版 PDF"
                              : reviewPdfUrl
                                ? "复核版 PDF"
                                : "模板预览"}
                          </h3>
                          <p className="mt-1 text-xs text-slate-500">
                            优先展示最新生成文件；未生成时展示模板页面参考。
                          </p>
                        </div>
                        {signedPdfUrl ? (
                          <a
                            href={signedPdfUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:border-slate-400"
                          >
                            新窗口查看
                            <ArrowRight className="h-3.5 w-3.5" />
                          </a>
                        ) : reviewPdfUrl ? (
                          <a
                            href={reviewPdfUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:border-slate-400"
                          >
                            新窗口查看
                            <ArrowRight className="h-3.5 w-3.5" />
                          </a>
                        ) : null}
                      </div>
                      {signedPdfUrl || reviewPdfUrl ? (
                        <iframe
                          title="Generated PDF preview"
                          src={signedPdfUrl ?? reviewPdfUrl ?? undefined}
                          className="h-[760px] w-full rounded-xl border border-slate-200 bg-slate-50"
                        />
                      ) : (
                        <div className="grid gap-4 lg:grid-cols-2">
                          {previewDeck.map((preview) => (
                            <div
                              key={preview.src}
                              className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50"
                            >
                              <div className="relative aspect-[0.82] w-full bg-slate-100">
                                <Image
                                  src={preview.src}
                                  alt={preview.title}
                                  fill
                                  className="object-cover object-top"
                                  sizes="(max-width: 1024px) 100vw, 22vw"
                                />
                              </div>
                              <div className="px-4 py-3">
                                <p className="text-sm font-semibold text-slate-900">
                                  {preview.title}
                                </p>
                                <p className="mt-1 text-xs leading-5 text-slate-500">
                                  {preview.subtitle}
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </section>
            ) : null}

            {activeStep === "sign" ? (
              <section className={`${panelClassName} px-5 py-5 sm:px-6 lg:px-8 lg:py-7`}>
                <SectionHeading
                  eyebrow="Step 5"
                  title="确认最终材料包，并发送到后台"
                  body="这一页展示最终会发送到后台的完整材料包，包括签署版开户申请文件和所有支持文件。确认无误后，点击发送到后台。"
                />

                <div className="mt-6 grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
                  <div className="grid gap-4">
                    <div className="rounded-2xl border border-slate-200 bg-slate-950 px-5 py-5 text-white">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <h3 className="text-sm font-semibold">最终申请文件</h3>
                          <p className="mt-1 text-xs text-white/55">
                            系统生成的签署版 PDF 会作为材料包主文件。
                          </p>
                        </div>
                        <span
                          className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
                            signedReady
                              ? "bg-emerald-100 text-emerald-700"
                              : "bg-amber-100 text-amber-700"
                          }`}
                        >
                          {signedReady ? "已就绪" : "待生成"}
                        </span>
                      </div>
                      <div className="mt-4 rounded-xl border border-white/10 bg-white/6 px-4 py-4">
                        <p className="text-sm font-semibold text-white">
                          开户申请表、客户协议及风险取向问卷
                        </p>
                        <p className="mt-1 text-xs leading-5 text-white/65">
                          由系统根据客户填写内容生成，并在第 4 步完成签字后入包。
                        </p>
                        <div className="mt-3 flex flex-wrap gap-3">
                          {signedPdfUrl ? (
                            <a
                              href={signedPdfUrl}
                              download="company-account-signed.pdf"
                              className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-white/14"
                            >
                              <FileCheck2 className="h-3.5 w-3.5" />
                              下载签署版
                            </a>
                          ) : null}
                          <span className="inline-flex items-center gap-2 rounded-full bg-white/8 px-3 py-1.5 text-xs text-white/70">
                            当前状态：{signedReady ? "已生成" : "尚未生成"}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-slate-200 bg-white px-5 py-5">
                      <div className="mb-4 flex items-center justify-between gap-3">
                        <div>
                          <h3 className="text-sm font-semibold text-slate-900">支持文件清单</h3>
                          <p className="mt-1 text-xs text-slate-500">
                            下列文件会和签署版申请文件一起发送到后台。
                          </p>
                        </div>
                        <span className="text-xs text-slate-500">{documents.length} 份文件</span>
                      </div>
                      <div className="mb-4 flex flex-wrap items-center gap-2">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${companyRegionMeta.className}`}
                        >
                          {companyRegionMeta.label}
                        </span>
                        <span className="text-xs text-slate-500">{companyRegionMeta.note}</span>
                      </div>
                      <div className="grid gap-3">
                        {visibleUploadRequirements.map((requirement) => {
                          const requirementDocuments =
                            documentsByRequirement.get(requirement.key) ?? [];
                          const isRequired = requiredUploadRequirements.some(
                            (item) => item.key === requirement.key,
                          );
                          return (
                            <div
                              key={requirement.key}
                              className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-4"
                            >
                              <div className="flex items-center justify-between gap-3">
                                <div>
                                  <p className="text-sm font-semibold text-slate-900">
                                    {requirement.label}
                                  </p>
                                  {requirement.note ? (
                                    <p className="mt-1 text-xs text-slate-500">
                                      {requirement.note}
                                    </p>
                                  ) : null}
                                </div>
                                <div className="flex flex-wrap items-center justify-end gap-2">
                                  <span
                                    className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ${
                                      isRequired
                                        ? "bg-rose-100 text-rose-700"
                                        : "bg-slate-200 text-slate-600"
                                    }`}
                                  >
                                    {isRequired ? "必需" : "可跳过"}
                                  </span>
                                  <span
                                    className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-medium ${
                                      requirementDocuments.length > 0
                                        ? "bg-emerald-50 text-emerald-700"
                                        : "bg-slate-200 text-slate-600"
                                    }`}
                                  >
                                    {requirementDocuments.length > 0
                                      ? `${requirementDocuments.length} 份`
                                      : "未上传"}
                                  </span>
                                </div>
                              </div>
                              {requirementDocuments.length > 0 ? (
                                <div className="mt-3 grid gap-2">
                                  {requirementDocuments.map((document) => (
                                    <div
                                      key={document.id}
                                      className="rounded-lg bg-white px-3 py-2 text-xs text-slate-600"
                                    >
                                      {document.name}
                                    </div>
                                  ))}
                                </div>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-4">
                    <div className="rounded-2xl border border-slate-200 bg-white px-5 py-5">
                      <div className="mb-4 flex items-center justify-between gap-3">
                        <div>
                          <h3 className="text-sm font-semibold text-slate-900">发送前确认</h3>
                          <p className="mt-1 text-xs text-slate-500">
                            发送动作会把当前表单、预填结果、支持文件清单和签署版申请文件状态一并落到后台。
                          </p>
                        </div>
                      </div>
                      <div className="grid gap-3">
                        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-4">
                          <p className="text-xs text-slate-500">公司名称</p>
                          <p className="mt-1 text-sm font-semibold text-slate-900">
                            {formValues.companyNameEnglish || "未填写"}
                          </p>
                        </div>
                        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-4">
                          <p className="text-xs text-slate-500">上传状态</p>
                          <p className="mt-1 text-sm font-semibold text-slate-900">
                            {uploadedRequirementCount}/{requiredUploadRequirements.length} 项必需材料已上传
                          </p>
                          {missingRequiredUploadRequirements.length > 0 ? (
                            <p className="mt-1 text-xs text-amber-700">
                              待补：{missingRequiredUploadRequirements.map((item) => item.label).join("、")}
                            </p>
                          ) : (
                            <p className="mt-1 text-xs text-emerald-700">必需材料已齐。</p>
                          )}
                        </div>
                        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-4">
                          <p className="text-xs text-slate-500">签署状态</p>
                          <p className="mt-1 text-sm font-semibold text-slate-900">
                            {signedReady ? "签署版 PDF 已生成" : "尚未生成签署版 PDF"}
                          </p>
                        </div>
                        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-4">
                          <p className="text-xs text-slate-500">后台状态</p>
                          <p className="mt-1 text-sm font-semibold text-slate-900">
                            {backendDetail}
                          </p>
                        </div>
                      </div>

                      <div className="mt-5 flex flex-wrap gap-3">
                        <button
                          type="button"
                          onClick={() => {
                            void submitPackage();
                          }}
                          disabled={isSubmittingPackage || packageSubmitted}
                          className="inline-flex items-center gap-2 rounded-full bg-slate-950 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
                        >
                          {isSubmittingPackage ? (
                            <LoaderCircle className="h-4 w-4 animate-spin" />
                          ) : (
                            <Send className="h-4 w-4" />
                          )}
                          {packageSubmitted ? "已发送到后台" : "确认发送到后台"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setActiveStep("review")}
                          className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:text-slate-950"
                        >
                          <RefreshCcw className="h-4 w-4" />
                          返回签署步骤
                        </button>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-slate-200 bg-white px-5 py-5">
                      <div className="mb-4 flex items-center justify-between gap-3">
                        <div>
                          <h3 className="text-sm font-semibold text-slate-900">申请文件预览</h3>
                          <p className="mt-1 text-xs text-slate-500">
                            当前会话内可直接查看最近生成的签署版文件。
                          </p>
                        </div>
                      </div>
                      {signedPdfUrl ? (
                        <iframe
                          title="Signed PDF preview"
                          src={signedPdfUrl}
                          className="h-[680px] w-full rounded-xl border border-slate-200 bg-slate-50"
                        />
                      ) : (
                        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-sm text-slate-500">
                          尚未生成签署版 PDF。
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </section>
            ) : null}

            <div className={`${panelClassName} px-5 py-4 sm:px-6`}>
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="text-sm font-semibold text-slate-900">
                    当前步骤：{steps.find((step) => step.id === activeStep)?.label}
                  </p>
                  <p className="mt-1 text-xs leading-5 text-slate-500">{helperText}</p>
                </div>
                <div className="flex flex-wrap gap-3">
                  {activeStep !== "upload" ? (
                    <button
                      type="button"
                      onClick={() =>
                        setActiveStep(steps[Math.max(stepIndex(activeStep) - 1, 0)].id)
                      }
                      className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:border-slate-400"
                    >
                      返回上一步
                    </button>
                  ) : null}
                  {activeStep !== "sign" ? (
                    <button
                      type="button"
                      onClick={jumpToNextStep}
                      className="inline-flex items-center gap-2 rounded-full bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-emerald-700"
                    >
                      继续下一步
                      <ArrowRight className="h-4 w-4" />
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          </div>

          <aside className="flex min-w-0 flex-col gap-6">
            <div className={`${panelClassName} overflow-hidden`}>
              <div className="border-b border-slate-200 px-5 py-4">
                <h3 className="text-sm font-semibold text-slate-900">模板与输出参考</h3>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  页面围绕原始开户表设计，生成文件仍直接使用原 PDF 模板。
                </p>
              </div>
              <div className="grid gap-4 px-5 py-5">
                {previewDeck.map((preview) => (
                  <div
                    key={preview.src}
                    className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
                  >
                    <div className="relative aspect-[1.18] w-full bg-slate-100">
                      <Image
                        src={preview.src}
                        alt={preview.title}
                        fill
                        className="object-cover object-top"
                        sizes="(max-width: 1024px) 100vw, 28vw"
                      />
                    </div>
                    <div className="px-4 py-4">
                      <h3 className="text-sm font-semibold text-slate-900">{preview.title}</h3>
                      <p className="mt-1 text-xs leading-5 text-slate-500">
                        {preview.subtitle}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className={`${panelClassName} px-5 py-5`}>
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-amber-500" />
                <h3 className="text-sm font-semibold text-slate-900">当前实现边界</h3>
              </div>
              <ul className="mt-3 grid gap-3 text-sm leading-6 text-slate-600">
                <li>文字型资料会优先参与自动摘取；图片类资料当前版本先做原件保存与归档展示。</li>
                <li>最终发送到后台的主文件是系统生成的签署版 PDF，不需要客户在第一步上传。</li>
                <li>支持文件、草稿状态、复核版和签署版 PDF 都会同步到 Supabase。</li>
              </ul>
            </div>
          </aside>
        </section>
      </main>
    </div>
  );
}
