import type { Metadata } from "next";
import Link from "next/link";

import {
  LEGAL_VERSION,
  LEGAL_UPDATED_AT,
  CONTACT_EMAIL,
  RESPONSIBLE_NAME,
  LEGAL_LINKS,
} from "@/lib/legal";

export const metadata: Metadata = {
  title: {
    default: "Información legal",
    template: "%s",
  },
  robots: { index: true, follow: true },
};

export default function LegalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 px-4 py-10 dark:from-slate-950 dark:to-slate-900">
      <div className="mx-auto w-full max-w-3xl space-y-6">
        <header className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <Link
              href="/login"
              className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"
            >
              ← Entrenador IA
            </Link>
            <span className="rounded-full border px-2.5 py-0.5 text-xs text-muted-foreground">
              v{LEGAL_VERSION}
            </span>
          </div>
          <nav className="flex flex-wrap gap-2">
            {LEGAL_LINKS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-lg border bg-card px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </header>

        <article className="rounded-xl border bg-card p-6 shadow-sm sm:p-8 [&_h2]:mt-8 [&_h2]:text-lg [&_h2]:font-semibold [&_h3]:mt-6 [&_h3]:font-semibold [&_p]:mt-3 [&_p]:leading-relaxed [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-6 [&_strong]:font-semibold">
          {children}
        </article>

        <footer className="pb-4 text-center text-xs text-muted-foreground">
          <p>
            Responsable: {RESPONSIBLE_NAME} · Contacto:{" "}
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="font-medium underline underline-offset-2"
            >
              {CONTACT_EMAIL}
            </a>
          </p>
          <p className="mt-1">
            Última actualización: {LEGAL_UPDATED_AT} · Versión {LEGAL_VERSION}
          </p>
        </footer>
      </div>
    </div>
  );
}
