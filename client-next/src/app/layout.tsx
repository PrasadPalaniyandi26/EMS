import type { Metadata, Viewport } from "next";
import { IBM_Plex_Sans } from "next/font/google";
import "./globals.css";
import { QueryProvider } from "@/components/providers/query-provider";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

// One typeface for the whole app (IBM Plex Sans: a humanist grotesque with a technical, ledger-like character).
// Components must not set their own font family; change it here.
const plexSans = IBM_Plex_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700"], display: "swap", variable: "--font-plex-sans" });

export const metadata: Metadata = {
  title: "NTEMS — Expense Management System",
  description: "Enterprise-grade financial management for teams and organizations",
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      {/* Blocking script reads persisted theme from localStorage before first paint to prevent flash */}
      <head>
        <script dangerouslySetInnerHTML={{ __html: `try{var _t=JSON.parse(localStorage.getItem('ems-theme')||'{}');var _theme=(_t.state&&_t.state.theme)||'dark';document.documentElement.classList.toggle('dark',_theme==='dark');}catch(e){document.documentElement.classList.add('dark');}` }} />
      </head>
      <body className={`${plexSans.variable} font-sans antialiased`} suppressHydrationWarning>
        <QueryProvider>
          <ThemeProvider>
            <TooltipProvider>
              {children}
              <Toaster position="top-center" richColors closeButton />
            </TooltipProvider>
          </ThemeProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
