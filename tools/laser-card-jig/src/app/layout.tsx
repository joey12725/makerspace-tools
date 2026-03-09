import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Laser Card Jig Generator",
  description: "Generate 3D-printable jigs and laser-ready layouts for batch card engraving",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased bg-gray-50">
        {children}
      </body>
    </html>
  );
}
