// What production builds use in place of studentPreviewMock.ts (see vite.config.ts), so the
// fictional preview data is not shipped to browsers at all. Everything here is inert.
export const studentPreviewSession = { access_token: "", expires_at: "", user: { id: "", email: "", user_metadata: {} } };
export const isStudentPreview = (): boolean => false;
export const previewRows = (_table: string): Record<string, any>[] => [];
export const mutatePreview = (_body: Record<string, any>): { data: Record<string, any>[]; count: number } => {
  throw new Error("Preview is not available in this build.");
};
export const installStudentPreview = (): void => {};
