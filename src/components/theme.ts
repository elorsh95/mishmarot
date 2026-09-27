/** The user's color theme: the device's setting, or always light / dark. Kept in a cookie. */
export type Theme = "system" | "light" | "dark";

export const THEME_COOKIE = "theme";

export function parseTheme(value: string | undefined): Theme {
  return value === "light" || value === "dark" ? value : "system";
}
