// What production builds use in place of staffPreview.tsx (see vite.config.ts), so the fictional staff
// preview data and its request layer are not shipped to browsers at all. Everything here is inert.
export type PreviewRole = "admin" | "counselor" | "telecaller";
export const isStaffPreview = (): boolean => false;
export const previewRoleFromPath = (_pathname: string): PreviewRole | null => null;
export const installStaffPreview = (): void => {};
export const StaffPreviewPicker = (): null => null;
