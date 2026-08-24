import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { ThemeProvider } from "@/components/theme-provider";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: {
    default: "Entrenador IA · Tu entrenador de ajedrez con IA",
    template: "%s · Entrenador IA",
  },
  description:
    "Entrenador personal de ajedrez con inteligencia artificial: análisis de partidas, coach virtual, entrenamiento táctico y lecciones de finales.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body className={inter.className}>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}