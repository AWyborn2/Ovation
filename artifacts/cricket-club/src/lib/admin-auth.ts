export const ADMIN_PASSWORD_STORAGE_KEY = "hhcc.adminPassword";

export function getAdminPassword(): string | null {
  if (typeof window === "undefined") return null;
  return window.sessionStorage.getItem(ADMIN_PASSWORD_STORAGE_KEY);
}

export function setAdminPassword(value: string): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(ADMIN_PASSWORD_STORAGE_KEY, value);
}

export function clearAdminPassword(): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(ADMIN_PASSWORD_STORAGE_KEY);
}
