import "./globals.css";
import type { Metadata, Viewport } from "next";
import { Toaster } from "react-hot-toast";
import { DEFAULT_RESTAURANT_NAME } from "@/lib/restaurant";
import Providers from "./providers";

export const metadata: Metadata = {
  title: process.env.NEXT_PUBLIC_APP_NAME ?? DEFAULT_RESTAURANT_NAME,
  description: "Заказ еды с доставкой в контейнеры, с оплатой банком или наличными.",
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/icons/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/favicon-64.png", sizes: "64x64", type: "image/png" },
    ],
    apple: [{ url: "/apple-icon.png", sizes: "192x192", type: "image/png" }],
    shortcut: ["/icons/favicon-32.png"],
  },
  appleWebApp: {
    capable: true,
    title: process.env.NEXT_PUBLIC_APP_NAME ?? DEFAULT_RESTAURANT_NAME,
    statusBarStyle: "default",
  },
  formatDetection: {
    telephone: true,
  },
};

export const viewport: Viewport = {
  themeColor: "#F5F5F7",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body>
        <Providers>
          <div className="min-h-screen">{children}</div>
        </Providers>
        <Toaster position="top-center" />
      </body>
    </html>
  );
}
