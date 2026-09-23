import type { Metadata, Viewport } from "next";
import { Heebo } from "next/font/google";
import { ToastProvider } from "@/components/ui/toast";
import "./globals.css";

const heebo = Heebo({ subsets: ["hebrew", "latin"], variable: "--font-heebo" });

export const metadata: Metadata = {
  title: { default: "משמרות", template: "%s · משמרות" },
  description: "ניהול סידור עבודה שבועי למוקד",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#3b5bdb",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="he" dir="rtl" className={`${heebo.variable} h-full antialiased`}>
      <body className="min-h-full font-sans">
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
