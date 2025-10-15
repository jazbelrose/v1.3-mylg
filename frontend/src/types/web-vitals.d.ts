declare module 'web-vitals' {
  export type ReportHandler = (metric: unknown) => void;
  export const getCLS: (onPerfEntry: ReportHandler) => void;
  export const getFID: (onPerfEntry: ReportHandler) => void;
  export const getFCP: (onPerfEntry: ReportHandler) => void;
  export const getLCP: (onPerfEntry: ReportHandler) => void;
  export const getTTFB: (onPerfEntry: ReportHandler) => void;
}










