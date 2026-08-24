import type { Metadata } from "next";
import Link from "next/link";

import { LEGAL_VERSION, CONTACT_EMAIL, LEGAL_LINKS } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Aviso legal y Términos",
};

export default function LegalNoticePage() {
  return (
    <>
      <h1 className="text-2xl font-bold tracking-tight">
        Aviso legal y Términos y Condiciones de uso
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Última actualización: 24 de agosto de 2026 · Versión {LEGAL_VERSION}
      </p>

      <h2 className="mt-8 text-lg font-semibold">1. Aviso legal (LSSI-CE)</h2>
      <p className="mt-3 leading-relaxed">
        En cumplimiento del deber de información de la Ley 34/2002, de 11 de
        julio, de Servicios de la Sociedad de la Información y de Comercio
        Electrónico (LSSI-CE), se informa:
      </p>
      <ul className="mt-3 list-disc space-y-1 pl-6">
        <li>
          <strong>Titular:</strong> Pedro Rendo Quindós (persona física,
          proyecto personal sin ánimo de lucro).
        </li>
        <li>
          <strong>Contacto:</strong>{" "}
          <a
            href={`mailto:${CONTACT_EMAIL}`}
            className="font-medium underline underline-offset-2"
          >
            {CONTACT_EMAIL}
          </a>
        </li>
        <li>
          <strong>Servicio:</strong> &quot;Entrenador IA&quot; — entrenador
          personal de ajedrez asistido por inteligencia artificial.
        </li>
        <li>
          <strong>Condición de usuario:</strong> el acceso al servicio es
          gratuito y su uso implica la aceptación plena de este aviso, de la{" "}
          <Link href="/privacidad" className="underline underline-offset-2">
            Política de Privacidad
          </Link>{" "}
          y de los Términos que figuran a continuación.
        </li>
      </ul>

      <h3 className="mt-6 font-semibold">Infraestructura técnica</h3>
      <ul className="mt-3 list-disc space-y-1 pl-6">
        <li>
          El frontend está alojado en la infraestructura de Vercel Inc. y se
          distribuye mediante su red global de contenido.
        </li>
        <li>
          El backend y la base de datos residen en un servidor propio del
          titular, expuesto únicamente a través de un túnel cifrado de ngrok
          Inc.
        </li>
        <li>
          El análisis por inteligencia artificial utiliza la API Google Gemini
          (Google Ireland Ltd / Google LLC), que actúa como encargado del
          tratamiento del contenido enviado para su análisis.
        </li>
        <li>
          La descarga de partidas públicas por nick usa la API pública de
          Lichess.org; no se envían datos personales del usuario registrado a
          Lichess.
        </li>
        <li>
          El motor de ajedrez Stockfish (software libre, licencia GPL) se
          ejecuta localmente en el servidor del titular.
        </li>
      </ul>

      <h3 className="mt-6 font-semibold">Propiedad intelectual</h3>
      <p className="mt-3 leading-relaxed">
        Los contenidos originales del servicio (código, textos, diseño e
        informes generados para cada usuario) son titularidad de Pedro Rendo
        Quindós. Los problemas tácticos proceden de la Lichess Open Database
        (licencia CC0). Las partidas de Grandes Maestros se incluyen con fines
        educativos. Al introducir partidas en formato PGN, el usuario declara
        tener derecho a hacerlo. Queda prohibida la reproducción o explotación
        del servicio sin autorización expresa del titular.
      </p>

      <h3 className="mt-6 font-semibold">Responsabilidad</h3>
      <p className="mt-3 leading-relaxed">
        El titular no garantiza la disponibilidad continua del servicio, que se
        presta sobre infraestructura propia de carácter experimental y puede
        verse interrumpido sin previo aviso. Los análisis e informes generados
        por IA tienen finalidad exclusivamente formativa y recreativa en el
        ámbito del ajedrez y no constituyen asesoramiento profesional.
      </p>

      <h2 className="mt-10 text-lg font-semibold">
        2. Términos y Condiciones de uso
      </h2>

      <h3 className="mt-6 font-semibold">Objeto y aceptación</h3>
      <p className="mt-3 leading-relaxed">
        Estas condiciones regulan el uso del servicio &quot;Entrenador IA&quot;.
        Al marcar la casilla de aceptación durante el registro, manifiestas
        haberlas leído y aceptado íntegramente. El servicio es personal,
        gratuito y de acceso individual mediante cuenta registrada.
      </p>

      <h3 className="mt-6 font-semibold">Cuenta de usuario</h3>
      <ul className="mt-3 list-disc space-y-1 pl-6">
        <li>
          Debes tener al menos 14 años, o autorización de tus padres o tutores
          legales si eres menor.
        </li>
        <li>
          Eres responsable de la confidencialidad de tu contraseña y de toda
          actividad realizada en tu cuenta; notificarás sin demora cualquier
          uso no autorizado a{" "}
          <a
            href={`mailto:${CONTACT_EMAIL}`}
            className="font-medium underline underline-offset-2"
          >
            {CONTACT_EMAIL}
          </a>
          .
        </li>
        <li>Un solo usuario por cuenta; no cedas ni compartas tu acceso.</li>
        <li>
          Facilitas información veraz; nombres de usuario ofensivos o
          suplantadores podrán provocar la baja de la cuenta.
        </li>
      </ul>

      <h3 className="mt-6 font-semibold">Uso aceptable</h3>
      <p className="mt-3 leading-relaxed">Te comprometes a no utilizar el servicio para:</p>
      <ul className="mt-3 list-disc space-y-1 pl-6">
        <li>
          Subir contenidos ilícitos, injuriosos o que vulneren derechos de
          terceros.
        </li>
        <li>
          Intentar acceder a cuentas ajenas, extraer datos de otros usuarios o
          vulnerar la seguridad del servicio.
        </li>
        <li>
          Sobrecargar artificialmente el servicio (uso intensivo anómalo de los
          endpoints de análisis o de la IA), dado que corre sobre
          infraestructura doméstica limitada.
        </li>
        <li>
          Explotarlo comercialmente sin autorización expresa del titular.
        </li>
      </ul>

      <h3 className="mt-6 font-semibold">
        Contenido generado por inteligencia artificial
      </h3>
      <p className="mt-3 leading-relaxed">
        Los informes, análisis y respuestas generados por la IA pueden contener
        errores o imprecisiones; no constituyen garantía de mejora de
        resultados deportivos ni asesoramiento profesional. Se generan a partir
        del contenido que tú aportas y puedes usarlos libremente para tu
        formación, sin perjuicio de los derechos del titular sobre el servicio.
      </p>

      <h3 className="mt-6 font-semibold">Disponibilidad y modificaciones</h3>
      <p className="mt-3 leading-relaxed">
        El servicio se ofrece &quot;tal cual&quot; y &quot;según
        disponibilidad&quot;, y puede interrumpirse, suspenderse o cesar sin
        previo aviso; ante un cese definitivo se comunicará razonablemente para
        que puedas exportar tus datos. El titular puede actualizar estos
        textos: la versión vigente estará siempre disponible aquí y, si un
        cambio fuera sustancial, se solicitará nueva aceptación.
      </p>

      <h3 className="mt-6 font-semibold">
        Ley aplicable y jurisdicción
      </h3>
      <p className="mt-3 leading-relaxed">
        Estos términos se rigen por la legislación española. Serán competentes
        los Juzgados y Tribunales correspondientes conforme a la normativa de
        protección de consumidores y usuarios.
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
