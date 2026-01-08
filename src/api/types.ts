export type Department =
  | "React"
  | "Next"
  | "Vue"
  | "Flutter"
  | "React.Native"
  | "html/css"
  | "AI-ML"
  | "Nest"
  | "Node"
  | "DotNet"
  | "Blockchain";

export type EstimationStatus =
  | "PENDING"
  | "PROCESSING"
  | "COMPLETED"
  | "FAILED";

export type EstimateConfidence = "Low" | "Medium" | "High";

export interface FileUploadResponseBase {
  url?: string;
  path: string;
  savedName: string;
  publicId?: string;
  format?: string;
  size: number;
  uploadedAt: string;
  fileName: string;
  fileType: "SOW" | "FRD" | "EXCEL" | "DOCUMENT";
}

export interface ExcelUploadResponse extends FileUploadResponseBase {
  fileType: "EXCEL";
  sessionId?: string;
  batches?: any[];
  detectedDepartments?: Department[];
  featureDescriptions?: Record<string, string>;
}

export interface EstimateCreateRequest {
  sessionId?: string;
  departments?: Department[];
  departmentWeights?: Partial<Record<Department, number>>;
  specialInstructions?: string[];
}

export interface EstimateCreateResponse {
  message: string;
  jobId: string;
  status: EstimationStatus;
  pollUrl: string;
}

export interface HoursRange {
  min: number;
  mostLikely: number;
  max: number;
}

export interface EstimationResultItem {
  featureIndex?: number;
  batch?: string;
  featureName?: string;
  complexity?: string;
  techRemarks?: string;

  confidence?: EstimateConfidence;
  batchConfidenceDelta?: EstimateConfidence;
  userRemark?: string;

  frontendHoursRange?: HoursRange;
  backendHoursRange?: HoursRange;
  mobileHoursRange?: HoursRange;
  htmlCssHoursRange?: HoursRange;
  aiMlHoursRange?: HoursRange;

  // Legacy/flat-hour responses
  frontendHours?: number;
  backendHours?: number;
  mobileHours?: number;
  htmlCssHours?: number;
  aiMlHours?: number;

  // Any other server-provided metadata
  [key: string]: unknown;
}

export interface EstimateStatusResponse {
  sessionId: string;
  status: EstimationStatus;
  error?: string;
  progress?: string;
  result?: EstimationResultItem[];
}
