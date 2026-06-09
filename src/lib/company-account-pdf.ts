import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb } from "pdf-lib";

import {
  type AuthorizedPerson,
  type CompanyAccountFormValues,
  type ExperienceKey,
  type FundingSourceKey,
  type InvestmentObjectiveKey,
} from "@/lib/company-account-schema";

const PAGE_HEIGHT = 842.04;
const textColor = rgb(0.13, 0.14, 0.18);
const lightTextColor = rgb(0.23, 0.24, 0.28);

type DrawTextOptions = {
  x: number;
  y: number;
  maxWidth: number;
  size?: number;
  lineHeight?: number;
  maxLines?: number;
};

type DrawSignatureOptions = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type GeneratePdfOptions = {
  values: CompanyAccountFormValues;
  signatureDataUrl?: string | null;
};

type EmbeddedAssets = {
  templateBytes: ArrayBuffer;
  fontBytes: ArrayBuffer;
};

const experienceRowY: Record<ExperienceKey, number> = {
  shortSales: 520.27,
  securitiesTrading: 504.55,
  stockOptions: 489.79,
  futuresOptions: 474.55,
  forexCommodity: 459.55,
  bullion: 445.03,
  realEstate: 428.83,
  derivativeWarrants: 412.63,
  callableBullBear: 398.21,
  exchangeTradedFunds: 380.57,
  equityLinkedInstruments: 363.17,
  mutualFunds: 346.97,
  fixedIncome: 331.37,
};

const derivativeKnowledgeY = {
  noDerivativeTrading: 286.25,
  fiveTransactions: 256.73,
  training: 217.46,
  workExperience: 187.58,
  riskDisclosureAccepted: 146.54,
} as const;

const fitDate = (value: string) => value.trim();

const normalizeText = (value: string) =>
  value.replace(/\r/g, "").replace(/\n+/g, " ").replace(/\s+/g, " ").trim();

const fetchAsset = async (path: string) => {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`Failed to load ${path}`);
  }
  return response.arrayBuffer();
};

const loadAssets = async (): Promise<EmbeddedAssets> => {
  const [templateBytes, fontBytes] = await Promise.all([
    fetchAsset("/companyAccount.pdf"),
    fetchAsset("/fonts/ArialUnicode.ttf"),
  ]);

  return { templateBytes, fontBytes };
};

const hexToBytes = (base64: string) => {
  const binary =
    typeof atob === "function"
      ? atob(base64)
      : Buffer.from(base64, "base64").toString("binary");

  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
};

const signatureBytesFromDataUrl = (value: string) => {
  const [, base64 = ""] = value.split(",");
  return hexToBytes(base64);
};

const splitTextIntoLines = (
  text: string,
  font: Awaited<ReturnType<PDFDocument["embedFont"]>>,
  size: number,
  maxWidth: number,
) => {
  const normalized = normalizeText(text);
  if (!normalized) {
    return [];
  }

  const lines: string[] = [];
  let currentLine = "";

  for (const character of normalized) {
    const candidate = currentLine + character;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth || !currentLine) {
      currentLine = candidate;
      continue;
    }

    lines.push(currentLine.trim());
    currentLine = character.trim() ? character : "";
  }

  if (currentLine.trim()) {
    lines.push(currentLine.trim());
  }

  return lines;
};

const drawText = (
  page: ReturnType<PDFDocument["getPages"]>[number],
  font: Awaited<ReturnType<PDFDocument["embedFont"]>>,
  text: string,
  {
    x,
    y,
    maxWidth,
    size = 10,
    lineHeight = size + 2,
    maxLines = 1,
  }: DrawTextOptions,
) => {
  if (!normalizeText(text)) {
    return;
  }

  const lines = splitTextIntoLines(text, font, size, maxWidth).slice(0, maxLines);
  lines.forEach((line, index) => {
    page.drawText(line, {
      x,
      y: y - index * lineHeight,
      size,
      font,
      color: textColor,
    });
  });
};

const drawCaption = (
  page: ReturnType<PDFDocument["getPages"]>[number],
  font: Awaited<ReturnType<PDFDocument["embedFont"]>>,
  text: string,
  options: DrawTextOptions,
) => {
  if (!normalizeText(text)) {
    return;
  }

  const lines = splitTextIntoLines(text, font, options.size ?? 8, options.maxWidth).slice(
    0,
    options.maxLines ?? 2,
  );
  lines.forEach((line, index) => {
    page.drawText(line, {
      x: options.x,
      y: options.y - index * (options.lineHeight ?? 10),
      size: options.size ?? 8,
      font,
      color: lightTextColor,
    });
  });
};

const drawCheck = (
  page: ReturnType<PDFDocument["getPages"]>[number],
  font: Awaited<ReturnType<PDFDocument["embedFont"]>>,
  x: number,
  y: number,
) => {
  page.drawText("✓", {
    x,
    y,
    size: 11,
    font,
    color: textColor,
  });
};

const drawSignature = (
  page: ReturnType<PDFDocument["getPages"]>[number],
  signatureImage: Awaited<ReturnType<PDFDocument["embedPng"]>> | null,
  rect: DrawSignatureOptions,
) => {
  if (!signatureImage) {
    return;
  }

  const scale = Math.min(rect.width / signatureImage.width, rect.height / signatureImage.height);
  const width = signatureImage.width * scale;
  const height = signatureImage.height * scale;

  page.drawImage(signatureImage, {
    x: rect.x + (rect.width - width) / 2,
    y: rect.y + (rect.height - height) / 2,
    width,
    height,
  });
};

const toggleCheck = <T extends string>(items: T[], key: T) => items.includes(key);

const drawFundingCheckboxGroup = (
  page: ReturnType<PDFDocument["getPages"]>[number],
  font: Awaited<ReturnType<PDFDocument["embedFont"]>>,
  selected: FundingSourceKey[],
  otherText: string,
  baseY: number,
) => {
  const positions: Record<FundingSourceKey, { x: number; y: number }> = {
    operationalIncome: { x: 126, y: baseY },
    investmentIncome: { x: 213, y: baseY },
    interestIncome: { x: 298, y: baseY },
    shareholderFunds: { x: 383, y: baseY },
    saleOfInvestment: { x: 126, y: baseY - 22 },
    rentalIncome: { x: 213, y: baseY - 22 },
    externalBorrowing: { x: 298, y: baseY - 22 },
    other: { x: 383, y: baseY - 22 },
  };

  selected.forEach((key) => {
    const point = positions[key];
    if (point) {
      drawCheck(page, font, point.x, point.y);
    }
  });

  if (selected.includes("other")) {
    drawText(page, font, otherText, {
      x: 432,
      y: baseY - 20,
      maxWidth: 115,
      size: 8.5,
      maxLines: 1,
    });
  }
};

const drawAuthorizedPerson = (
  page: ReturnType<PDFDocument["getPages"]>[number],
  font: Awaited<ReturnType<PDFDocument["embedFont"]>>,
  person: AuthorizedPerson,
  positions: {
    fullNameY: number;
    nationalityY: number;
    phoneY: number;
    idY: number;
    residentialY: number;
    occupationY: number;
    relationshipY: number;
  },
) => {
  drawText(page, font, person.fullName, {
    x: 55,
    y: positions.fullNameY,
    maxWidth: 228,
    size: 9.5,
  });
  drawText(page, font, person.nationality, {
    x: 305,
    y: positions.nationalityY,
    maxWidth: 110,
    size: 9.5,
  });
  drawText(page, font, person.phone, {
    x: 433,
    y: positions.phoneY,
    maxWidth: 105,
    size: 9.5,
  });
  drawText(page, font, person.idNumber, {
    x: 55,
    y: positions.idY,
    maxWidth: 220,
    size: 9.2,
  });
  drawText(page, font, person.residentialAddress, {
    x: 291,
    y: positions.residentialY,
    maxWidth: 255,
    size: 8.8,
    maxLines: 2,
    lineHeight: 10,
  });
  drawText(page, font, person.occupationAddress, {
    x: 55,
    y: positions.occupationY,
    maxWidth: 490,
    size: 8.8,
    maxLines: 2,
    lineHeight: 10,
  });
  drawText(page, font, person.instructionRelationship, {
    x: 55,
    y: positions.relationshipY,
    maxWidth: 290,
    size: 8.6,
    maxLines: 2,
    lineHeight: 10,
  });
};

const drawPageTwo = (
  pages: ReturnType<PDFDocument["getPages"]>,
  font: Awaited<ReturnType<PDFDocument["embedFont"]>>,
  values: CompanyAccountFormValues,
) => {
  const page = pages[1];

  drawText(page, font, values.businessRegistrationNo, {
    x: 49,
    y: 432,
    maxWidth: 246,
    size: 9.5,
  });
  drawText(page, font, values.natureOfBusiness, {
    x: 307,
    y: 392,
    maxWidth: 245,
    size: 9.5,
  });
  drawText(page, font, values.businessPhone, {
    x: 49,
    y: 359,
    maxWidth: 246,
    size: 9.5,
  });
  drawText(page, font, values.fax, {
    x: 306,
    y: 331,
    maxWidth: 248,
    size: 9.5,
  });
  drawText(page, font, values.ccassAccount, {
    x: 49,
    y: 301,
    maxWidth: 500,
    size: 9,
  });

  if (values.communicationMethod === "email") {
    drawCheck(page, font, 58, 255);
  } else {
    drawCheck(page, font, 58, 228);
  }

  const accountTypeCheckpoints = {
    securitiesCash: { x: 309, y: 715 },
    securitiesMargin: { x: 309, y: 703 },
    futuresOptions: { x: 309, y: 690 },
    discretionary: { x: 309, y: 678 },
    aShare: { x: 434, y: 715 },
    hShare: { x: 434, y: 703 },
  } as const;

  values.accountTypes.forEach((key) => {
    const point = accountTypeCheckpoints[key as keyof typeof accountTypeCheckpoints];
    if (point) {
      drawCheck(page, font, point.x, point.y);
    }
  });

  if (values.accountTypeOther.trim()) {
    drawCheck(page, font, 434, 691);
    drawText(page, font, values.accountTypeOther, {
      x: 488,
      y: 691,
      maxWidth: 66,
      size: 8.4,
    });
  }

  if (values.electronicTrading) {
    drawCheck(page, font, 308, 637);
  } else {
    drawCheck(page, font, 351, 637);
  }

  const entityTypeCheckpoints = {
    sole: { x: 130, y: 559 },
    partnership: { x: 130, y: 542 },
    listed: { x: 338, y: 559 },
    other: { x: 338, y: 542 },
  } as const;

  drawCheck(page, font, entityTypeCheckpoints[values.entityType].x, entityTypeCheckpoints[values.entityType].y);
  if (values.entityType === "other") {
    drawText(page, font, values.entityTypeOther, {
      x: 377,
      y: 541,
      maxWidth: 165,
      size: 8.4,
    });
  }
};

const drawPageFive = (
  pages: ReturnType<PDFDocument["getPages"]>,
  font: Awaited<ReturnType<PDFDocument["embedFont"]>>,
  values: CompanyAccountFormValues,
) => {
  const page = pages[4];

  if (values.openingPurpose === "investment") {
    drawCheck(page, font, 151, 722);
  } else {
    drawCheck(page, font, 253, 722);
    drawText(page, font, values.openingPurposeOther, {
      x: 336,
      y: 722,
      maxWidth: 140,
      size: 8.5,
    });
  }

  const regionChecks = {
    hongKong: { x: 151, y: 699 },
    prc: { x: 223, y: 699 },
    other: { x: 287, y: 699 },
  } as const;
  drawCheck(page, font, regionChecks[values.sourceRegion].x, regionChecks[values.sourceRegion].y);
  if (values.sourceRegion === "other") {
    drawText(page, font, values.sourceRegionOther, {
      x: 337,
      y: 699,
      maxWidth: 95,
      size: 8.5,
    });
  }

  drawFundingCheckboxGroup(
    page,
    font,
    values.initialFundingSources,
    values.initialFundingOther,
    685,
  );
  drawFundingCheckboxGroup(
    page,
    font,
    values.ongoingFundingSources,
    values.ongoingFundingOther,
    642,
  );

  drawText(page, font, values.authorizedShareCapital, {
    x: 246,
    y: 560,
    maxWidth: 102,
    size: 8.8,
  });
  drawText(page, font, values.authorizedShareCount, {
    x: 51,
    y: 542,
    maxWidth: 150,
    size: 8.8,
  });
  drawText(page, font, values.authorizedShareFaceValue, {
    x: 370,
    y: 542,
    maxWidth: 48,
    size: 8.8,
  });
  drawText(page, font, values.paidUpCapital, {
    x: 211,
    y: 523,
    maxWidth: 120,
    size: 8.8,
  });
  drawText(page, font, values.issuedShareCount, {
    x: 207,
    y: 504,
    maxWidth: 150,
    size: 8.8,
  });
  drawText(page, font, values.issuedShareFaceValue, {
    x: 370,
    y: 504,
    maxWidth: 48,
    size: 8.8,
  });

  const capitalChecks = {
    lt100k: { x: 52, y: 472 },
    "100kTo1m": { x: 145, y: 472 },
    "1mTo5m": { x: 281, y: 472 },
    gt5m: { x: 411, y: 472 },
  } as const;
  if (values.capitalBand) {
    const point = capitalChecks[values.capitalBand];
    if (point) {
      drawCheck(page, font, point.x, point.y);
    }
  }

  if (values.financialAccountsProvided === true) {
    drawCheck(page, font, 57, 435);
  }
  if (values.financialAccountsProvided === false) {
    drawCheck(page, font, 150, 435);
  }

  drawAuthorizedPerson(page, font, values.authorizedPersons[0], {
    fullNameY: 321,
    nationalityY: 321,
    phoneY: 321,
    idY: 297,
    residentialY: 297,
    occupationY: 272,
    relationshipY: 240,
  });

  drawAuthorizedPerson(page, font, values.authorizedPersons[1], {
    fullNameY: 183,
    nationalityY: 183,
    phoneY: 183,
    idY: 159,
    residentialY: 159,
    occupationY: 134,
    relationshipY: 102,
  });
};

const drawPageSix = (
  pages: ReturnType<PDFDocument["getPages"]>,
  font: Awaited<ReturnType<PDFDocument["embedFont"]>>,
  values: CompanyAccountFormValues,
  signatureImage: Awaited<ReturnType<PDFDocument["embedPng"]>> | null,
) => {
  const page = pages[5];

  drawAuthorizedPerson(page, font, values.authorizedPersons[2], {
    fullNameY: 716,
    nationalityY: 716,
    phoneY: 716,
    idY: 692,
    residentialY: 692,
    occupationY: 667,
    relationshipY: 635,
  });

  const objectiveChecks: Record<InvestmentObjectiveKey, { x: number; y: number }> = {
    aggressive: { x: 58, y: 557 },
    growth: { x: 149, y: 557 },
    conservative: { x: 233, y: 557 },
    other: { x: 324, y: 557 },
  };
  drawCheck(
    page,
    font,
    objectiveChecks[values.investmentObjective].x,
    objectiveChecks[values.investmentObjective].y,
  );
  if (values.investmentObjective === "other") {
    drawText(page, font, values.investmentObjectiveOther, {
      x: 422,
      y: 557,
      maxWidth: 120,
      size: 8.5,
    });
  }

  for (const [key, y] of Object.entries(experienceRowY) as [ExperienceKey, number][]) {
    const entry = values.experiences[key];
    if (entry.enabled) {
      drawCheck(page, font, 383, y - 1);
      drawText(page, font, entry.years, {
        x: 424,
        y: y - 1,
        maxWidth: 44,
        size: 8.4,
      });
    } else {
      drawCheck(page, font, 327, y - 1);
    }
  }

  for (const [key, y] of Object.entries(derivativeKnowledgeY) as [
    keyof typeof derivativeKnowledgeY,
    number,
  ][]) {
    if (toggleCheck(values.derivativeKnowledge, key)) {
      drawCheck(page, font, 54, y - 1);
    }
  }

  drawSignature(page, signatureImage, {
    x: 365,
    y: 52,
    width: 173,
    height: 39,
  });
  drawText(page, font, values.clientSignatureName, {
    x: 338,
    y: 39,
    maxWidth: 170,
    size: 8.8,
  });
};

const drawPageNine = (
  pages: ReturnType<PDFDocument["getPages"]>,
  font: Awaited<ReturnType<PDFDocument["embedFont"]>>,
  values: CompanyAccountFormValues,
  signatureImage: Awaited<ReturnType<PDFDocument["embedPng"]>> | null,
) => {
  const page = pages[8];

  drawText(page, font, values.companyNameEnglish || values.companyNameChinese, {
    x: 49,
    y: 486,
    maxWidth: 245,
    size: 9.2,
    maxLines: 2,
    lineHeight: 10,
  });
  drawText(page, font, values.authorizedSignatoryName, {
    x: 49,
    y: 389,
    maxWidth: 245,
    size: 9.2,
  });
  drawText(page, font, values.witnessName, {
    x: 49,
    y: 304,
    maxWidth: 245,
    size: 9.2,
  });
  drawText(page, font, values.witnessOccupation, {
    x: 49,
    y: 271,
    maxWidth: 245,
    size: 9.2,
  });
  drawText(page, font, values.witnessCompanyName, {
    x: 49,
    y: 239,
    maxWidth: 245,
    size: 9.2,
  });
  drawText(page, font, values.witnessCompanyAddress, {
    x: 49,
    y: 206,
    maxWidth: 245,
    size: 8.8,
    maxLines: 2,
    lineHeight: 10,
  });
  drawText(page, font, fitDate(values.declarationDate), {
    x: 379,
    y: 123,
    maxWidth: 162,
    size: 9.2,
  });

  drawSignature(page, signatureImage, {
    x: 356,
    y: 385,
    width: 188,
    height: 42,
  });
  if (values.witnessName.trim()) {
    drawSignature(page, signatureImage, {
      x: 356,
      y: 275,
      width: 188,
      height: 42,
    });
  }
  drawSignature(page, signatureImage, {
    x: 356,
    y: 165,
    width: 188,
    height: 42,
  });
};

const fillEmbeddedFields = (
  pdf: PDFDocument,
  font: Awaited<ReturnType<PDFDocument["embedFont"]>>,
  values: CompanyAccountFormValues,
) => {
  const form = pdf.getForm();
  const fieldValues: Record<string, string> = {
    "1": values.intakeReference,
    "2": values.intakeDate,
    name: values.companyNameChinese,
    lastName: values.companyNameEnglish,
    customerAddress: values.registeredAddress,
    address: values.businessAddress,
    birth: values.incorporationDate,
    idNo: values.incorporationNo,
    phone: values.contactPhone,
    email: values.email,
  };

  for (const [fieldName, value] of Object.entries(fieldValues)) {
    try {
      const field = form.getTextField(fieldName);
      field.setText(normalizeText(value));
    } catch {
      // Ignore mismatched template fields and continue with overlay text.
    }
  }

  form.updateFieldAppearances(font);
  form.flatten();
};

export const generateCompanyAccountPdf = async ({
  values,
  signatureDataUrl,
}: GeneratePdfOptions) => {
  const assets = await loadAssets();
  const pdf = await PDFDocument.load(assets.templateBytes);
  pdf.registerFontkit(fontkit);
  const font = await pdf.embedFont(assets.fontBytes, { subset: true });
  const signatureImage = signatureDataUrl
    ? await pdf.embedPng(signatureBytesFromDataUrl(signatureDataUrl))
    : null;

  fillEmbeddedFields(pdf, font, values);

  const pages = pdf.getPages();
  drawPageTwo(pages, font, values);
  drawPageFive(pages, font, values);
  drawPageSix(pages, font, values, signatureImage);
  drawPageNine(pages, font, values, signatureImage);

  drawCaption(pages[0], font, normalizeText(values.reviewNotes), {
    x: 220,
    y: PAGE_HEIGHT - 725,
    maxWidth: 320,
    size: 7.8,
    maxLines: 3,
    lineHeight: 9,
  });

  const bytes = await pdf.save();
  const blobBytes = Array.from(bytes);
  return new Blob([new Uint8Array(blobBytes)], { type: "application/pdf" });
};
