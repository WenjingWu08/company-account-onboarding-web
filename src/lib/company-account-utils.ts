import {
  accountTypeOptions,
  initialUploadMaterialRequirements,
  createEmptyAuthorizedPerson,
  derivativeKnowledgeOptions,
  experienceRows,
  fundingSourceOptions,
  initialCompanyAccountFormValues,
  investmentObjectiveOptions,
  requiredFieldLabels,
  steps,
  type AuthorizedPerson,
  type CompanyAccountFormValues,
  type DocumentKind,
  type MaterialRequirementKey,
  type PrefillFinding,
  type StepId,
  type UploadedDocument,
} from "@/lib/company-account-schema";

type ExtractionResult = {
  document: UploadedDocument;
  findings: PrefillFinding[];
  patch: Partial<CompanyAccountFormValues>;
};

type TextPayload = {
  extractable: boolean;
  findings: PrefillFinding[];
  patch: Partial<CompanyAccountFormValues>;
  parseNote: string;
  text: string;
};

const readableMimeTypes = new Set([
  "application/json",
  "application/pdf",
  "text/plain",
  "text/csv",
  "text/markdown",
]);

const jsonKeyMap: Record<string, keyof CompanyAccountFormValues> = {
  account_no: "intakeReference",
  ac_opening_date: "intakeDate",
  business_address: "businessAddress",
  business_phone: "businessPhone",
  business_registration_no: "businessRegistrationNo",
  ccass_account: "ccassAccount",
  company_name_chinese: "companyNameChinese",
  company_name_english: "companyNameEnglish",
  contact_phone: "contactPhone",
  email: "email",
  fax: "fax",
  incorporation_date: "incorporationDate",
  incorporation_no: "incorporationNo",
  nature_of_business: "natureOfBusiness",
  registered_address: "registeredAddress",
};

const prefillRules: {
  field: keyof CompanyAccountFormValues;
  label: string;
  patterns: RegExp[];
}[] = [
  {
    field: "companyNameEnglish",
    label: "公司英文名称",
    patterns: [
      /(?:Name of Company|Company Name|Company English Name)[\s:：-]+([A-Z][A-Za-z0-9&.,()'\/ -]{4,80})/i,
    ],
  },
  {
    field: "companyNameChinese",
    label: "公司中文名称",
    patterns: [
      /(?:公司名稱|公司名称|中文名稱|Name in Chinese)[\s:：-]+([^\n]{2,40})/i,
    ],
  },
  {
    field: "registeredAddress",
    label: "注册地址",
    patterns: [
      /(?:Registered Office Address|Address of Registered Office in Country of Incorporation|成立國家之註冊地址|注册地址)[\s:：-]+([^\n]{8,140})/i,
    ],
  },
  {
    field: "businessAddress",
    label: "营业地址",
    patterns: [
      /(?:Business Address|辦事處地址|营业地址)[\s:：-]+([^\n]{8,140})/i,
    ],
  },
  {
    field: "businessRegistrationNo",
    label: "商业登记号码",
    patterns: [
      /(?:Business Registration(?: No\.?| Number)?|香港商業登記號碼)[\s:：-]+([A-Z0-9\-\/]{5,40})/i,
    ],
  },
  {
    field: "incorporationNo",
    label: "注册成立证书号码",
    patterns: [
      /(?:Certificate of Incorporation(?: No\.?)?|註冊成立證書號碼)[\s:：-]+([A-Z0-9\-\/]{5,40})/i,
    ],
  },
  {
    field: "incorporationDate",
    label: "注册日期",
    patterns: [
      /(?:Date of Incorporation|Incorporation Date|註冊日期)[\s:：-]+([0-9]{4}[-/.][0-9]{1,2}[-/.][0-9]{1,2}|[0-9]{1,2}[-/.][0-9]{1,2}[-/.][0-9]{2,4})/i,
    ],
  },
  {
    field: "natureOfBusiness",
    label: "业务性质",
    patterns: [
      /(?:Nature of Business|业务性质|業務性質)[\s:：-]+([^\n]{2,80})/i,
    ],
  },
  {
    field: "email",
    label: "电邮地址",
    patterns: [/\b([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})\b/i],
  },
  {
    field: "contactPhone",
    label: "联络人电话",
    patterns: [
      /(?:Contact Phone|聯絡人電話|联系人电话|Phone No\. of Contact Person)[\s:：-]+([+\d()\- ][\d()\- ]{6,30})/i,
      /(?:Tel(?:ephone)?|Phone)[\s:：-]+([+\d()\- ][\d()\- ]{6,30})/i,
    ],
  },
];

const normalizeWhitespace = (value: string) =>
  value.replace(/\s+/g, " ").replace(/[ ]+([,.;:])/g, "$1").trim();

const minRecognizedTextLength = 12;

const cleanMatchValue = (value: string) =>
  normalizeWhitespace(value)
    .replace(/^[-:：]+/, "")
    .replace(/\s*\(.*$/, "")
    .trim();

const buildDocumentId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `doc-${Date.now()}-${Math.random().toString(16).slice(2)}`;

const detectFileExtension = (name: string) => {
  const parts = name.toLowerCase().split(".");
  return parts.length > 1 ? parts.at(-1) ?? "" : "";
};

let ocrWorkerPromise: Promise<{
  recognize: (image: string | File) => Promise<{ data: { text: string } }>;
  setParameters: (params: Record<string, string>) => Promise<unknown>;
}> | null = null;

const isImageLikeFile = (file: File) => {
  if (file.type.startsWith("image/")) {
    return true;
  }

  return ["heic", "heif", "jpg", "jpeg", "png", "webp"].includes(
    detectFileExtension(file.name),
  );
};

const isReadableFile = (file: File) => {
  if (readableMimeTypes.has(file.type)) {
    return true;
  }

  return ["csv", "json", "md", "pdf", "txt"].includes(
    detectFileExtension(file.name),
  );
};

const getOcrWorker = async () => {
  if (!ocrWorkerPromise) {
    ocrWorkerPromise = (async () => {
      const { createWorker } = await import("tesseract.js");
      const worker = await createWorker(["eng", "chi_sim"], 1, {
        logger: () => undefined,
      });

      await worker.setParameters({
        preserve_interword_spaces: "1",
        user_defined_dpi: "300",
      });

      return worker;
    })().catch((error) => {
      ocrWorkerPromise = null;
      throw error;
    });
  }

  return ocrWorkerPromise;
};

const recognizeImageText = async (image: string | File) => {
  const worker = await getOcrWorker();
  const result = await worker.recognize(image);
  return normalizeWhitespace(result.data.text);
};

const renderPdfPageToImage = async (file: File, pageNumber: number) => {
  if (typeof document === "undefined") {
    throw new Error("OCR rendering is only available in the browser.");
  }

  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const data = new Uint8Array(await file.arrayBuffer());
  const pdf = await getDocument({ data } as never).promise;
  const page = await pdf.getPage(pageNumber);
  const viewport = page.getViewport({ scale: 2 });
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Canvas context is unavailable.");
  }

  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);

  await page.render({
    canvas,
    canvasContext: context,
    viewport,
  }).promise;

  return canvas.toDataURL("image/png");
};

const extractImageTextWithOcr = async (file: File): Promise<TextPayload> => {
  try {
    const text = await recognizeImageText(file);
    const normalizedText = normalizeWhitespace(text);
    const hasText = normalizedText.replace(/\s/g, "").length >= minRecognizedTextLength;

    return {
      extractable: hasText,
      findings: [],
      patch: {},
      parseNote: hasText
        ? "已完成图片 OCR，并纳入自动预填写。"
        : "已完成图片 OCR，但未识别到可用文本，原件已保留。",
      text: normalizedText,
    };
  } catch (error) {
    return {
      extractable: false,
      findings: [],
      patch: {},
      parseNote:
        error instanceof Error
          ? `图片 OCR 启动失败，已保存原件：${error.message}`
          : "图片 OCR 启动失败，已保存原件。",
      text: "",
    };
  }
};

const extractPdfTextWithOcr = async (file: File): Promise<TextPayload> => {
  try {
    const text = await extractPdfText(file);
    const normalizedText = normalizeWhitespace(text);
    const hasReadableText =
      normalizedText.replace(/\s/g, "").length >= minRecognizedTextLength;

    if (hasReadableText) {
      return {
        extractable: true,
        findings: [],
        patch: {},
        parseNote: "已提取 PDF 文本并完成首轮字段匹配。",
        text: normalizedText,
      };
    }

    const pageImages: string[] = [];
    const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const data = new Uint8Array(await file.arrayBuffer());
    const pdf = await getDocument({ data } as never).promise;
    const pageLimit = Math.min(pdf.numPages, 3);

    for (let index = 1; index <= pageLimit; index += 1) {
      pageImages.push(await renderPdfPageToImage(file, index));
    }

    const ocrChunks: string[] = [];
    for (const image of pageImages) {
      const chunk = await recognizeImageText(image);
      if (chunk) {
        ocrChunks.push(chunk);
      }
    }

    const ocrText = normalizeWhitespace(ocrChunks.join("\n"));
    const hasOcrText = ocrText.replace(/\s/g, "").length >= minRecognizedTextLength;

    return {
      extractable: hasOcrText,
      findings: [],
      patch: {},
      parseNote: hasOcrText
        ? "PDF 原文不可提取，已改用页面 OCR 并纳入自动预填写。"
        : "PDF 原文不可提取，已尝试页面 OCR，但未识别到可用文本。",
      text: ocrText,
    };
  } catch (error) {
    return {
      extractable: false,
      findings: [],
      patch: {},
      parseNote:
        error instanceof Error
          ? `PDF OCR 处理失败，已保存原件：${error.message}`
          : "PDF OCR 处理失败，已保存原件。",
      text: "",
    };
  }
};

const extractPdfText = async (file: File) => {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const data = new Uint8Array(await file.arrayBuffer());
  const pdf = await getDocument({ data } as never).promise;
  const pageLimit = Math.min(pdf.numPages, 8);
  const chunks: string[] = [];

  for (let index = 1; index <= pageLimit; index += 1) {
    const page = await pdf.getPage(index);
    const content = await page.getTextContent();
    chunks.push(
      content.items
        .map((item) => ("str" in item ? item.str : ""))
        .join(" "),
    );
  }

  return normalizeWhitespace(chunks.join("\n"));
};

const extractJsonPatch = async (file: File) => {
  const raw = await file.text();
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  const patch: Partial<CompanyAccountFormValues> = {};
  const findings: PrefillFinding[] = [];

  for (const [key, value] of Object.entries(parsed)) {
    const mappedKey = jsonKeyMap[key.toLowerCase()];
    if (!mappedKey || typeof value !== "string") {
      continue;
    }

    const normalized = normalizeWhitespace(value);
    if (!normalized) {
      continue;
    }

    patch[mappedKey] = normalized as never;
    findings.push({
      field: mappedKey,
      label:
        requiredFieldLabels.find((entry) => entry.field === mappedKey)?.label ??
        mappedKey,
      value: normalized,
      source: file.name,
    });
  }

  return { findings, patch, raw };
};

const extractTextPayload = async (file: File): Promise<TextPayload> => {
  if (file.type === "application/json" || detectFileExtension(file.name) === "json") {
    const result = await extractJsonPatch(file);
    return {
      extractable: true,
      findings: result.findings,
      patch: result.patch,
      parseNote: "已读取结构化资料并匹配字段。",
      text: result.raw,
    };
  }

  if (file.type === "application/pdf" || detectFileExtension(file.name) === "pdf") {
    return extractPdfTextWithOcr(file);
  }

  if (isReadableFile(file)) {
    const text = await file.text();
    return {
      extractable: true,
      findings: [] as PrefillFinding[],
      patch: {} as Partial<CompanyAccountFormValues>,
      parseNote: "已读取文本内容并完成首轮字段匹配。",
      text,
    };
  }

  if (isImageLikeFile(file)) {
    return extractImageTextWithOcr(file);
  }

  return {
    extractable: false,
    findings: [] as PrefillFinding[],
    patch: {} as Partial<CompanyAccountFormValues>,
    parseNote: "当前资料类型只做原件保存，不参与自动预填。",
    text: "",
  };
};

const dedupeFindings = (items: PrefillFinding[]) => {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.field}:${item.value}:${item.source}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
};

const extractRegexFindings = (
  text: string,
  source: string,
): {
  findings: PrefillFinding[];
  patch: Partial<CompanyAccountFormValues>;
} => {
  const findings: PrefillFinding[] = [];
  const patch: Partial<CompanyAccountFormValues> = {};

  for (const rule of prefillRules) {
    const matchValue = rule.patterns
      .map((pattern) => text.match(pattern)?.[1] ?? "")
      .map(cleanMatchValue)
      .find(Boolean);

    if (!matchValue) {
      continue;
    }

    patch[rule.field] = matchValue as never;
    findings.push({
      field: rule.field,
      label: rule.label,
      value: matchValue,
      source,
    });
  }

  return { findings, patch };
};

export const formatBytes = (value: number) => {
  if (value < 1024) {
    return `${value} B`;
  }
  if (value < 1024 ** 2) {
    return `${(value / 1024).toFixed(1)} KB`;
  }
  return `${(value / 1024 ** 2).toFixed(1)} MB`;
};

export const mergePatchIntoValues = (
  current: CompanyAccountFormValues,
  patch: Partial<CompanyAccountFormValues>,
) => {
  const next = structuredClone(current);

  for (const [key, value] of Object.entries(patch) as [
    keyof CompanyAccountFormValues,
    CompanyAccountFormValues[keyof CompanyAccountFormValues],
  ][]) {
    if (typeof value === "string") {
      if (!next[key]) {
        next[key] = value as never;
      }
      continue;
    }

    if (Array.isArray(value) && Array.isArray(next[key]) && next[key].length === 0) {
      next[key] = value as never;
    }
  }

  return next;
};

export const extractDocumentData = async (file: File): Promise<ExtractionResult> => {
  return extractDocumentDataWithContext(file, {});
};

export const extractDocumentDataWithContext = async (
  file: File,
  {
    kind = "supporting",
    requirementKey = null,
    requirementLabel = null,
  }: {
    kind?: DocumentKind;
    requirementKey?: MaterialRequirementKey | null;
    requirementLabel?: string | null;
  },
): Promise<ExtractionResult> => {
  const payload = await extractTextPayload(file);
  const normalizedText = normalizeWhitespace(payload.text);
  const regexResult = normalizedText
    ? extractRegexFindings(normalizedText, file.name)
    : { findings: [] as PrefillFinding[], patch: {} as Partial<CompanyAccountFormValues> };

  const findings = dedupeFindings([
    ...payload.findings,
    ...regexResult.findings,
  ]);

  return {
    document: {
      id: buildDocumentId(),
      name: file.name,
      mimeType: file.type || "application/octet-stream",
      size: file.size,
      kind,
      requirementKey,
      requirementLabel,
      extractable: payload.extractable,
      extractedTextSample: normalizedText.slice(0, 220),
      parseNote: payload.parseNote,
    },
    findings: findings.map((finding) => ({
      ...finding,
      requirementKey,
      requirementLabel,
    })),
    patch: {
      ...payload.patch,
      ...regexResult.patch,
    },
  };
};

export const createInitialFormValues = () =>
  structuredClone(initialCompanyAccountFormValues);

export const createBlankAuthorizedPersons = (count = 3): AuthorizedPerson[] =>
  Array.from({ length: count }, () => createEmptyAuthorizedPerson());

export const getMissingItems = (values: CompanyAccountFormValues) => {
  const missing = requiredFieldLabels.filter(({ field }) => {
    const value = values[field];
    if (typeof value === "string") {
      return !value.trim();
    }
    if (Array.isArray(value)) {
      return value.length === 0;
    }
    return value === null || value === undefined;
  });

  if (values.accountTypes.length === 0) {
    missing.push({
      field: "accountTypes",
      label: "账户类型",
      step: "company",
    });
  }

  if (values.initialFundingSources.length === 0) {
    missing.push({
      field: "initialFundingSources",
      label: "初始资金来源",
      step: "funding",
    });
  }

  if (values.ongoingFundingSources.length === 0) {
    missing.push({
      field: "ongoingFundingSources",
      label: "持续资金来源",
      step: "funding",
    });
  }

  return missing;
};

export const getFirstIncompleteStep = (values: CompanyAccountFormValues): StepId => {
  const missing = getMissingItems(values);
  return missing[0]?.step ?? "review";
};

export const stepIndex = (stepId: StepId) =>
  steps.findIndex((item) => item.id === stepId);

export const getStepValidationMessage = (
  stepId: StepId,
  values: CompanyAccountFormValues,
) => {
  const missing = getMissingItems(values).filter((item) => item.step === stepId);
  if (missing.length === 0) {
    return "";
  }
  return `请先补全：${missing.map((item) => item.label).join("、")}`;
};

export const summarizeSelections = (values: CompanyAccountFormValues) => ({
  accountTypes: values.accountTypes
    .map((key) => accountTypeOptions.find((option) => option.key === key)?.label ?? key)
    .join("、"),
  initialFunding: values.initialFundingSources
    .map((key) => fundingSourceOptions.find((option) => option.key === key)?.label ?? key)
    .join("、"),
  ongoingFunding: values.ongoingFundingSources
    .map((key) => fundingSourceOptions.find((option) => option.key === key)?.label ?? key)
    .join("、"),
  objective:
    investmentObjectiveOptions.find(
      (option) => option.key === values.investmentObjective,
    )?.label ?? values.investmentObjective,
  derivativeKnowledge: values.derivativeKnowledge
    .map(
      (key) =>
        derivativeKnowledgeOptions.find((option) => option.key === key)?.label ?? key,
    )
    .join("、"),
});

export const countCompletedExperiences = (values: CompanyAccountFormValues) =>
  experienceRows.filter((row) => values.experiences[row.key].enabled).length;

export const todayString = () => new Date().toISOString().slice(0, 10);

export const coreMaterialRequirementKeys = initialUploadMaterialRequirements
  .filter((item) => item.applicability === "all")
  .map((item) => item.key);

export const safeJsonParse = <T>(value: string, fallback: T) => {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
};
