// What production builds use in place of previewMode.ts (see vite.config.ts), so the fictional
// counselor preview data is not shipped to browsers at all. Everything here is inert.
export const isCounselorPreview = (): boolean => false;
export const previewApi = async (_path: string, _options: { method?: string; body?: unknown } = {}): Promise<unknown> => {
  throw new Error("Preview is not available in this build.");
};
