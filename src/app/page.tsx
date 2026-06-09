"use client";

import Image from "next/image";
import {
  AlertCircle,
  ArrowRight,
  BadgeCheck,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  FileArchive,
  FilePenLine,
  FileSearch,
  LoaderCircle,
  PenSquare,
  RefreshCcw,
  ShieldCheck,
  Sparkles,
  Upload,
} from "lucide-react";
import {
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
  type PrefillFinding,
  type StepId,
  type UploadedDocument,
} from "@/lib/company-account-schema";
import {
  countCompletedExperiences,
  createInitialFormValues,
  extractDocumentData,
  formatBytes,
  getFirstIncompleteStep,
  getMissingItems,
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
    title: "把原始资料先收全",
    description: "上传商业登记、公司注册文件、联络资料或已有客户清单，系统先做首轮摘取。",
    icon: Upload,
  },
  company: {
    title: "把开户必填项补齐",
    description: "先锁定公司资料、账户类型、通讯方式和开户编号，保证生成版 PDF 有完整骨架。",
    icon: FilePenLine,
  },
  funding: {
    title: "把风险与资金部分电子化",
    description: "资金来源、投资目标、经验矩阵和授权人信息都在这一段完成，直接对应原始表格页码。",
    icon: ShieldCheck,
  },
  review: {
    title: "先出复核版，再决定回退点",
    description: "生成与原始表格一致的 PDF 草稿，让客户逐页核对，不对的地方直接退回修改。",
    icon: FileSearch,
  },
  sign: {
    title: "确认无误后电子签名",
    description: "签署人、见证人和签名图像会落回模板固定位置，最后导出签署版 PDF。",
    icon: PenSquare,
  },
};

const metrics = [
  { label: "原表页数", value: "13", accent: "from-amber-500/35 to-orange-500/10" },
  { label: "内置字段", value: "10", accent: "from-emerald-500/35 to-teal-500/10" },
  { label: "关键签署位", value: "4", accent: "from-rose-500/35 to-pink-500/10" },
];

const textInputClassName =
  "min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/15";

const textareaClassName =
  "min-h-28 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/15";

const panelClassName =
  "rounded-lg border border-white/70 bg-white/88 shadow-[0_24px_60px_-40px_rgba(15,23,42,0.38)] backdrop-blur";

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
      <p className="max-w-3xl text-sm leading-7 text-slate-600 sm:text-[15px]">
        {body}
      </p>
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
              <p
                className={`text-xs leading-5 ${
                  active ? "text-white/72" : "text-slate-500"
                }`}
              >
                {stepCard.description}
              </p>
            </div>
          </button>
        );
      })}
    </nav>
  );
}

function DocumentList({
  documents,
  findings,
}: {
  documents: UploadedDocument[];
  findings: PrefillFinding[];
}) {
  if (documents.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-white/70 px-5 py-8 text-sm text-slate-500">
        还没有上传资料。可直接拖入 PDF、TXT、CSV、Markdown 或 JSON。
      </div>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
      <div className="grid gap-3">
        {documents.map((document) => (
          <div
            key={document.id}
            className="rounded-xl border border-slate-200 bg-white px-4 py-4 shadow-sm"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
                    <FileArchive className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900">
                      {document.name}
                    </p>
                    <p className="text-xs text-slate-500">
                      {formatBytes(document.size)} ·{" "}
                      {document.extractable ? "已参与预填" : "仅保存原件"}
                    </p>
                  </div>
                </div>
              </div>
              <span
                className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-medium ${
                  document.extractable
                    ? "bg-emerald-50 text-emerald-700"
                    : "bg-slate-100 text-slate-500"
                }`}
              >
                {document.extractable ? "extractable" : "manual"}
              </span>
            </div>
            <p className="mt-3 text-xs leading-5 text-slate-500">{document.parseNote}</p>
            {document.extractedTextSample ? (
              <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-600">
                {document.extractedTextSample}
              </p>
            ) : null}
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-slate-200 bg-slate-950 px-4 py-4 text-white">
        <div className="mb-3 flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-amber-300" />
          <h3 className="text-sm font-semibold">自动预填命中</h3>
        </div>
        {findings.length === 0 ? (
          <p className="text-sm leading-6 text-white/68">
            目前还没有命中字段。上传文字型资料后，这里会列出“从哪份资料提取了哪项信息”。
          </p>
        ) : (
          <div className="grid gap-2">
            {findings.map((finding, index) => (
              <div
                key={`${finding.field}-${index}`}
                className="rounded-lg border border-white/10 bg-white/6 px-3 py-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-white">{finding.label}</span>
                  <span className="truncate text-[11px] text-white/58">{finding.source}</span>
                </div>
                <p className="mt-1 text-sm text-emerald-200">{finding.value}</p>
              </div>
            ))}
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
      <div className="lg:col-span-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-900">授权人 {index + 1}</h3>
        <span className="text-xs text-slate-500">对应原表第 5-6 页签名样本区</span>
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
      <Field label="住宅地址" hint="会回填到授权人信息区的地址栏">
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
  const [activeStep, setActiveStep] = useState<StepId>("upload");
  const [formValues, setFormValues] = useState<CompanyAccountFormValues>(() => {
    const initial = createInitialFormValues();
    initial.intakeDate = todayString();
    initial.declarationDate = todayString();
    return initial;
  });
  const [documents, setDocuments] = useState<UploadedDocument[]>([]);
  const [findings, setFindings] = useState<PrefillFinding[]>([]);
  const [isExtracting, setIsExtracting] = useState(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfLabel, setPdfLabel] = useState("尚未生成 PDF");
  const [statusMessage, setStatusMessage] = useState("等待上传资料");
  const [errorMessage, setErrorMessage] = useState("");
  const [signaturePreview, setSignaturePreview] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (pdfUrl) {
        URL.revokeObjectURL(pdfUrl);
      }
    };
  }, [pdfUrl]);

  const summary = useMemo(() => summarizeSelections(formValues), [formValues]);
  const missingItems = useMemo(() => getMissingItems(formValues), [formValues]);
  const completedSteps = useMemo<StepId[]>(() => {
    const done: StepId[] = [];
    if (documents.length > 0) {
      done.push("upload");
    }
    if (!getStepValidationMessage("company", formValues)) {
      done.push("company");
    }
    if (!getStepValidationMessage("funding", formValues)) {
      done.push("funding");
    }
    if (pdfUrl) {
      done.push("review");
    }
    if (signaturePreview) {
      done.push("sign");
    }
    return done;
  }, [documents.length, formValues, pdfUrl, signaturePreview]);

  const progress = Math.round(((stepIndex(activeStep) + 1) / steps.length) * 100);
  const currentStepCard = stepCards[activeStep];
  const CurrentStepIcon = currentStepCard.icon;

  const updateField = <K extends keyof CompanyAccountFormValues>(
    key: K,
    value: CompanyAccountFormValues[K],
  ) => {
    setFormValues((current) => ({
      ...current,
      [key]: value,
    }));
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
  };

  const handleUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const fileList = event.target.files;
    if (!fileList?.length) {
      return;
    }

    setIsExtracting(true);
    setErrorMessage("");
    setStatusMessage("正在读取资料并匹配字段");

    try {
      let nextValues = formValues;
      const nextDocuments: UploadedDocument[] = [];
      const nextFindings: PrefillFinding[] = [];

      for (const file of Array.from(fileList)) {
        const result = await extractDocumentData(file);
        nextDocuments.push(result.document);
        nextFindings.push(...result.findings);
        nextValues = mergePatchIntoValues(nextValues, result.patch);
      }

      setDocuments((current) => [...current, ...nextDocuments]);
      setFindings((current) => [...current, ...nextFindings]);
      setFormValues(nextValues);
      setStatusMessage(`已处理 ${nextDocuments.length} 份资料，等待人工补录剩余字段`);
      setActiveStep("company");
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "资料解析失败，请更换文件格式后重试。",
      );
      setStatusMessage("资料解析失败");
    } finally {
      setIsExtracting(false);
      event.target.value = "";
    }
  };

  const jumpToNextStep = () => {
    const validation = getStepValidationMessage(activeStep, formValues);
    if (validation) {
      setErrorMessage(validation);
      return;
    }

    setErrorMessage("");
    const currentIndex = stepIndex(activeStep);
    if (currentIndex < steps.length - 1) {
      setActiveStep(steps[currentIndex + 1].id);
    }
  };

  const generatePdf = async (mode: "review" | "final") => {
    if (mode === "final" && signatureRef.current?.isEmpty()) {
      setErrorMessage("请先完成电子签名，再导出签署版 PDF。");
      setActiveStep("sign");
      return;
    }

    if (mode === "review") {
      const firstIncompleteStep = getFirstIncompleteStep(formValues);
      if (firstIncompleteStep !== "review" && firstIncompleteStep !== "sign") {
        setErrorMessage("基础资料还有缺项，请先补全后再生成复核版。");
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
      const nextUrl = URL.createObjectURL(blob);

      setPdfUrl((current) => {
        if (current) {
          URL.revokeObjectURL(current);
        }
        return nextUrl;
      });

      setPdfLabel(mode === "review" ? "复核版 PDF 已生成" : "签署版 PDF 已生成");
      setStatusMessage(
        mode === "review"
          ? "客户可以开始逐页核对，不对的地方直接退回修改。"
          : "签署版已生成，可下载或发送给客户归档。",
      );
      if (mode === "review") {
        setActiveStep("review");
      }
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "PDF 生成失败，请稍后重试。",
      );
      setStatusMessage("PDF 生成失败");
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(245,158,11,0.16),_transparent_26%),radial-gradient(circle_at_top_right,_rgba(16,185,129,0.14),_transparent_24%),linear-gradient(180deg,_#f7f6f2_0%,_#eef3f7_52%,_#f4f7fb_100%)] text-slate-900">
      <main className="mx-auto flex w-full max-w-[1520px] flex-col gap-8 px-4 py-4 sm:px-6 lg:px-8 lg:py-6">
        <section className={`${panelClassName} overflow-hidden`}>
          <div className="grid gap-6 px-5 py-5 sm:px-6 lg:grid-cols-[1.2fr_0.8fr] lg:px-8 lg:py-7">
            <div className="flex flex-col gap-6">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-2 rounded-full bg-slate-950 px-3 py-1.5 text-xs font-semibold text-white">
                  <ClipboardCheck className="h-3.5 w-3.5" />
                  Corporate account onboarding
                </span>
                <span className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-xs font-medium text-slate-600 ring-1 ring-slate-200">
                  <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                  与原始空白 PDF 同模板输出
                </span>
              </div>

              <div className="flex flex-col gap-3">
                <h1 className="max-w-4xl text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl lg:text-[2.75rem]">
                  把公司开户表做成一条完整的电子化录入与签署流程
                </h1>
                <p className="max-w-3xl text-sm leading-7 text-slate-600 sm:text-[15px]">
                  这版工作台直接围绕你提供的空白开户表搭建。客户先上传资料，系统先做可摘取字段的预填；人工补齐后，输出一份与原始表格一致的 PDF 草稿供复核；确认无误，再回到签署页完成电子签名并导出最终版本。
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                {metrics.map((metric) => (
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
                <p className="mt-3 text-xs leading-5 text-slate-500">
                  复核版生成后，客户可以直接指出哪一段要重写，再回到对应步骤修改并重新导出。
                </p>
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
                <h3 className="text-sm font-semibold text-slate-900">表单速览</h3>
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
                    账户类型
                  </p>
                  <p className="mt-2 leading-6 text-slate-700">
                    {summary.accountTypes || "尚未选择"}
                  </p>
                </div>
                <div className="rounded-xl bg-slate-50 px-3 py-3">
                  <p className="text-xs font-medium uppercase tracking-[0.12em] text-slate-500">
                    资金来源
                  </p>
                  <p className="mt-2 leading-6 text-slate-700">
                    {summary.initialFunding || "尚未填写初始来源"}
                  </p>
                  <p className="mt-1 text-xs leading-5 text-slate-500">
                    持续来源：{summary.ongoingFunding || "尚未填写"}
                  </p>
                </div>
                <div className="rounded-xl bg-slate-50 px-3 py-3">
                  <p className="text-xs font-medium uppercase tracking-[0.12em] text-slate-500">
                    签署状态
                  </p>
                  <p className="mt-2 leading-6 text-slate-700">
                    {signaturePreview ? "已捕捉电子签名" : "尚未签署"}
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
                  title="上传原始资料并做首轮自动预填"
                  body="当前版本优先支持 PDF、TXT、CSV、Markdown 和 JSON。对于已有结构化客户清单，JSON 或 CSV 命中率最高；对于商业登记证、注册文件等文字 PDF，也能直接抽取公司名称、地址、编号、电邮与电话。"
                />

                <div className="mt-6 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
                  <div className="rounded-2xl border border-dashed border-slate-300 bg-[linear-gradient(135deg,rgba(255,255,255,0.88),rgba(246,248,251,0.92))] px-5 py-6">
                    <div className="flex flex-col gap-4">
                      <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
                        <Upload className="h-5 w-5" />
                      </div>
                      <div>
                        <h3 className="text-lg font-semibold text-slate-950">
                          上传客户资料包
                        </h3>
                        <p className="mt-2 max-w-xl text-sm leading-7 text-slate-600">
                          建议优先上传商业登记证、公司注册证书、客户主数据清单和联系资料。系统会把命中的字段列到右侧，人工确认后再进入下一步。
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-3">
                        <label className="inline-flex cursor-pointer items-center gap-2 rounded-full bg-slate-950 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800">
                          <Upload className="h-4 w-4" />
                          选择资料
                          <input
                            type="file"
                            multiple
                            onChange={handleUpload}
                            className="hidden"
                            accept=".pdf,.txt,.csv,.md,.markdown,.json"
                          />
                        </label>
                        {isExtracting ? (
                          <span className="inline-flex items-center gap-2 text-sm text-slate-500">
                            <LoaderCircle className="h-4 w-4 animate-spin" />
                            正在解析
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-3">
                    {previewDeck.slice(0, 2).map((preview) => (
                      <div
                        key={preview.src}
                        className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
                      >
                        <div className="relative aspect-[1.16] w-full bg-slate-100">
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

                <div className="mt-6">
                  <DocumentList documents={documents} findings={findings} />
                </div>
              </section>
            ) : null}

            {activeStep === "company" ? (
              <section className={`${panelClassName} px-5 py-5 sm:px-6 lg:px-8 lg:py-7`}>
                <SectionHeading
                  eyebrow="Step 2"
                  title="公司资料、账户类型与联络方式"
                  body="这一段优先对应原表第 1-2 页的基础信息区。可先接受自动预填，再人工补齐开户编号、公司名称、地址、注册编号、联系渠道与账户类型。"
                />

                <div className="mt-6 grid gap-6">
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
                    <Field label="注册地址" hint="成立国家之注册地址">
                      <textarea
                        className={textareaClassName}
                        value={formValues.registeredAddress}
                        onChange={(event) =>
                          updateField("registeredAddress", event.target.value)
                        }
                      />
                    </Field>
                    <Field label="营业地址" hint="如与注册地址相同，可直接复制">
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
                    <Field label="商业登记号码">
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

                  <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
                    <div className="grid gap-3">
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-semibold text-slate-900">账户类型</h3>
                        <span className="text-xs text-slate-500">对应原表第 2 页 Account Type</span>
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
                </div>
              </section>
            ) : null}

            {activeStep === "funding" ? (
              <section className={`${panelClassName} px-5 py-5 sm:px-6 lg:px-8 lg:py-7`}>
                <SectionHeading
                  eyebrow="Step 3"
                  title="资金来源、资本结构、授权人和风险经验"
                  body="这一段对应原表第 5-6 页，是整份开户表里字段最多也最容易漏项的部分。界面已经按原始 PDF 顺序拆开，便于客户逐段填写。"
                />

                <div className="mt-6 grid gap-8">
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
                              onClick={() =>
                                updateField("sourceRegion", option.key)
                              }
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
                      <h3 className="text-sm font-semibold">资本结构与最近财务资料</h3>
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
                        <span className="text-xs text-slate-500">对应原表第 5 页第一组勾选</span>
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
                        <span className="text-xs text-slate-500">对应原表第 5 页第二组勾选</span>
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
                        <span className="text-xs text-slate-500">对应原表第 6 页顶部勾选</span>
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
                          <span className="text-xs text-slate-500">对应第 6 页风险声明区</span>
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
                                    onClick={() =>
                                      setFormValues((current) => ({
                                        ...current,
                                        experiences: {
                                          ...current.experiences,
                                          [row.key]: {
                                            enabled: false,
                                            years: "",
                                          },
                                        },
                                      }))
                                    }
                                    className={sectionButtonClass(!entry.enabled)}
                                  >
                                    无
                                  </button>
                                </div>
                                <div className="bg-white px-3 py-3">
                                  <div className="flex items-center gap-2">
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setFormValues((current) => ({
                                          ...current,
                                          experiences: {
                                            ...current.experiences,
                                            [row.key]: {
                                              ...current.experiences[row.key],
                                              enabled: true,
                                            },
                                          },
                                        }))
                                      }
                                      className={sectionButtonClass(entry.enabled)}
                                    >
                                      有
                                    </button>
                                    <input
                                      className="min-h-10 w-20 rounded-lg border border-slate-300 px-3 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/15"
                                      value={entry.years}
                                      onChange={(event) =>
                                        setFormValues((current) => ({
                                          ...current,
                                          experiences: {
                                            ...current.experiences,
                                            [row.key]: {
                                              enabled: true,
                                              years: event.target.value,
                                            },
                                          },
                                        }))
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
                  title="先出复核版，再决定回退哪里修改"
                  body="这里先做客户核对用的 PDF 草稿。若发现信息不对，可以直接记录修订说明，并一键回到对应步骤重新填写。"
                />

                <div className="mt-6 grid gap-6 xl:grid-cols-[0.92fr_1.08fr]">
                  <div className="grid gap-4">
                    <div className="rounded-2xl border border-slate-200 bg-white px-5 py-5">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <h3 className="text-sm font-semibold text-slate-900">缺项检查</h3>
                          <p className="mt-1 text-xs text-slate-500">
                            先看还有没有会影响生成 PDF 的必填项。
                          </p>
                        </div>
                        <span
                          className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
                            missingItems.length === 0
                              ? "bg-emerald-50 text-emerald-700"
                              : "bg-amber-50 text-amber-700"
                          }`}
                        >
                          {missingItems.length === 0 ? "可生成" : `${missingItems.length} 项待补`}
                        </span>
                      </div>
                      <div className="mt-4 grid gap-2">
                        {missingItems.length === 0 ? (
                          <div className="rounded-xl bg-emerald-50 px-4 py-4 text-sm text-emerald-700">
                            当前必填项已齐，可以生成复核版 PDF。
                          </div>
                        ) : (
                          missingItems.map((item) => (
                            <button
                              key={`${item.step}-${item.label}`}
                              type="button"
                              onClick={() => setActiveStep(item.step)}
                              className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-left transition hover:border-slate-300 hover:bg-white"
                            >
                              <div>
                                <p className="text-sm font-medium text-slate-900">{item.label}</p>
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
                        hint="客户在草稿 PDF 上指出的问题，可以先记在这里，重新导出时会保留到当前草稿。"
                      >
                        <textarea
                          className={textareaClassName}
                          value={formValues.reviewNotes}
                          onChange={(event) => updateField("reviewNotes", event.target.value)}
                          placeholder="例如：第 2 页注册证书号码需更正；第 5 页持续资金来源应补充“投资收入”。"
                        />
                      </Field>

                      <div className="mt-4 flex flex-wrap gap-3">
                        <button
                          type="button"
                          onClick={() => generatePdf("review")}
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
                        {pdfUrl ? (
                          <a
                            href={pdfUrl}
                            download="company-account-review.pdf"
                            className="inline-flex items-center gap-2 rounded-full border border-emerald-300 bg-emerald-50 px-4 py-2.5 text-sm font-medium text-emerald-700 transition hover:border-emerald-400"
                          >
                            <BadgeCheck className="h-4 w-4" />
                            下载当前草稿
                          </a>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-4">
                    <div className="rounded-2xl border border-slate-200 bg-white px-5 py-5">
                      <div className="mb-4 flex items-center justify-between gap-3">
                        <div>
                          <h3 className="text-sm font-semibold text-slate-900">{pdfLabel}</h3>
                          <p className="mt-1 text-xs text-slate-500">
                            直接嵌入预览，便于逐页核对。
                          </p>
                        </div>
                        {pdfUrl ? (
                          <a
                            href={pdfUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:border-slate-400"
                          >
                            新窗口查看
                            <ArrowRight className="h-3.5 w-3.5" />
                          </a>
                        ) : null}
                      </div>
                      {pdfUrl ? (
                        <iframe
                          title="Review PDF"
                          src={pdfUrl}
                          className="h-[680px] w-full rounded-xl border border-slate-200 bg-slate-50"
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
                  title="电子签名并导出签署版 PDF"
                  body="签署区对齐原表第 6 页客户确认签署栏，以及第 9 页公司盖章、见证人和日期区域。先完成签名，再生成最终版本。"
                />

                <div className="mt-6 grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
                  <div className="grid gap-4">
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
                            这份签名会同时落到第 6 页和第 9 页的签署区域。
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
                            setStatusMessage("签名已捕捉，可导出签署版 PDF。");
                          }}
                        />
                      </div>

                      <div className="mt-4 flex flex-wrap gap-3">
                        <button
                          type="button"
                          onClick={() => generatePdf("final")}
                          disabled={isGeneratingPdf}
                          className="inline-flex items-center gap-2 rounded-full bg-slate-950 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
                        >
                          {isGeneratingPdf ? (
                            <LoaderCircle className="h-4 w-4 animate-spin" />
                          ) : (
                            <ShieldCheck className="h-4 w-4" />
                          )}
                          导出签署版 PDF
                        </button>
                        {pdfUrl ? (
                          <a
                            href={pdfUrl}
                            download="company-account-signed.pdf"
                            className="inline-flex items-center gap-2 rounded-full border border-emerald-300 bg-emerald-50 px-4 py-2.5 text-sm font-medium text-emerald-700 transition hover:border-emerald-400"
                          >
                            <BadgeCheck className="h-4 w-4" />
                            下载最新 PDF
                          </a>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-4">
                    <div className="rounded-2xl border border-slate-200 bg-slate-950 px-5 py-5 text-white">
                      <h3 className="text-sm font-semibold">签署前确认</h3>
                      <div className="mt-4 grid gap-3">
                        <div className="rounded-xl border border-white/10 bg-white/6 px-4 py-3">
                          <p className="text-xs text-white/55">投资目标</p>
                          <p className="mt-1 text-sm text-white">{summary.objective || "未填写"}</p>
                        </div>
                        <div className="rounded-xl border border-white/10 bg-white/6 px-4 py-3">
                          <p className="text-xs text-white/55">衍生品认知</p>
                          <p className="mt-1 text-sm leading-6 text-white">
                            {summary.derivativeKnowledge || "未选择"}
                          </p>
                        </div>
                        <div className="rounded-xl border border-white/10 bg-white/6 px-4 py-3">
                          <p className="text-xs text-white/55">签名状态</p>
                          <p className="mt-1 text-sm text-white">
                            {signaturePreview ? "已捕捉签名图像" : "尚未签名"}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-slate-200 bg-white px-5 py-5">
                      <div className="mb-4 flex items-center justify-between gap-3">
                        <div>
                          <h3 className="text-sm font-semibold text-slate-900">签署区预览</h3>
                          <p className="mt-1 text-xs text-slate-500">
                            使用原始表格的第 6 页与第 9 页页面示意。
                          </p>
                        </div>
                      </div>
                      <div className="grid gap-4 sm:grid-cols-2">
                        {previewDeck.slice(2).map((preview) => (
                          <div
                            key={preview.src}
                            className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50"
                          >
                            <div className="relative aspect-[0.78] w-full bg-slate-100">
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
                  <p className="mt-1 text-xs leading-5 text-slate-500">
                    {getStepValidationMessage(activeStep, formValues) ||
                      "当前步骤必填项已齐，可以继续。"}
                  </p>
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
                <h3 className="text-sm font-semibold text-slate-900">模板页面参考</h3>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  页面设计尽量贴近原始表单结构，方便客户理解最终 PDF 会长什么样。
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
                <li>
                  文本型资料已经支持自动预填；图片类证照当前版本只保留原件，不做 OCR。
                </li>
                <li>
                  最终 PDF 已直接复用原始空白模板，不是重新仿制版式。
                </li>
                <li>
                  复核与签署链路已打通，下一步适合补服务端存储、权限控制和图像 OCR。
                </li>
              </ul>
            </div>
          </aside>
        </section>
      </main>
    </div>
  );
}
