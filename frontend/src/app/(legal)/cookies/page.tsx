import type { Metadata } from "next";
import Link from "next/link";

import { LEGAL_VERSION, CONTACT_EMAIL, LEGAL_LINKS } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Política de Cookies",
};

export default function CookiesPage() {
  return (
    <>
      <h1 className="text-2xl font-bold tracking-tight">
        Política de cookies y almacenamiento local
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Última actualización: 24 de agosto de 2026 · Versión {LEGAL_VERSION}
      </p>

      <h2 className="mt-8 text-lg font-semibold">¿Usamos cookies?</h2>
      <p className="mt-3 leading-relaxed">
        <strong>No.</strong> &quot;Entrenador IA&quot; no utiliza cookies
        propias ni de terceros: ni analíticas, ni publicitarias, ni de
        personalización, ni de seguimiento. Por eso no se muestra banner de
        consentimiento de cookies.
      </p>

      <h2 className="mt-8 text-lg font-semibold">
        Almacenamiento local (localStorage)
      </h2>
      <p className="mt-3 leading-relaxed">
        Utilizamos exclusivamente el almacenamiento local del navegador para
        información estrictamente técnica y funcional, equivalente a cookies
        técnicas exentas de consentimiento (art. 22.2 LSSI-CE):
      </p>
      <ul className="mt-3 list-disc space-y-1 pl-6">
        <li>
          <strong>access_token</strong> — token de sesión JWT que mantiene tu
          sesión iniciada; se elimina al cerrar sesión.
        </li>
        <li>
          <strong>theme</strong> — tu preferencia de tema claro/oscuro.
        </li>
        <li>
          <strong>Borradores de formularios</strong> (
          <code>analysis_draft_*</code>) — texto que estás escribiendo en un
          formulario de análisis, para no perderlo si recargas la página.
        </li>
        <li>
          <strong>endgame_hide_completed</strong> — preferencia de vista de las
          lecciones de finales.
        </li>
      </ul>
      <p className="mt-3 leading-relaxed">
        Estos datos permanecen en tu dispositivo y no se transmiten a ningún
        servidor, salvo el token de sesión, que viaja en cada petición
        autenticada. Puedes eliminarlos borrando los datos del sitio desde tu
        navegador o cerrando sesión.
      </p>

      <h2 className="mt-8 text-lg font-semibold">Cookies de terceros</h2>
      <p className="mt-3 leading-relaxed">
        Ninguno de nuestros proveedores instala cookies con este servicio:
        Vercel sirve contenido estático/cacheado, ngrok solo gestiona el túnel
        de transporte y Google Gemini recibe peticiones del servidor del
        Responsable sin ejecutar código en tu navegador.
      </p>
      <p className="mt-3 leading-relaxed">
        Si en el futuro se incorporaran analíticas u otras cookies, esta
        política se actualizará, se incrementará su versión y se solicitará tu
        consentimiento mediante un banner antes de instalarlas. Dudas:{" "}
        <a
          href={`mailto:${CONTACT_EMAIL}`}
          className="font-medium underline underline-offset-2"
        >
          {CONTACT_EMAIL}
        </a>
        .
      </p>

      <nav className="mt-10 flex flex-wrap gap-4 border-t pt-6 text-sm">
        {LEGAL_LINKS.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className="text-primary underline-offset-4 hover:underline"
          >
            {l.label}
          </Link>
        ))}
      </nav>
    </>
  );
}
