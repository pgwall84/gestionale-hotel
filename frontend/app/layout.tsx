// Layout radice — carica il font Inter e avvolge tutto con il contesto auth.
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/context/AuthContext";

// Inter: font principale del design system. Usiamo solo peso 400 e 500 come da briefing.
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  weight: ["400", "500", "600"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Gestionale Hotel",
  description: "Gestionale interno hotel",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="it" className={`${inter.variable} h-full`}>
      <body className="font-sans antialiased min-h-full">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
