import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "TeacherEase Parent Companion",
  description: "Self-hosted web app that monitors your child's TeacherEase portal.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body
        className="overflow-hidden antialiased"
        style={{ height: "calc(100vh / var(--font-scale, 1))" }}
      >
        {children}
      </body>
    </html>
  );
}
