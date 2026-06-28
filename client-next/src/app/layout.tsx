import type { Metadata, Viewport } from "next";
import { Inter, Raleway } from "next/font/google";
import "./globals.css";
import { QueryProvider } from "@/components/providers/query-provider";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

const inter = Inter({ subsets: ["latin"] });
export const raleway = Raleway({ subsets: ["latin"], weight: ["700", "800"], variable: "--font-raleway" });

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
      <body className={`${inter.className} ${raleway.variable} antialiased`} suppressHydrationWarning>
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
