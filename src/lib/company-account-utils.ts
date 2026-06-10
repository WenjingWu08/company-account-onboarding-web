import {
  accountTypeOptions,
  createEmptyAuthorizedPerson,
  derivativeKnowledgeOptions,
  experienceRows,
  fundingSourceOptions,
  initialCompanyAccountFormValues,
  investmentObjectiveOptions,
  materialRequirements,
  requiredFieldLabels,
  steps,
  type AuthorizedPerson,
  type CompanyAccountFormValues,
  type DocumentKind,
  type MaterialRequirement,
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
  extractionMethod: string | null;
};

type ExtractionContext = {
  kind?: DocumentKind;
  requirementKey?: MaterialRequirementKey | null;
  requirementLabel?: string | null;
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
      /(?:Name of Business\/Corporation|Name of Corporation|Business\/Corporation Name)[\s:：-]*([A-Z][A-Za-z0-9&.,()'\/ -]{4,120})/i,
      /(?:Name of Company|Company Name|Company English Name)[\s:：-]*\n+([A-Z][A-Za-z0-9&.,()'\/ -]{4,120})/i,
      /(?:MEMORANDUM AND ARTICLES OF ASSOCIATION OF|ARTICLES OF ASSOCIATION OF|CERTIFICATE OF INCORPORATION OF)[\s\n]+([A-Z][A-Z0-9&.,()'\/ -]{4,160}(?:LIMITED|LTD\.?|CORPORATION|COMPANY))/i,
      /\b([A-Z][A-Za-z0-9&.,()'\/ -]{3,140}?(?:Limited|Ltd\.?|Corporation|Company))\b/i,
      /\b([A-Z][A-Z0-9&.,()'\/ -]{4,160}(?:LIMITED|LTD\.?|CORPORATION|COMPANY))\b/,
    ],
  },
  {
    field: "companyNameChinese",
    label: "公司中文名称",
    patterns: [
      /(?:公司名稱|公司名称|中文名稱|Name in Chinese)[\s:：-]+([^\n]{2,40})/i,
      /(?:公司名稱|公司名称|中文名稱|中文名称)[\s:：-]*\n+([^\n]{2,40})/i,
    ],
  },
  {
    field: "registeredAddress",
    label: "注册地址",
    patterns: [
      /(?:Registered Office Address|Address of Registered Office in Country of Incorporation|成立國家之註冊地址|注册地址)[\s:：-]+([^\n]{8,140})/i,
      /(?:Registered Office|Registered Address|Address of Registered Office|註冊地址|注册地址)[\s:：-]*\n+([^\n]{8,180})/i,
      /(?:registered office(?: of the company)?(?: shall)?(?: be)?(?: situated|located)?(?: at| in)?|registered agent(?:'s)? office(?: shall)?(?: be)?(?: situated|located)?(?: at| in)?)[\s:：-]*([A-Za-z0-9(),.'\/ -]{16,240}(?:Hong Kong|British Virgin Islands|BVI|Tortola|Road Town|Cayman Islands|Singapore))/i,
    ],
  },
  {
    field: "businessAddress",
    label: "营业地址",
    patterns: [
      /(?:Business Address|辦事處地址|营业地址)[\s:：-]+([^\n]{8,140})/i,
      /(?:Business Address|Correspondence Address|辦事處地址|营业地址|通信地址)[\s:：-]*\n+([^\n]{8,180})/i,
    ],
  },
  {
    field: "businessRegistrationNo",
    label: "商业登记号码",
    patterns: [
      /(?:Business Registration(?: No\.?| Number)?|香港商業登記號碼)[\s:：-]+([A-Z0-9\-\/]{5,40})/i,
      /(?:Business Registration No\.?|BR No\.?|商業登記號碼|商业登记号码|Business Registration Number)[\s:：-]*\n*([A-Z0-9\-\/]{5,40})/i,
    ],
  },
  {
    field: "incorporationNo",
    label: "注册成立证书号码",
    patterns: [
      /(?:Certificate of Incorporation(?: No\.?)?|註冊成立證書號碼)[\s:：-]+([A-Z0-9\-\/]{5,40})/i,
      /(?:Company Number|No\. of Company|公司編號|公司编号|Certificate Number|Certificate No\.?)[\s:：-]*\n*([A-Z0-9\-\/]{5,40})/i,
    ],
  },
  {
    field: "incorporationDate",
    label: "注册日期",
    patterns: [
      /(?:Date of Incorporation|Incorporation Date|註冊日期)[\s:：-]+([0-9]{4}[-/.][0-9]{1,2}[-/.][0-9]{1,2}|[0-9]{1,2}[-/.][0-9]{1,2}[-/.][0-9]{2,4})/i,
      /(?:Date of Incorporation|Incorporation Date|Date of Registration|成立日期|註冊日期|注册日期)[\s:：-]*\n*([0-9]{4}[-/.][0-9]{1,2}[-/.][0-9]{1,2}|[0-9]{1,2}[-/.][0-9]{1,2}[-/.][0-9]{2,4})/i,
      /(?:incorporated on|registered on)[\s:：-]*([0-9]{1,2}(?:st|nd|rd|th)?\s+[A-Za-z]+\s+[0-9]{4}|[A-Za-z]+\s+[0-9]{1,2},\s*[0-9]{4})/i,
    ],
  },
  {
    field: "natureOfBusiness",
    label: "业务性质",
    patterns: [
      /(?:Nature of Business|业务性质|業務性質)[\s:：-]+([^\n]{2,80})/i,
      /(?:Nature of Business|Principal Business Activity|业务性质|業務性質)[\s:：-]*\n+([^\n]{2,120})/i,
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

const flattenWhitespace = (value: string) =>
  value.replace(/\s+/g, " ").replace(/[ ]+([,.;:])/g, "$1").trim();

const normalizeExtractionText = (value: string) =>
  value
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

const minRecognizedTextLength = 12;
const pdfOcrRenderScale = 2.75;
const pdfWorkerSrc = "/pdfjs/pdf.worker.min.mjs";
type OcrPageSegMode = Tesseract.PSM;
const defaultOcrPageSegMode = "3" as OcrPageSegMode;
const sparseTextOcrPageSegMode = "11" as OcrPageSegMode;
const ocrAssetPaths = {
  corePath: "/tesseract-core",
  langPath: "/tesseract-lang",
  workerPath: "/tesseract/worker.min.js",
} as const;
const legalDocumentTitlePattern =
  /(memorandum and articles of association|articles of association|certificate of incorporation)/i;
const companyInlinePattern =
  /([A-Z][A-Za-z0-9&.,()'\/ -]{2,140}?(?:Limited|Ltd\.?|Corporation|Company))/i;
const ignoredCompanyLines = [
  /corporate registrations limited/i,
  /registered agent/i,
  /territory of the british virgin islands/i,
];
const ignoredAddressPatterns = [
  /i hereby certify/i,
  /\bcopy\b/i,
  /\bmember(ship)? no\b/i,
  /\bbusiness companies act\b/i,
  /\bmemorandum\b/i,
  /\barticles\b/i,
  /\bincorporated\b/i,
  /\bdate\b/i,
];
const legalDocumentRequirementKeys = new Set<MaterialRequirementKey>([
  "memorandumAndArticles",
  "certificateOfIncorporation",
  "businessRegistration",
  "annualReturnAndChanges",
  "incumbencyOrGoodStanding",
]);
const contextualFieldAllowlist: Partial<
  Record<MaterialRequirementKey, (keyof CompanyAccountFormValues)[]>
> = {
  annualReturnAndChanges: ["companyNameEnglish", "registeredAddress"],
  businessRegistration: [
    "businessRegistrationNo",
    "businessAddress",
    "companyNameEnglish",
    "registeredAddress",
  ],
  certificateOfIncorporation: [
    "companyNameEnglish",
    "incorporationDate",
    "incorporationNo",
  ],
  incumbencyOrGoodStanding: [
    "companyNameEnglish",
    "incorporationNo",
    "registeredAddress",
  ],
  memorandumAndArticles: [
    "companyNameEnglish",
    "companyNameChinese",
    "incorporationDate",
    "registeredAddress",
  ],
};
const hongKongAddressPattern = /\b(hong kong|hk|kowloon|new territories)\b|香港|九龙|新界/i;
const overseasAddressPattern =
  /\b(british virgin islands|bvi|tortola|road town|cayman islands|singapore|seychelles|labuan|marshall islands|delaware|dubai|uae|united kingdom|england|scotland|wales)\b/i;
const addressKeywordPattern =
  /\b(road|rd|street|st|avenue|ave|house|building|tower|floor|room|suite|town|district|islands?|box)\b/i;
const monthPattern =
  /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec|january|february|march|april|june|july|august|september|october|november|december)\b/i;
const statuteNoisePattern =
  /\b(act|ordinance|statute|section|article|schedule|chapter|cap\.?)\b/i;
const registeredAddressLabelPattern =
  /(?:registered office address|address of registered office(?: in country of incorporation)?|registered office|registered address|registered agent(?:'s)? office|註冊地址|注册地址)/i;
const businessAddressLabelPattern =
  /(?:business address|correspondence address|辦事處地址|营业地址|通信地址)/i;
const businessRegistrationLabelPattern =
  /(?:business registration(?: no\.?| number)?|br no\.?|香港商業登記號碼|商業登記號碼|商业登记号码)/i;
const incorporationLabelPattern =
  /(?:certificate of incorporation(?: no\.?)?|company number|no\. of company|certificate number|certificate no\.?|公司編號|公司编号|註冊成立證書號碼)/i;
const addressLeadInPattern =
  /^(?:registered office address|address of registered office(?: in country of incorporation)?|registered office|registered address|registered agent(?:'s)? office|business address|correspondence address|註冊地址|注册地址|辦事處地址|营业地址|通信地址)[\s:：-]*/i;
const numericLikeOcrMap: Record<string, string> = {
  B: "8",
  D: "0",
  G: "6",
  I: "1",
  L: "1",
  O: "0",
  Q: "0",
  S: "5",
  Z: "2",
};

export type CompanyIncorporationRegion = "unknown" | "hongKong" | "overseas";

const normalizeAddressCandidate = (value: string) =>
  flattenWhitespace(
    value
      .replace(addressLeadInPattern, "")
      .replace(/^(?:is|shall be|will be|situated at|located at|at)\s+/i, "")
      .replace(/[|]/g, " ")
      .replace(/\s+,/g, ","),
  ).replace(/[.;:,]+$/, "");

const normalizeRegistrationCandidate = (
  value: string,
  { preferDigits = false }: { preferDigits?: boolean } = {},
) => {
  let normalized = value
    .toUpperCase()
    .replace(/[\s.,;:()]/g, "")
    .replace(/^[^A-Z0-9]+/, "")
    .replace(/[^A-Z0-9/-]+$/, "");

  if (!preferDigits) {
    return normalized;
  }

  const compact = normalized.replace(/[^A-Z0-9]/g, "");
  const letterCount = compact.replace(/[^A-Z]/g, "").length;
  const mayBeNumericToken =
    compact.length > 0 &&
    compact.split("").every((character) => /\d/.test(character) || numericLikeOcrMap[character]);

  if (mayBeNumericToken && letterCount <= Math.ceil(compact.length * 0.35)) {
    normalized = normalized.replace(/[BDGILOQSZ]/g, (character) => numericLikeOcrMap[character]);
  }

  return normalized;
};

const extractRegistrationTokens = (value: string, preferDigits = false) => {
  const matches = value.match(/[A-Z0-9][A-Z0-9\-\/]{4,30}/gi) ?? [];

  return Array.from(
    new Set(
      matches
        .map((item) => normalizeRegistrationCandidate(item, { preferDigits }))
        .filter(Boolean),
    ),
  );
};

const isLikelyRegistrationValue = (
  value: string,
  kind: "businessRegistration" | "incorporation",
) => {
  const compact = value.replace(/[^A-Z0-9]/g, "");

  if (!compact || compact.length < 5 || compact.length > 24) {
    return false;
  }

  if (/^\d{4}$/.test(compact)) {
    return false;
  }

  if (/^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}$/.test(value)) {
    return false;
  }

  if (monthPattern.test(value) || /\bOF\d{4}\b/i.test(compact)) {
    return false;
  }

  if (kind === "businessRegistration") {
    return compact.length >= 6;
  }

  return compact.length >= 5;
};

const inferRegionFromAddressText = (value: string) => {
  const normalized = normalizeAddressCandidate(value);
  if (!normalized) {
    return "unknown" as const;
  }

  const hasHongKongSignal = hongKongAddressPattern.test(normalized);
  const hasOverseasSignal = overseasAddressPattern.test(normalized);

  if (hasOverseasSignal && !hasHongKongSignal) {
    return "overseas" as const;
  }

  if (hasHongKongSignal && !hasOverseasSignal) {
    return "hongKong" as const;
  }

  return "unknown" as const;
};

const isRequirementApplicableForRegion = (
  requirement: MaterialRequirement,
  region: CompanyIncorporationRegion,
) => {
  if (requirement.applicability === "hongKongOnly") {
    return region !== "overseas";
  }

  if (requirement.applicability === "overseasOnly") {
    return region !== "hongKong";
  }

  return true;
};

const cleanMatchValue = (value: string) =>
  flattenWhitespace(value)
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

type OcrWorkerHandle = {
  recognize: (image: string | File) => Promise<{ data: { text: string } }>;
  setParameters: (params: Record<string, string>) => Promise<unknown>;
};

const ocrWorkerPromises = new Map<string, Promise<OcrWorkerHandle>>();
let pdfJsPromise: Promise<typeof import("pdfjs-dist/legacy/build/pdf.mjs")> | null = null;

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

const getOcrWorker = async (languages: string[]) => {
  const key = languages.join("+");
  const existing = ocrWorkerPromises.get(key);
  if (existing) {
    return existing;
  }

  const workerPromise = (async () => {
      const { createWorker } = await import("tesseract.js");
      const worker = await createWorker(languages, 1, {
        cachePath: "company-account-ocr",
        corePath: ocrAssetPaths.corePath,
        langPath: ocrAssetPaths.langPath,
        logger: () => undefined,
        workerPath: ocrAssetPaths.workerPath,
      });

      await worker.setParameters({
        preserve_interword_spaces: "1",
        user_defined_dpi: "300",
      });

      return worker;
    })().catch((error) => {
      ocrWorkerPromises.delete(key);
      throw error;
    });

  ocrWorkerPromises.set(key, workerPromise);
  return workerPromise;
};

const getPdfJs = async () => {
  if (!pdfJsPromise) {
    pdfJsPromise = import("pdfjs-dist/legacy/build/pdf.mjs");
  }

  const pdfjs = await pdfJsPromise;
  if ("GlobalWorkerOptions" in pdfjs) {
    pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerSrc;
  }

  return pdfjs;
};

const isLegalDocumentContext = (context: ExtractionContext) =>
  Boolean(context.requirementKey && legalDocumentRequirementKeys.has(context.requirementKey));

const getAllowedFieldsForContext = (context: ExtractionContext) =>
  context.requirementKey ? contextualFieldAllowlist[context.requirementKey] ?? null : null;

const recognizeImageText = async (
  image: string | File,
  languages: string[] = ["eng", "chi_sim"],
  {
    pageSegMode = defaultOcrPageSegMode,
  }: {
    pageSegMode?: OcrPageSegMode;
  } = {},
) => {
  const worker = await getOcrWorker(languages);
  await worker.setParameters({
    preserve_interword_spaces: "1",
    tessedit_pageseg_mode: pageSegMode,
    user_defined_dpi: "300",
  });
  const result = await worker.recognize(image);
  return normalizeExtractionText(result.data.text);
};

const renderPdfPageToCanvas = async (file: File, pageNumber: number) => {
  if (typeof document === "undefined") {
    throw new Error("OCR rendering is only available in the browser.");
  }

  const { getDocument } = await getPdfJs();
  const data = new Uint8Array(await file.arrayBuffer());
  const pdf = await getDocument({ data } as never).promise;
  const page = await pdf.getPage(pageNumber);
  const viewport = page.getViewport({ scale: pdfOcrRenderScale });
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

  return canvas;
};

const renderPdfPageToImage = async (file: File, pageNumber: number) => {
  const canvas = await renderPdfPageToCanvas(file, pageNumber);
  return canvas.toDataURL("image/png");
};

const cropCanvasToDataUrl = (
  source: HTMLCanvasElement,
  {
    left,
    top,
    width,
    height,
  }: {
    left: number;
    top: number;
    width: number;
    height: number;
  },
) => {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(source.width * width));
  canvas.height = Math.max(1, Math.round(source.height * height));
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Canvas context is unavailable.");
  }

  context.drawImage(
    source,
    Math.round(source.width * left),
    Math.round(source.height * top),
    Math.round(source.width * width),
    Math.round(source.height * height),
    0,
    0,
    canvas.width,
    canvas.height,
  );

  return canvas.toDataURL("image/png");
};

const extractImageTextWithOcr = async (
  file: File,
  context: ExtractionContext,
): Promise<TextPayload> => {
  try {
    const prefersEnglishPrimary =
      context.requirementKey === "memorandumAndArticles" ||
      context.requirementKey === "certificateOfIncorporation" ||
      /章程|注册证书|memorandum|articles|incorporation|certificate/i.test(
        `${context.requirementLabel ?? ""} ${file.name}`,
      );
    const text = await recognizeImageText(
      file,
      prefersEnglishPrimary ? ["eng"] : ["eng", "chi_sim"],
      {
        pageSegMode: prefersEnglishPrimary
          ? sparseTextOcrPageSegMode
          : defaultOcrPageSegMode,
      },
    );
    const normalizedText = normalizeExtractionText(text);
    const hasText = normalizedText.replace(/\s/g, "").length >= minRecognizedTextLength;

    return {
      extractable: hasText,
      findings: [],
      patch: {},
      parseNote: hasText
        ? "已完成图片 OCR，并纳入自动预填写。"
        : "已完成图片 OCR，但未识别到可用文本，原件已保留。",
      text: normalizedText,
      extractionMethod: "image-ocr",
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
      extractionMethod: "image-ocr",
    };
  }
};

const extractPdfTextWithOcr = async (
  file: File,
  context: ExtractionContext,
): Promise<TextPayload> => {
  try {
    const text = await extractPdfText(file);
    const normalizedText = normalizeExtractionText(text);
    const hasReadableText =
      normalizedText.replace(/\s/g, "").length >= minRecognizedTextLength;

    if (hasReadableText) {
      return {
        extractable: true,
        findings: [],
        patch: {},
        parseNote: "已提取 PDF 文本并完成首轮字段匹配。",
        text: normalizedText,
        extractionMethod: "pdf-text",
      };
    }

    const { getDocument } = await getPdfJs();
    const data = new Uint8Array(await file.arrayBuffer());
    const pdf = await getDocument({ data } as never).promise;
    const pageLimit = Math.min(pdf.numPages, 3);
    const contextText = `${context.requirementLabel ?? ""} ${file.name}`;
    const prefersEnglishPrimary =
      context.requirementKey === "memorandumAndArticles" ||
      context.requirementKey === "certificateOfIncorporation" ||
      /章程|注册证书|memorandum|articles|association|incorporation|certificate/i.test(
        contextText,
      );

    const ocrChunks: string[] = [];
    for (let index = 1; index <= pageLimit; index += 1) {
      const canvas = await renderPdfPageToCanvas(file, index);
      const image = canvas.toDataURL("image/png");
      const chunk = await recognizeImageText(
        image,
        prefersEnglishPrimary ? ["eng"] : ["eng", "chi_sim"],
        {
          pageSegMode: prefersEnglishPrimary
            ? defaultOcrPageSegMode
            : sparseTextOcrPageSegMode,
        },
      );
      if (chunk) {
        ocrChunks.push(chunk);
      }

      if (index === 1 && isLegalDocumentContext(context)) {
        const addressFocusChunk = await recognizeImageText(
          cropCanvasToDataUrl(canvas, {
            left: 0.18,
            top: 0.72,
            width: 0.64,
            height: 0.2,
          }),
          ["eng"],
          {
            pageSegMode: sparseTextOcrPageSegMode,
          },
        );

        if (addressFocusChunk) {
          ocrChunks.push(addressFocusChunk);
        }
      }
    }

    const ocrText = normalizeExtractionText(ocrChunks.join("\n"));
    const hasOcrText = ocrText.replace(/\s/g, "").length >= minRecognizedTextLength;
    const needsEnglishRetry =
      !looksLikeCorporateName(ocrText) &&
      /章程|注册证书|memorandum|articles|association|incorporation|certificate|limited|ltd/i.test(
        contextText,
      );

    let finalOcrText = ocrText;
    let usedEnglishRetry = false;

    if (needsEnglishRetry) {
      const englishChunks: string[] = [];
      for (let index = 1; index <= pageLimit; index += 1) {
        const image = await renderPdfPageToImage(file, index);
        const chunk = await recognizeImageText(image, ["eng"], {
          pageSegMode: defaultOcrPageSegMode,
        });
        if (chunk) {
          englishChunks.push(chunk);
        }
      }

      const englishOcrText = normalizeExtractionText(englishChunks.join("\n"));
      if (
        englishOcrText.replace(/\s/g, "").length >= minRecognizedTextLength &&
        looksLikeCorporateName(englishOcrText)
      ) {
        finalOcrText = englishOcrText;
        usedEnglishRetry = true;
      }
    }

    return {
      extractable:
        finalOcrText.replace(/\s/g, "").length >= minRecognizedTextLength || hasOcrText,
      findings: [],
      patch: {},
      parseNote:
        finalOcrText.replace(/\s/g, "").length >= minRecognizedTextLength
          ? usedEnglishRetry
            ? "PDF 原文不可提取，已改用页面 OCR；英文版式已追加英文识别以提高命中率。"
            : "PDF 原文不可提取，已改用页面 OCR 并纳入自动预填写。"
        : "PDF 原文不可提取，已尝试页面 OCR，但未识别到可用文本。",
      text: finalOcrText,
      extractionMethod: "pdf-ocr",
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
      extractionMethod: "pdf-ocr",
    };
  }
};

const extractPdfText = async (file: File) => {
  const { getDocument } = await getPdfJs();
  const data = new Uint8Array(await file.arrayBuffer());
  const pdf = await getDocument({ data } as never).promise;
  const pageLimit = Math.min(pdf.numPages, 8);
  const chunks: string[] = [];

  for (let index = 1; index <= pageLimit; index += 1) {
    const page = await pdf.getPage(index);
    const content = await page.getTextContent();
    const items = content.items
      .map((item) =>
        "str" in item
          ? {
              text: item.str,
              y: Math.round(item.transform[5]),
              x: item.transform[4],
            }
          : null,
      )
      .filter((item): item is { text: string; y: number; x: number } => Boolean(item))
      .filter((item) => item.text.trim());

    const rows = new Map<number, { text: string; x: number }[]>();
    for (const item of items) {
      const row = rows.get(item.y) ?? [];
      row.push({ text: item.text, x: item.x });
      rows.set(item.y, row);
    }

    const pageLines = Array.from(rows.entries())
      .sort((first, second) => second[0] - first[0])
      .map(([, row]) =>
        row
          .sort((first, second) => first.x - second.x)
          .map((cell) => cell.text)
          .join(" ")
          .trim(),
      )
      .filter(Boolean);

    chunks.push(pageLines.join("\n"));
  }

  return normalizeExtractionText(chunks.join("\n"));
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

    const normalized = flattenWhitespace(value);
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

const extractTextPayload = async (
  file: File,
  context: ExtractionContext,
): Promise<TextPayload> => {
  if (file.type === "application/json" || detectFileExtension(file.name) === "json") {
    const result = await extractJsonPatch(file);
    return {
      extractable: true,
      findings: result.findings,
      patch: result.patch,
      parseNote: "已读取结构化资料并匹配字段。",
      text: result.raw,
      extractionMethod: "json",
    };
  }

  if (file.type === "application/pdf" || detectFileExtension(file.name) === "pdf") {
    return extractPdfTextWithOcr(file, context);
  }

  if (isReadableFile(file)) {
    const text = await file.text();
    return {
      extractable: true,
      findings: [] as PrefillFinding[],
      patch: {} as Partial<CompanyAccountFormValues>,
      parseNote: "已读取文本内容并完成首轮字段匹配。",
      text: normalizeExtractionText(text),
      extractionMethod: "text",
    };
  }

  if (isImageLikeFile(file)) {
    return extractImageTextWithOcr(file, context);
  }

  return {
    extractable: false,
    findings: [] as PrefillFinding[],
    patch: {} as Partial<CompanyAccountFormValues>,
    parseNote: "当前资料类型只做原件保存，不参与自动预填。",
    text: "",
    extractionMethod: null,
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

const keyValueHints: {
  field: keyof CompanyAccountFormValues;
  label: string;
  aliases: string[];
  validator?: (value: string) => boolean;
}[] = [
  {
    field: "companyNameEnglish",
    label: "公司英文名称",
    aliases: [
      "Name of Company",
      "Company Name",
      "Company English Name",
      "Name of Business/Corporation",
      "Name of Corporation",
    ],
    validator: (value) => /[A-Za-z]{2,}/.test(value),
  },
  {
    field: "companyNameChinese",
    label: "公司中文名称",
    aliases: ["公司名稱", "公司名称", "中文名稱", "中文名称"],
    validator: (value) => /[\u4e00-\u9fff]{2,}/.test(value),
  },
  {
    field: "businessRegistrationNo",
    label: "商业登记号码",
    aliases: ["Business Registration No", "BR No", "商業登記號碼", "商业登记号码"],
    validator: (value) => /[A-Z0-9\-\/]{5,}/i.test(value),
  },
  {
    field: "incorporationNo",
    label: "注册成立证书号码",
    aliases: ["Certificate of Incorporation No", "Company Number", "公司編號", "公司编号"],
    validator: (value) => /[A-Z0-9\-\/]{5,}/i.test(value),
  },
  {
    field: "incorporationDate",
    label: "注册日期",
    aliases: ["Date of Incorporation", "Incorporation Date", "成立日期", "註冊日期", "注册日期"],
    validator: (value) =>
      /[0-9]{4}[-/.][0-9]{1,2}[-/.][0-9]{1,2}|[0-9]{1,2}[-/.][0-9]{1,2}[-/.][0-9]{2,4}/.test(
        value,
      ),
  },
  {
    field: "registeredAddress",
    label: "注册地址",
    aliases: ["Registered Office Address", "Registered Address", "註冊地址", "注册地址"],
    validator: (value) => value.length >= 8,
  },
  {
    field: "businessAddress",
    label: "营业地址",
    aliases: ["Business Address", "辦事處地址", "营业地址", "通信地址"],
    validator: (value) => value.length >= 8,
  },
];

const maybeExtractValueAfterAlias = (line: string, alias: string) => {
  const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`${escaped}[\\s:：-]*(.+)$`, "i");
  const match = line.match(pattern);
  return cleanMatchValue(match?.[1] ?? "");
};

const extractKeyValueFindings = (
  text: string,
  source: string,
): {
  findings: PrefillFinding[];
  patch: Partial<CompanyAccountFormValues>;
} => {
  const lines = normalizeExtractionText(text)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const findings: PrefillFinding[] = [];
  const patch: Partial<CompanyAccountFormValues> = {};

  for (const hint of keyValueHints) {
    let candidate = "";

    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      const nextLine = lines[index + 1] ?? "";
      const alias = hint.aliases.find((item) => line.toLowerCase().includes(item.toLowerCase()));

      if (!alias) {
        continue;
      }

      candidate = maybeExtractValueAfterAlias(line, alias);
      if (!candidate && nextLine) {
        candidate = cleanMatchValue(nextLine);
      }

      if (candidate) {
        break;
      }
    }

    if (!candidate) {
      continue;
    }

    if (hint.validator && !hint.validator(candidate)) {
      continue;
    }

    patch[hint.field] = candidate as never;
    findings.push({
      field: hint.field,
      label: hint.label,
      value: candidate,
      source,
    });
  }

  return { findings, patch };
};

const looksLikeCorporateName = (value: string) => {
  const normalized = cleanMatchValue(value);
  if (!normalized) {
    return false;
  }

  if (!/(limited|ltd\.?|corporation|company)/i.test(normalized)) {
    return false;
  }

  const alphaWords = normalized
    .split(/\s+/)
    .filter((token) => /[A-Za-z]{2,}/.test(token.replace(/[^A-Za-z]/g, "")));

  return alphaWords.length >= 2;
};

const extractCompanyCandidate = (value: string) => {
  const match = value.match(companyInlinePattern)?.[1] ?? "";
  const normalized = cleanMatchValue(match || value);

  if (!looksLikeCorporateName(normalized)) {
    return "";
  }

  if (ignoredCompanyLines.some((pattern) => pattern.test(normalized))) {
    return "";
  }

  return normalized;
};

const buildLineWindows = (lines: string[], maxWindowSize = 3) => {
  const windows: string[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const parts: string[] = [];
    for (
      let offset = 0;
      offset < maxWindowSize && index + offset < lines.length;
      offset += 1
    ) {
      const candidate = lines[index + offset];
      if (!candidate || /^of$/i.test(candidate) || candidate === ":") {
        continue;
      }

      parts.push(candidate);
      windows.push(parts.join(" "));
    }
  }

  return windows;
};

const addressStructurePattern =
  /\b(po box|box|chambers|plaza|centre|center|block|unit|flat|room|floor|tower|court|house|village|commercial|industrial|park|estate|road town|tortola|central|wan chai|tsim sha tsui)\b/i;
const genericFieldLabelPattern =
  /(?:name of company|company name|company english name|company chinese name|registered office|registered address|business address|correspondence address|business registration|br no\.?|company number|certificate of incorporation|certificate number|date of incorporation|nature of business|telephone|phone|email|fax|ccass|公司名稱|公司名称|中文名稱|中文名称|註冊地址|注册地址|辦事處地址|营业地址|商業登記|商业登记|公司編號|公司编号|聯絡人電話|联系人电话|电邮地址)/i;

const formatDateToIso = (year: number, month: number, day: number) => {
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day) ||
    year < 1900 ||
    year > 2100 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31
  ) {
    return "";
  }

  const candidate = new Date(Date.UTC(year, month - 1, day));
  if (
    candidate.getUTCFullYear() !== year ||
    candidate.getUTCMonth() !== month - 1 ||
    candidate.getUTCDate() !== day
  ) {
    return "";
  }

  return `${year.toString().padStart(4, "0")}-${month
    .toString()
    .padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
};

const normalizeDateCandidate = (value: string) => {
  const normalized = cleanMatchValue(value);

  let match = normalized.match(/\b(\d{4})[./-](\d{1,2})[./-](\d{1,2})\b/);
  if (match) {
    return formatDateToIso(Number(match[1]), Number(match[2]), Number(match[3]));
  }

  match = normalized.match(/\b(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})\b/);
  if (match) {
    const day = Number(match[1]);
    const month = Number(match[2]);
    const rawYear = Number(match[3]);
    const year = rawYear < 100 ? 2000 + rawYear : rawYear;
    return formatDateToIso(year, month, day);
  }

  const monthMap: Record<string, number> = {
    jan: 1,
    january: 1,
    feb: 2,
    february: 2,
    mar: 3,
    march: 3,
    apr: 4,
    april: 4,
    may: 5,
    jun: 6,
    june: 6,
    jul: 7,
    july: 7,
    aug: 8,
    august: 8,
    sep: 9,
    sept: 9,
    september: 9,
    oct: 10,
    october: 10,
    nov: 11,
    november: 11,
    dec: 12,
    december: 12,
  };

  match = normalized.match(
    /\b(\d{1,2})(?:st|nd|rd|th)?(?:\s+day\s+of|\s+of|\s+)([A-Za-z]+),?\s+(\d{4})\b/i,
  );
  if (match) {
    const month = monthMap[match[2].toLowerCase()];
    if (month) {
      return formatDateToIso(Number(match[3]), month, Number(match[1]));
    }
  }

  match = normalized.match(/\b([A-Za-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})\b/i);
  if (match) {
    const month = monthMap[match[1].toLowerCase()];
    if (month) {
      return formatDateToIso(Number(match[3]), month, Number(match[2]));
    }
  }

  return "";
};

const normalizeFieldValue = (
  field: keyof CompanyAccountFormValues,
  value: string,
) => {
  const normalized = cleanMatchValue(value);

  switch (field) {
    case "registeredAddress":
    case "businessAddress":
      return normalizeAddressCandidate(normalized);
    case "businessRegistrationNo":
      return normalizeRegistrationCandidate(normalized, { preferDigits: true });
    case "incorporationNo":
      return normalizeRegistrationCandidate(normalized, { preferDigits: true });
    case "incorporationDate":
      return normalizeDateCandidate(normalized);
    default:
      return normalized;
  }
};

const validateFieldValue = (
  field: keyof CompanyAccountFormValues,
  value: string,
) => {
  if (!value) {
    return false;
  }

  switch (field) {
    case "companyNameEnglish":
      return looksLikeCorporateName(value);
    case "companyNameChinese":
      return /[\u4e00-\u9fff]{2,}/.test(value);
    case "registeredAddress":
    case "businessAddress":
      return scoreAddressCandidate(value) >= 3;
    case "businessRegistrationNo":
      return isLikelyRegistrationValue(value, "businessRegistration");
    case "incorporationNo":
      return isLikelyRegistrationValue(value, "incorporation");
    case "incorporationDate":
      return Boolean(normalizeDateCandidate(value));
    case "contactPhone":
      return /[+\d()\- ][\d()\- ]{6,30}/.test(value);
    case "email":
      return /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(value);
    default:
      return true;
  }
};

const getFieldLabel = (field: keyof CompanyAccountFormValues) =>
  requiredFieldLabels.find((entry) => entry.field === field)?.label ??
  prefillRules.find((entry) => entry.field === field)?.label ??
  field;

const sanitizeFinding = (finding: PrefillFinding): PrefillFinding | null => {
  const normalizedValue = normalizeFieldValue(finding.field, finding.value);
  if (!validateFieldValue(finding.field, normalizedValue)) {
    return null;
  }

  return {
    ...finding,
    label: getFieldLabel(finding.field),
    value: normalizedValue,
  };
};

const scoreAddressCandidate = (value: string) => {
  const normalized = normalizeAddressCandidate(value);
  if (!normalized || normalized.length < 10 || normalized.length > 240) {
    return -10;
  }

  let score = 0;
  const commaCount = normalized.match(/,/g)?.length ?? 0;

  if (/\d/.test(normalized)) {
    score += 1;
  }
  if (addressKeywordPattern.test(normalized)) {
    score += 2;
  }
  if (addressStructurePattern.test(normalized)) {
    score += 2;
  }
  if (hongKongAddressPattern.test(normalized) || overseasAddressPattern.test(normalized)) {
    score += 3;
  }
  if (commaCount >= 1) {
    score += 1;
  }
  if (normalized.length >= 18 && normalized.length <= 180) {
    score += 1;
  }
  if (ignoredAddressPatterns.some((pattern) => pattern.test(normalized))) {
    score -= 5;
  }
  if (looksLikeCorporateName(normalized) && !addressKeywordPattern.test(normalized)) {
    score -= 4;
  }
  if (statuteNoisePattern.test(normalized)) {
    score -= 4;
  }
  if (
    !/\d/.test(normalized) &&
    !addressKeywordPattern.test(normalized) &&
    !addressStructurePattern.test(normalized) &&
    !hongKongAddressPattern.test(normalized) &&
    !overseasAddressPattern.test(normalized)
  ) {
    score -= 4;
  }

  return score;
};

const isPotentialAddressLine = (line: string) => {
  const normalized = normalizeAddressCandidate(line);
  if (!normalized || ignoredAddressPatterns.some((pattern) => pattern.test(normalized))) {
    return false;
  }

  if (genericFieldLabelPattern.test(normalized) && !registeredAddressLabelPattern.test(normalized)) {
    if (!businessAddressLabelPattern.test(normalized)) {
      return false;
    }
  }

  return (
    /\d/.test(normalized) ||
    addressKeywordPattern.test(normalized) ||
    addressStructurePattern.test(normalized) ||
    hongKongAddressPattern.test(normalized) ||
    overseasAddressPattern.test(normalized)
  );
};

const collectContinuationLines = (
  lines: string[],
  startIndex: number,
  maxLines = 3,
) => {
  const parts: string[] = [];

  for (let offset = 1; offset <= maxLines; offset += 1) {
    const line = lines[startIndex + offset];
    if (!line) {
      break;
    }

    if (genericFieldLabelPattern.test(line)) {
      break;
    }

    const normalized = normalizeAddressCandidate(line);
    if (!normalized || ignoredAddressPatterns.some((pattern) => pattern.test(normalized))) {
      break;
    }

    if (!isPotentialAddressLine(normalized) && parts.length > 0) {
      break;
    }

    if (!isPotentialAddressLine(normalized) && parts.length === 0) {
      continue;
    }

    parts.push(normalized);
  }

  return parts;
};

const extractBestAddressCandidate = (
  text: string,
  field: "registeredAddress" | "businessAddress",
) => {
  const lines = normalizeExtractionText(text)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const labelPattern =
    field === "registeredAddress" ? registeredAddressLabelPattern : businessAddressLabelPattern;

  const candidates: { value: string; score: number }[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!labelPattern.test(line)) {
      continue;
    }

    const inline = normalizeAddressCandidate(line.replace(labelPattern, ""));
    const continuation = collectContinuationLines(lines, index, 4);
    const joined = normalizeAddressCandidate([inline, ...continuation].filter(Boolean).join(", "));
    const score = scoreAddressCandidate(joined);
    if (score >= 3) {
      candidates.push({ value: joined, score: score + 3 });
    }
  }

  for (const window of buildLineWindows(lines, 4)) {
    const normalized = normalizeAddressCandidate(window);
    const score = scoreAddressCandidate(normalized);
    if (score >= 3) {
      candidates.push({ value: normalized, score });
    }
  }

  candidates.sort((first, second) => second.score - first.score);
  return candidates[0]?.value ?? "";
};

const scoreRegistrationToken = (
  token: string,
  kind: "businessRegistration" | "incorporation",
) => {
  if (!isLikelyRegistrationValue(token, kind)) {
    return -10;
  }

  const compact = token.replace(/[^A-Z0-9]/g, "");
  let score = 0;

  if (kind === "businessRegistration") {
    if (/^\d{6,10}$/.test(compact)) {
      score += 5;
    }
    if (compact.length >= 8 && compact.length <= 10) {
      score += 2;
    }
  } else {
    if (/^\d{5,12}$/.test(compact)) {
      score += 3;
    }
    if (/[A-Z]/.test(compact)) {
      score += 1;
    }
  }

  if (compact.startsWith("20") && compact.length <= 8) {
    score -= 2;
  }
  if (compact.includes("OF")) {
    score -= 6;
  }

  return score;
};

const extractBestRegistrationCandidate = (
  text: string,
  kind: "businessRegistration" | "incorporation",
) => {
  const lines = normalizeExtractionText(text)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const labelPattern =
    kind === "businessRegistration"
      ? businessRegistrationLabelPattern
      : incorporationLabelPattern;
  const candidates: { value: string; score: number }[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!labelPattern.test(line)) {
      continue;
    }

    const inline = line.replace(labelPattern, " ");
    const relatedLines = [inline, lines[index + 1] ?? "", lines[index + 2] ?? ""];
    for (const part of relatedLines) {
      if (!part || statuteNoisePattern.test(part)) {
        continue;
      }

      for (const token of extractRegistrationTokens(part, true)) {
        const score = scoreRegistrationToken(token, kind);
        if (score >= 0) {
          candidates.push({ value: token, score: score + 4 });
        }
      }
    }
  }

  for (const line of lines) {
    if (statuteNoisePattern.test(line)) {
      continue;
    }

    for (const token of extractRegistrationTokens(line, true)) {
      const score = scoreRegistrationToken(token, kind);
      if (score >= 3) {
        candidates.push({ value: token, score });
      }
    }
  }

  candidates.sort((first, second) => second.score - first.score);
  return candidates[0]?.value ?? "";
};

const extractContextualFindings = (
  text: string,
  source: string,
  context: ExtractionContext,
): {
  findings: PrefillFinding[];
} => {
  const findings: PrefillFinding[] = [];
  const pushFinding = (field: keyof CompanyAccountFormValues, value: string) => {
    if (!value) {
      return;
    }

    findings.push({
      field,
      label: getFieldLabel(field),
      value,
      source,
    });
  };

  if (!getAllowedFieldsForContext(context) || getAllowedFieldsForContext(context)?.includes("registeredAddress")) {
    pushFinding("registeredAddress", extractBestAddressCandidate(text, "registeredAddress"));
  }

  if (!getAllowedFieldsForContext(context) || getAllowedFieldsForContext(context)?.includes("businessAddress")) {
    pushFinding("businessAddress", extractBestAddressCandidate(text, "businessAddress"));
  }

  if (
    !getAllowedFieldsForContext(context) ||
    getAllowedFieldsForContext(context)?.includes("businessRegistrationNo")
  ) {
    pushFinding(
      "businessRegistrationNo",
      extractBestRegistrationCandidate(text, "businessRegistration"),
    );
  }

  if (
    !getAllowedFieldsForContext(context) ||
    getAllowedFieldsForContext(context)?.includes("incorporationNo")
  ) {
    pushFinding("incorporationNo", extractBestRegistrationCandidate(text, "incorporation"));
  }

  return { findings };
};

const sanitizeFindings = (
  findings: PrefillFinding[],
  context: ExtractionContext,
) => {
  const allowedFields = getAllowedFieldsForContext(context);

  return dedupeFindings(
    findings
      .filter((finding) =>
        allowedFields ? allowedFields.includes(finding.field) : true,
      )
      .map(sanitizeFinding)
      .filter((finding): finding is PrefillFinding => Boolean(finding)),
  );
};

const buildPatchFromFindings = (findings: PrefillFinding[]) => {
  const patch: Partial<CompanyAccountFormValues> = {};

  for (const finding of findings) {
    if (patch[finding.field]) {
      continue;
    }

    patch[finding.field] = finding.value as never;
  }

  return patch;
};

const extractTitleBlockFindings = (
  text: string,
  source: string,
): {
  findings: PrefillFinding[];
  patch: Partial<CompanyAccountFormValues>;
} => {
  const lines = normalizeExtractionText(text)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const findings: PrefillFinding[] = [];
  const patch: Partial<CompanyAccountFormValues> = {};

  const pushFinding = (
    field: keyof CompanyAccountFormValues,
    label: string,
    value: string,
  ) => {
    const normalized = cleanMatchValue(value);
    if (!normalized || patch[field]) {
      return;
    }

    patch[field] = normalized as never;
    findings.push({
      field,
      label,
      value: normalized,
      source,
    });
  };

  for (let index = 0; index < lines.length; index += 1) {
    if (!legalDocumentTitlePattern.test(lines[index])) {
      continue;
    }

    const nearbyWindows = buildLineWindows(lines.slice(index + 1, index + 5), 3);
    for (const window of nearbyWindows) {
      const companyCandidate = extractCompanyCandidate(window);
      if (companyCandidate) {
        pushFinding("companyNameEnglish", "公司英文名称", companyCandidate);
        break;
      }
    }

    if (patch.companyNameEnglish) {
      break;
    }
  }

  if (!patch.companyNameEnglish) {
    const fallbackCompanyLine = buildLineWindows(lines, 3)
      .map(extractCompanyCandidate)
      .find(Boolean);

    if (fallbackCompanyLine) {
      pushFinding("companyNameEnglish", "公司英文名称", fallbackCompanyLine);
    }
  }

  const narrativeDateMatch = text.match(
    /(?:incorporated(?: this)?|registered on)[\s:：-]*([0-9]{1,2}(?:st|nd|rd|th)?(?:\s+day\s+of)?\s+[A-Za-z]+,?\s+[0-9]{4}|[A-Za-z]+\s+[0-9]{1,2},\s*[0-9]{4})/i,
  );

  if (narrativeDateMatch?.[1]) {
    pushFinding("incorporationDate", "注册日期", narrativeDateMatch[1]);
  }

  return { findings, patch };
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
  const context = {
    kind,
    requirementKey,
    requirementLabel,
  };
  const payload = await extractTextPayload(file, context);
  const extractionText = normalizeExtractionText(payload.text);
  const displayText = flattenWhitespace(payload.text);
  const regexResult = extractionText
    ? extractRegexFindings(extractionText, file.name)
    : { findings: [] as PrefillFinding[], patch: {} as Partial<CompanyAccountFormValues> };
  const titleBlockResult = extractionText
    ? extractTitleBlockFindings(extractionText, file.name)
    : { findings: [] as PrefillFinding[], patch: {} as Partial<CompanyAccountFormValues> };
  const keyValueResult = extractionText
    ? extractKeyValueFindings(extractionText, file.name)
    : { findings: [] as PrefillFinding[], patch: {} as Partial<CompanyAccountFormValues> };
  const contextualResult = extractionText
    ? extractContextualFindings(extractionText, file.name, context)
    : { findings: [] as PrefillFinding[] };

  const findings = sanitizeFindings(
    [
      ...payload.findings,
      ...contextualResult.findings,
      ...titleBlockResult.findings,
      ...keyValueResult.findings,
      ...regexResult.findings,
    ],
    context,
  );
  const patch = buildPatchFromFindings(findings);
  const parseNote =
    findings.length > 0
      ? `${payload.parseNote} 已命中 ${findings.length} 项字段。`
      : payload.extractable
        ? `${payload.parseNote} 当前未命中字段，请检查下方 OCR 原文。`
        : payload.parseNote;

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
      extractedTextSample: displayText.slice(0, 220),
      extractionMethod: payload.extractionMethod,
      matchedFieldCount: findings.length,
      parseNote,
    },
    findings: findings.map((finding) => ({
      ...finding,
      requirementKey,
      requirementLabel,
    })),
    patch,
  };
};

export const createInitialFormValues = () =>
  structuredClone(initialCompanyAccountFormValues);

export const createBlankAuthorizedPersons = (count = 3): AuthorizedPerson[] =>
  Array.from({ length: count }, () => createEmptyAuthorizedPerson());

export const deriveCompanyIncorporationRegion = (
  values: CompanyAccountFormValues,
  options?: {
    findings?: PrefillFinding[];
    documents?: UploadedDocument[];
  },
): CompanyIncorporationRegion => {
  const addressCandidates = [
    values.registeredAddress,
    values.businessAddress,
    ...(options?.findings
      ?.filter(
        (finding) =>
          finding.field === "registeredAddress" || finding.field === "businessAddress",
      )
      .map((finding) => finding.value) ?? []),
  ]
    .map(normalizeAddressCandidate)
    .filter(Boolean);

  let hongKongSignals = 0;
  let overseasSignals = 0;

  for (const candidate of addressCandidates) {
    const region = inferRegionFromAddressText(candidate);
    if (region === "hongKong") {
      hongKongSignals += 1;
    } else if (region === "overseas") {
      overseasSignals += 1;
    }
  }

  if (hongKongSignals > 0 && overseasSignals === 0) {
    return "hongKong";
  }

  if (overseasSignals > 0 && hongKongSignals === 0) {
    return "overseas";
  }

  const requirementKeys = new Set(
    options?.documents?.map((document) => document.requirementKey).filter(Boolean) ?? [],
  );
  if (
    requirementKeys.has("businessRegistration") ||
    requirementKeys.has("annualReturnAndChanges")
  ) {
    return "hongKong";
  }
  if (requirementKeys.has("incumbencyOrGoodStanding")) {
    return "overseas";
  }

  return "unknown";
};

export const getApplicableMaterialRequirements = (
  values: CompanyAccountFormValues,
  options?: {
    findings?: PrefillFinding[];
    documents?: UploadedDocument[];
  },
) => {
  const region = deriveCompanyIncorporationRegion(values, options);
  return materialRequirements.filter((requirement) =>
    isRequirementApplicableForRegion(requirement, region),
  );
};

export const getApplicableUploadMaterialRequirements = (
  values: CompanyAccountFormValues,
  options?: {
    findings?: PrefillFinding[];
    documents?: UploadedDocument[];
  },
) =>
  getApplicableMaterialRequirements(values, options).filter((item) => !item.generated);

export const getRequiredUploadMaterialRequirements = (
  values: CompanyAccountFormValues,
  options?: {
    findings?: PrefillFinding[];
    documents?: UploadedDocument[];
  },
) =>
  getApplicableUploadMaterialRequirements(values, options).filter((item) =>
    ["all", "hongKongOnly", "overseasOnly"].includes(item.applicability),
  );

export const getCoreMaterialRequirementKeys = (
  values: CompanyAccountFormValues,
  options?: {
    findings?: PrefillFinding[];
    documents?: UploadedDocument[];
  },
) =>
  getApplicableUploadMaterialRequirements(values, options)
    .filter((item) => item.applicability === "all")
    .map((item) => item.key);

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

  if (values.entityType === "other" && !values.entityTypeOther.trim()) {
    missing.push({
      field: "entityTypeOther",
      label: "其他实体性质",
      step: "funding",
    });
  }

  if (values.openingPurpose === "other" && !values.openingPurposeOther.trim()) {
    missing.push({
      field: "openingPurposeOther",
      label: "其他开户目的",
      step: "funding",
    });
  }

  if (values.sourceRegion === "other" && !values.sourceRegionOther.trim()) {
    missing.push({
      field: "sourceRegionOther",
      label: "其他来源地",
      step: "funding",
    });
  }

  if (
    values.initialFundingSources.includes("other") &&
    !values.initialFundingOther.trim()
  ) {
    missing.push({
      field: "initialFundingOther",
      label: "初始资金来源其他说明",
      step: "funding",
    });
  }

  if (
    values.ongoingFundingSources.includes("other") &&
    !values.ongoingFundingOther.trim()
  ) {
    missing.push({
      field: "ongoingFundingOther",
      label: "持续资金来源其他说明",
      step: "funding",
    });
  }

  if (values.investmentObjective === "other" && !values.investmentObjectiveOther.trim()) {
    missing.push({
      field: "investmentObjectiveOther",
      label: "其他投资目标说明",
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

export const safeJsonParse = <T>(value: string, fallback: T) => {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
};
