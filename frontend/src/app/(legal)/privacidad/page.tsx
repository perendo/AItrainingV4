import type { Metadata } from "next";
import Link from "next/link";

import { LEGAL_VERSION, CONTACT_EMAIL, RESPONSIBLE_NAME, LEGAL_LINKS } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Política de Privacidad",
};

export default function PrivacyPage() {
  return (
    <>
      <h1 className="text-2xl font-bold tracking-tight">Política de Privacidad</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Última actualización: 24 de agosto de 2026 · Versión {LEGAL_VERSION}
      </p>
      <p className="mt-4 leading-relaxed">
        {RESPONSIBLE_NAME} (en adelante, &quot;el Responsable&quot;) trata los
        datos personales de los usuarios de &quot;Entrenador IA&quot; conforme
        al Reglamento (UE) 2016/679 (RGPD) y a la Ley Orgánica 3/2018
        (LOPDGDD).
      </p>

      <h2 className="mt-8 text-lg font-semibold">1. Responsable del tratamiento</h2>
      <ul className="mt-3 list-disc space-y-1 pl-6">
        <li>
          <strong>Responsable:</strong> Pedro Rendo Quindós (proyecto personal
          sin ánimo de lucro).
        </li>
        <li>
          <strong>Contacto y ejercicio de derechos:</strong>{" "}
          <a
            href={`mailto:${CONTACT_EMAIL}`}
            className="font-medium underline underline-offset-2"
          >
            {CONTACT_EMAIL}
          </a>
        </li>
      </ul>

      <h2 className="mt-8 text-lg font-semibold">2. Qué datos tratamos</h2>
      <h3 className="mt-6 font-semibold">Datos que facilitas al registrarte</h3>
      <ul className="mt-3 list-disc space-y-1 pl-6">
        <li>
          <strong>Nombre de usuario</strong> (obligatorio): identificación y acceso.
        </li>
        <li>
          <strong>Nombre y apellidos</strong> (obligatorio): personalización de la
          experiencia y de los informes.
        </li>
        <li>
          <strong>Nick online Chess.com/Lichess</strong> (opcional): importar tus
          partidas públicas desde Lichess.
        </li>
        <li>
          <strong>ELO actual y objetivo</strong>: calibrar el entrenamiento y los
          informes del coach.
        </li>
        <li>
          <strong>Contraseña</strong>: se almacena cifrada con bcrypt; nunca en
          texto claro ni recuperable.
        </li>
      </ul>
      <p className="mt-3 leading-relaxed">
        No solicitamos dirección postal, teléfono, documentos de identidad ni
        datos especialmente protegidos. No recogemos cookies de seguimiento ni
        direcciones IP con fines analíticos.
      </p>

      <h3 className="mt-6 font-semibold">Datos generados por tu uso</h3>
      <ul className="mt-3 list-disc space-y-1 pl-6">
        <li>
          Partidas que subes en PGN (incluyen los nombres de jugadores que
          figuren en el propio archivo).
        </li>
        <li>Errores detectados en tus partidas (jugadas, evaluaciones, temas tácticos).</li>
        <li>Consultas escritas al Gran Maestro virtual y sus respuestas.</li>
        <li>Informes de rendimiento generados por IA sobre tu juego.</li>
        <li>Progreso de entrenamiento (tareas semanales, lecciones de finales).</li>
      </ul>

      <h2 className="mt-8 text-lg font-semibold">
        3. Finalidades y bases jurídicas (art. 6 RGPD)
      </h2>
      <ul className="mt-3 list-disc space-y-1 pl-6">
        <li>
          <strong>Gestión de cuenta y autenticación:</strong> ejecución de la
          relación contractual (art. 6.1.b).
        </li>
        <li>
          <strong>Análisis de partidas e informes de entrenamiento:</strong>{" "}
          ejecución de la relación contractual (art. 6.1.b).
        </li>
        <li>
          <strong>Envío de contenido a Google Gemini para su análisis por IA:</strong>{" "}
          tu consentimiento expreso, otorgado al aceptar esta política en el
          registro (art. 6.1.a) y renovable en cada uso de la función.
        </li>
        <li>
          <strong>Descarga de partidas públicas desde Lichess con tu nick:</strong>{" "}
          consentimiento (dato opcional).
        </li>
      </ul>
      <p className="mt-3 leading-relaxed">
        Puedes retirar el consentimiento en cualquier momento sin efectos
        retroactivos, escribiendo a{" "}
        <a
          href={`mailto:${CONTACT_EMAIL}`}
          className="font-medium underline underline-offset-2"
        >
          {CONTACT_EMAIL}
        </a>{" "}
        o eliminando tu cuenta desde &quot;Mi perfil&quot;.
      </p>

      <h2 className="mt-8 text-lg font-semibold">
        4. Decisiones automatizadas e inteligencia artificial
      </h2>
      <p className="mt-3 leading-relaxed">
        El servicio usa IA generativa (Google Gemini) y el motor Stockfish para
        generar informes formativos sobre partidas: detección de errores,
        patrones y planes de mejora. Estos informes no producen efectos
        jurídicos ni te afectan significativamente (art. 22 RGPD): se limitan
        al ámbito lúdico-formativo, puedes consultarlos, ignorarlos o pedir su
        borrado. Conforme a los términos vigentes de Gemini API, Google no usa
        el contenido enviado por API para entrenar sus modelos.
      </p>

      <h2 className="mt-8 text-lg font-semibold">
        5. Destinatarios y encargados del tratamiento
      </h2>
      <p className="mt-3 leading-relaxed">
        No se ceden datos personales a terceros con fines comerciales:
      </p>
      <ul className="mt-3 list-disc space-y-1 pl-6">
        <li>
          <strong>Google (Gemini API)</strong>: analiza el contenido de PGNs y
          consultas que tú envías para su análisis. Sede UE/EE.UU., amparado en
          el Marco de Privacidad de Datos UE-EE.UU.
        </li>
        <li>
          <strong>Vercel Inc.</strong>: aloja el frontend estático; solo maneja
          registros técnicos breves de la CDN (IP, user-agent). Certificada en
          el mismo marco.
        </li>
        <li>
          <strong>ngrok Inc.</strong>: provee el túnel cifrado hacia el servidor
          del titular; trata metadatos técnicos de conexión.
        </li>
        <li>
          <strong>Lichess.org</strong>: recibe únicamente peticiones públicas de
          descarga de partidas por nick; no datos personales de tu cuenta.
        </li>
      </ul>
      <p className="mt-3 leading-relaxed">
        La base de datos con tus partidas y perfil reside íntegramente en el
        equipo local del Responsable: no se almacena en ninguna nube distinta de
        las indicadas.
      </p>

      <h2 className="mt-8 text-lg font-semibold">6. Conservación</h2>
      <p className="mt-3 leading-relaxed">
        Conservamos tus datos mientras tu cuenta esté activa. Al eliminarla se
        borran definitivamente e inmediatamente todos tus datos (perfil,
        partidas, errores, informes, consultas, tareas y progreso), sin perjuicio
        del ciclo de copias de seguridad locales del sistema (máximo 30 días).
      </p>

      <h2 className="mt-8 text-lg font-semibold">7. Tus derechos</h2>
      <p className="mt-3 leading-relaxed">
        Puedes ejercer en cualquier momento el acceso (art. 15), rectificación
        (art. 16), supresión (art. 17), limitación (art. 18), portabilidad
        (art. 20), oposición (art. 21) y a no ser objeto de decisiones
        automatizadas (art. 22):
      </p>
      <ul className="mt-3 list-disc space-y-1 pl-6">
        <li>
          <strong>Exportar tus datos (portabilidad):</strong> botón
          &quot;Exportar mis datos&quot; en Mi perfil — descarga un JSON con todo
          lo asociado a tu cuenta.
        </li>
        <li>
          <strong>Eliminar tu cuenta (supresión):</strong> botón
          &quot;Eliminar mi cuenta&quot; en Mi perfil — borrado inmediato y
          definitivo.
        </li>
        <li>
          También puedes escribir a{" "}
          <a
            href={`mailto:${CONTACT_EMAIL}`}
            className="font-medium underline underline-offset-2"
          >
            {CONTACT_EMAIL}
          </a>{" "}
          desde la dirección o con el usuario asociado a tu cuenta;
          responderemos en el plazo máximo legal de un mes.
        </li>
        <li>
          Puedes reclamar ante la Agencia Española de Protección de Datos
          (www.aepd.es) si consideras vulnerados tus derechos.
        </li>
      </ul>

      <h2 className="mt-8 text-lg font-semibold">8. Seguridad</h2>
      <p className="mt-3 leading-relaxed">
        Contraseñas con hash bcrypt; comunicaciones cifradas HTTPS/TLS de
        extremo a extremo; base de datos en equipo físico bajo control del
        Responsable sin exposición directa a Internet; recogida mínima de
        datos. Recomendamos usar una contraseña única y no compartirla.
      </p>

      <h2 className="mt-8 text-lg font-semibold">9. Menores de edad</h2>
      <p className="mt-3 leading-relaxed">
        El servicio no está dirigido a menores de 14 años (edad mínima de
        consentimiento en España, art. 7 LOPDGDD). Al marcar la casilla de
        aceptación declaras tener al menos 14 años o contar, siendo menor, con
        autorización de tus padres o tutores legales.
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
