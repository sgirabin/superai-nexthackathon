import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "GoAround SG",
  description: "Agentic local discovery assistant for Singapore"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
