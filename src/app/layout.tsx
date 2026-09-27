import type { Metadata, Viewport } from "next";
import { Heebo } from "next/font/google";
import { cookies } from "next/headers";
import { THEME_COOKIE, parseTheme } from "@/components/theme";
import { ToastProvider } from "@/components/ui/toast";
import "./globals.css";

const heebo = Heebo({ subsets: ["hebrew", "latin"], variable: "--font-heebo" });

export const metadata: Metadata = {
  title: { default: "משמרות", template: "%s · משמרות" },
  description: "ניהול סידור עבודה שבועי למוקד",
  applicationName: "משמרות",
  // Installed to the home screen (see manifest.ts); iPhones read these instead of the manifest.
  appleWebApp: { capable: true, title: "משמרות", statusBarStyle: "default" },
  icons: { apple: "/icons/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#3b5bdb" },
    { media: "(prefers-color-scheme: dark)", color: "#171c25" },
  ],
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // The theme is rendered on the server, so the page never flashes the other one.
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);
  return (
    <html
      lang="he"
      dir="rtl"
      data-theme={theme === "system" ? undefined : theme}
      className={`${heebo.variable} h-full antialiased`}
    >
      <body className="min-h-full font-sans">
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
