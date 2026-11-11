import type { Metadata, Viewport } from "next";
import { Inter, Manrope, Sora } from "next/font/google";
import Providers from "./providers";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const manrope = Manrope({ variable: "--font-manrope", subsets: ["latin"] });
const sora = Sora({ variable: "--font-sora", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Sheda",
  description:
    "Buy, rent and invest in verified property, with escrow and documents on NEAR.",
  icons: { icon: "/images/favicon.png" },
};

export const viewport: Viewport = {
  themeColor: "#C1272D",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${manrope.variable} ${sora.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-white font-sans text-primaryText">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
