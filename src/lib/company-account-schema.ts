export type AccountTypeKey =
  | "securitiesCash"
  | "securitiesMargin"
  | "futuresOptions"
  | "discretionary"
  | "aShare"
  | "hShare";

export type EntityTypeKey = "sole" | "listed" | "partnership" | "other";

export type SourceRegionKey = "hongKong" | "prc" | "other";

export type FundingSourceKey =
  | "operationalIncome"
  | "investmentIncome"
  | "interestIncome"
  | "shareholderFunds"
  | "saleOfInvestment"
  | "rentalIncome"
  | "externalBorrowing"
  | "other";

export type InvestmentObjectiveKey =
  | "aggressive"
  | "growth"
  | "conservative"
  | "other";

export type ExperienceKey =
  | "shortSales"
  | "securitiesTrading"
  | "stockOptions"
  | "futuresOptions"
  | "forexCommodity"
  | "bullion"
  | "realEstate"
  | "derivativeWarrants"
  | "callableBullBear"
  | "exchangeTradedFunds"
  | "equityLinkedInstruments"
  | "mutualFunds"
  | "fixedIncome";

export type DerivativeKnowledgeKey =
  | "noDerivativeTrading"
  | "fiveTransactions"
  | "training"
  | "workExperience"
  | "riskDisclosureAccepted";

export type CapitalBandKey = "" | "lt100k" | "100kTo1m" | "1mTo5m" | "gt5m";

export type CommunicationMethod = "email" | "post";

export type OpeningPurpose = "investment" | "other";

export type ExperienceEntry = {
  enabled: boolean;
  years: string;
};

export type AuthorizedPerson = {
  fullName: string;
  nationality: string;
  phone: string;
  idNumber: string;
  residentialAddress: string;
  occupationAddress: string;
  instructionRelationship: string;
};

export type CompanyAccountFormValues = {
  intakeReference: string;
  intakeDate: string;
  companyNameChinese: string;
  companyNameEnglish: string;
  registeredAddress: string;
  businessAddress: string;
  businessRegistrationNo: string;
  incorporationNo: string;
  incorporationDate: string;
  natureOfBusiness: string;
  businessPhone: string;
  contactPhone: string;
  email: string;
  fax: string;
  ccassAccount: string;
  accountTypes: AccountTypeKey[];
  accountTypeOther: string;
  electronicTrading: boolean;
  communicationMethod: CommunicationMethod;
  entityType: EntityTypeKey;
  entityTypeOther: string;
  openingPurpose: OpeningPurpose;
  openingPurposeOther: string;
  sourceRegion: SourceRegionKey;
  sourceRegionOther: string;
  initialFundingSources: FundingSourceKey[];
  ongoingFundingSources: FundingSourceKey[];
  initialFundingOther: string;
  ongoingFundingOther: string;
  authorizedShareCapital: string;
  authorizedShareCount: string;
  authorizedShareFaceValue: string;
  paidUpCapital: string;
  issuedShareCount: string;
  issuedShareFaceValue: string;
  capitalBand: CapitalBandKey;
  financialAccountsProvided: boolean | null;
  authorizedPersons: AuthorizedPerson[];
  investmentObjective: InvestmentObjectiveKey;
  investmentObjectiveOther: string;
  experiences: Record<ExperienceKey, ExperienceEntry>;
  derivativeKnowledge: DerivativeKnowledgeKey[];
  clientSignatureName: string;
  authorizedSignatoryName: string;
  witnessName: string;
  witnessOccupation: string;
  witnessCompanyName: string;
  witnessCompanyAddress: string;
  declarationDate: string;
  reviewNotes: string;
};

export type UploadedDocument = {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  extractable: boolean;
  extractedTextSample: string;
  parseNote: string;
};

export type PrefillFinding = {
  field: keyof CompanyAccountFormValues;
  label: string;
  value: string;
  source: string;
};

export type StepId = "upload" | "company" | "funding" | "review" | "sign";

export const steps: { id: StepId; label: string; hint: string }[] = [
  { id: "upload", label: "资料上传", hint: "上传登记、证照与证明文件" },
  { id: "company", label: "基础信息", hint: "填写公司、账户与联系人信息" },
  { id: "funding", label: "资金与风险", hint: "完成资金来源、投资目标与经验" },
  { id: "review", label: "复核回退", hint: "生成复核版 PDF 并定位修改" },
  { id: "sign", label: "签署导出", hint: "电子签名并导出最终 PDF" },
];

export const accountTypeOptions: {
  key: AccountTypeKey;
  label: string;
  description: string;
}[] = [
  { key: "securitiesCash", label: "证券现金", description: "Corporate cash securities account" },
  { key: "securitiesMargin", label: "证券保证金", description: "Corporate margin account" },
  { key: "futuresOptions", label: "期货期权", description: "Futures and options access" },
  { key: "discretionary", label: "全权委托管理", description: "Managed or discretionary account" },
  { key: "aShare", label: "A 股", description: "A-share access" },
  { key: "hShare", label: "H 股", description: "H-share access" },
];

export const entityTypeOptions: { key: EntityTypeKey; label: string }[] = [
  { key: "sole", label: "独资经营" },
  { key: "listed", label: "上市公司" },
  { key: "partnership", label: "合伙企业" },
  { key: "other", label: "其他" },
];

export const sourceRegionOptions: { key: SourceRegionKey; label: string }[] = [
  { key: "hongKong", label: "香港" },
  { key: "prc", label: "中国内地" },
  { key: "other", label: "其他" },
];

export const fundingSourceOptions: {
  key: FundingSourceKey;
  label: string;
}[] = [
  { key: "operationalIncome", label: "营运收入" },
  { key: "investmentIncome", label: "投资收入" },
  { key: "interestIncome", label: "利息收入" },
  { key: "shareholderFunds", label: "股东资金/合伙人注资" },
  { key: "saleOfInvestment", label: "出售投资" },
  { key: "rentalIncome", label: "租金收入" },
  { key: "externalBorrowing", label: "对外借贷" },
  { key: "other", label: "其他" },
];

export const investmentObjectiveOptions: {
  key: InvestmentObjectiveKey;
  label: string;
}[] = [
  { key: "aggressive", label: "进取" },
  { key: "growth", label: "增长" },
  { key: "conservative", label: "保守" },
  { key: "other", label: "其他" },
];

export const experienceRows: {
  key: ExperienceKey;
  label: string;
  englishLabel: string;
}[] = [
  { key: "shortSales", label: "沽空交易", englishLabel: "Short Sales Trading" },
  { key: "securitiesTrading", label: "证券交易", englishLabel: "Securities Trading" },
  { key: "stockOptions", label: "股票期权交易", englishLabel: "Stock Options" },
  { key: "futuresOptions", label: "期货/期权交易", englishLabel: "Futures/Options Trading" },
  { key: "forexCommodity", label: "外汇/商品期货交易", englishLabel: "Forex/Commodity Futures Trading" },
  { key: "bullion", label: "贵金属交易", englishLabel: "Bullion Trading" },
  { key: "realEstate", label: "房地产/物业投资", englishLabel: "Real Estate/Property Investment" },
  { key: "derivativeWarrants", label: "衍生权证交易", englishLabel: "Derivative Warrants" },
  { key: "callableBullBear", label: "牛熊证交易", englishLabel: "Callable Bull/Bear Contracts" },
  { key: "exchangeTradedFunds", label: "交易所买卖基金", englishLabel: "Exchange Traded Funds" },
  { key: "equityLinkedInstruments", label: "股票挂钩票据交易", englishLabel: "Equity Linked Instruments" },
  { key: "mutualFunds", label: "互惠基金/单位信托基金", englishLabel: "Mutual Funds / Unit Trust" },
  { key: "fixedIncome", label: "固定收益证券", englishLabel: "Fixed Income Securities" },
];

export const derivativeKnowledgeOptions: {
  key: DerivativeKnowledgeKey;
  label: string;
}[] = [
  { key: "noDerivativeTrading", label: "客户不会买卖任何衍生产品" },
  { key: "fiveTransactions", label: "过去三年内执行过五次或以上衍生产品交易" },
  { key: "training", label: "获授权人接受过衍生产品培训或课程" },
  { key: "workExperience", label: "获授权人有相关工作经验" },
  { key: "riskDisclosureAccepted", label: "已阅读并接受交易所买卖衍生产品风险说明" },
];

export const capitalBandOptions: {
  key: Exclude<CapitalBandKey, "">;
  label: string;
}[] = [
  { key: "lt100k", label: "≤ 100,000" },
  { key: "100kTo1m", label: "100,000 - 1,000,000" },
  { key: "1mTo5m", label: "1,000,000 - 5,000,000" },
  { key: "gt5m", label: "> 5,000,000" },
];

export const previewDeck = [
  {
    src: "/companyAccount-cover.png",
    title: "原始表封面",
    subtitle: "保留原版开户包结构与样式",
  },
  {
    src: "/previews/page5.png",
    title: "资金来源页",
    subtitle: "支持资金来源、资本结构与授权人信息录入",
  },
  {
    src: "/previews/page6.png",
    title: "风险评估页",
    subtitle: "投资目标、经验矩阵与衍生品知识可电子化勾选",
  },
  {
    src: "/previews/page9.png",
    title: "签署页",
    subtitle: "复核通过后可电子签名并导出 PDF",
  },
];

export const createEmptyAuthorizedPerson = (): AuthorizedPerson => ({
  fullName: "",
  nationality: "",
  phone: "",
  idNumber: "",
  residentialAddress: "",
  occupationAddress: "",
  instructionRelationship: "",
});

const blankExperience = (): Record<ExperienceKey, ExperienceEntry> =>
  experienceRows.reduce(
    (accumulator, row) => ({
      ...accumulator,
      [row.key]: {
        enabled: false,
        years: "",
      },
    }),
    {} as Record<ExperienceKey, ExperienceEntry>,
  );

export const initialCompanyAccountFormValues: CompanyAccountFormValues = {
  intakeReference: "",
  intakeDate: "",
  companyNameChinese: "",
  companyNameEnglish: "",
  registeredAddress: "",
  businessAddress: "",
  businessRegistrationNo: "",
  incorporationNo: "",
  incorporationDate: "",
  natureOfBusiness: "",
  businessPhone: "",
  contactPhone: "",
  email: "",
  fax: "",
  ccassAccount: "",
  accountTypes: [],
  accountTypeOther: "",
  electronicTrading: true,
  communicationMethod: "email",
  entityType: "other",
  entityTypeOther: "",
  openingPurpose: "investment",
  openingPurposeOther: "",
  sourceRegion: "hongKong",
  sourceRegionOther: "",
  initialFundingSources: [],
  ongoingFundingSources: [],
  initialFundingOther: "",
  ongoingFundingOther: "",
  authorizedShareCapital: "",
  authorizedShareCount: "",
  authorizedShareFaceValue: "",
  paidUpCapital: "",
  issuedShareCount: "",
  issuedShareFaceValue: "",
  capitalBand: "",
  financialAccountsProvided: null,
  authorizedPersons: [
    createEmptyAuthorizedPerson(),
    createEmptyAuthorizedPerson(),
    createEmptyAuthorizedPerson(),
  ],
  investmentObjective: "growth",
  investmentObjectiveOther: "",
  experiences: blankExperience(),
  derivativeKnowledge: [],
  clientSignatureName: "",
  authorizedSignatoryName: "",
  witnessName: "",
  witnessOccupation: "",
  witnessCompanyName: "",
  witnessCompanyAddress: "",
  declarationDate: "",
  reviewNotes: "",
};

export const requiredFieldLabels: {
  field: keyof CompanyAccountFormValues;
  label: string;
  step: StepId;
}[] = [
  { field: "companyNameChinese", label: "公司中文名称", step: "company" },
  { field: "companyNameEnglish", label: "公司英文名称", step: "company" },
  { field: "registeredAddress", label: "注册地址", step: "company" },
  { field: "businessAddress", label: "营业地址", step: "company" },
  { field: "incorporationNo", label: "注册成立证书号码", step: "company" },
  { field: "incorporationDate", label: "注册日期", step: "company" },
  { field: "contactPhone", label: "联络人电话", step: "company" },
  { field: "email", label: "电邮地址", step: "company" },
  { field: "openingPurpose", label: "开户目的", step: "funding" },
  { field: "sourceRegion", label: "资金来源地", step: "funding" },
  { field: "investmentObjective", label: "投资目标", step: "funding" },
  { field: "clientSignatureName", label: "客户签署姓名", step: "sign" },
  { field: "authorizedSignatoryName", label: "获授权签署人", step: "sign" },
  { field: "declarationDate", label: "签署日期", step: "sign" },
];
