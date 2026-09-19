import { createFileRoute, Link } from "@tanstack/react-router";
import BrandMark from "@/components/BrandMark";
import { useTranslation } from "@/hooks/useTranslation";
import type { Language } from "@/stores/uiSlice";

// Public privacy policy (also the "data deletion instructions" URL Meta asks for:
// /privacy#data-deletion). Every string goes through t() like the rest of the
// app; the Spanish text is the key in public/locales/*.json.

// Where privacy and deletion requests go. Must be set before this URL is given
// to Meta or to customers.
const PRIVACY_CONTACT_EMAIL: string = "";

// Bump when the text changes (month is 0-based).
const LAST_UPDATED = new Date(2026, 8, 19);

const LANGUAGES: Record<Language, string> = {
  es: "Español",
  en: "English",
  pt: "Português",
  fr: "Français",
  sw: "Kiswahili",
};

export const Route = createFileRoute("/privacy")({
  component: PrivacyPolicy,
});

function PrivacyPolicy() {
  const {
    translate: t,
    currentLanguage,
    setCurrentLanguage,
  } = useTranslation();

  const updated = new Intl.DateTimeFormat(currentLanguage, {
    dateStyle: "long",
  }).format(LAST_UPDATED);

  return (
    <div className="h-dvh overflow-y-auto bg-background text-foreground">
      <header className="flex items-center justify-between gap-4 px-5 py-4 border-b border-border">
        <Link to="/" aria-label={t("Ir a DropChat")}>
          <BrandMark size={22} />
        </Link>
        <select
          aria-label={t("Idioma")}
          className="w-auto border border-input rounded-full px-3 py-1 text-[14px] bg-card"
          value={currentLanguage}
          onChange={(e) => void setCurrentLanguage(e.target.value as Language)}
        >
          {(Object.keys(LANGUAGES) as Language[]).map((lang) => (
            <option key={lang} value={lang}>
              {LANGUAGES[lang]}
            </option>
          ))}
        </select>
      </header>

      <main className="mx-auto max-w-[720px] px-5 py-10 flex flex-col gap-8 text-[16px] leading-relaxed text-secondary-foreground">
        <div className="flex flex-col gap-3">
          <h1 className="text-[34px] leading-tight font-extrabold text-foreground">
            {t("Política de privacidad")}
          </h1>
          <p className="text-[14px] text-muted-foreground">
            {t("Última actualización:")} {updated}
          </p>
          <p>
            {t(
              "Esta política explica qué datos personales trata DropChat, para qué los usamos, con quién los compartimos y qué derechos tienes. Aplica a nuestra plataforma web, a nuestra API y a las conversaciones de WhatsApp que las tiendas gestionan con DropChat.",
            )}
          </p>
        </div>

        <section id="who" className="scroll-mt-6 flex flex-col gap-3">
          <h2 className="text-[20px] font-bold text-foreground">
            {t("Quiénes somos")}
          </h2>
          <p>
            {t(
              "DropChat es una plataforma que ayuda a tiendas online a confirmar pedidos contra entrega y a mantener informados a sus clientes por WhatsApp.",
            )}
          </p>
        </section>
        <section id="roles" className="scroll-mt-6 flex flex-col gap-3">
          <h2 className="text-[20px] font-bold text-foreground">
            {t("Dos tipos de personas, dos roles")}
          </h2>
          <ul className="list-disc pl-5 flex flex-col gap-2">
            <li>
              {t(
                "Usuarios de la plataforma: dueños y equipos de las tiendas que crean una cuenta en DropChat. Para sus datos, DropChat es el responsable del tratamiento.",
              )}
            </li>
            <li>
              {t(
                "Clientes de las tiendas: personas que conversan por WhatsApp con una tienda que usa DropChat. Para sus datos, la tienda es la responsable y DropChat actúa como encargado del tratamiento, siguiendo las instrucciones de la tienda.",
              )}
            </li>
          </ul>
        </section>
        <section id="data" className="scroll-mt-6 flex flex-col gap-3">
          <h2 className="text-[20px] font-bold text-foreground">
            {t("Qué datos tratamos")}
          </h2>
          <ul className="list-disc pl-5 flex flex-col gap-2">
            <li>
              {t(
                "Datos de cuenta: nombre, correo electrónico y foto de perfil que entrega Google o GitHub al iniciar sesión, además de tu organización y tu rol en ella.",
              )}
            </li>
            <li>
              {t(
                "Conversaciones: número de teléfono, nombre de perfil de WhatsApp, contenido de los mensajes, archivos adjuntos y estados de entrega y lectura.",
              )}
            </li>
            <li>
              {t(
                "Datos de pedidos: número de pedido, productos, monto a pagar y dirección de despacho, cuando la tienda los carga o los conecta desde su plataforma de venta.",
              )}
            </li>
            <li>
              {t(
                "Datos técnicos: registros de acceso y de funcionamiento, dirección IP y datos del navegador, que usamos para seguridad y diagnóstico.",
              )}
            </li>
          </ul>
        </section>
        <section id="use" className="scroll-mt-6 flex flex-col gap-3">
          <h2 className="text-[20px] font-bold text-foreground">
            {t("Para qué los usamos")}
          </h2>
          <ul className="list-disc pl-5 flex flex-col gap-2">
            <li>
              {t(
                "Prestar el servicio: enviar y recibir mensajes de WhatsApp, confirmar pedidos y avisar cada cambio de estado.",
              )}
            </li>
            <li>
              {t(
                "Responder con inteligencia artificial cuando la tienda activa un agente. La IA lee la conversación para responder dudas y extraer datos, pero no confirma, cancela ni modifica pedidos por sí sola.",
              )}
            </li>
            <li>
              {t(
                "Mantener la seguridad de la plataforma, prevenir abusos y dar soporte.",
              )}
            </li>
            <li>{t("Cobrar el servicio y cumplir obligaciones legales.")}</li>
          </ul>
          <p>
            {t("No vendemos datos personales ni los usamos para publicidad.")}
          </p>
        </section>
        <section id="sharing" className="scroll-mt-6 flex flex-col gap-3">
          <h2 className="text-[20px] font-bold text-foreground">
            {t("Con quién los compartimos")}
          </h2>
          <p>
            {t(
              "Solo con los proveedores que necesitamos para prestar el servicio, bajo contratos que los obligan a proteger los datos:",
            )}
          </p>
          <ul className="list-disc pl-5 flex flex-col gap-2">
            <li>
              {t(
                "Meta Platforms, para enviar y recibir mensajes a través de la plataforma de WhatsApp Business.",
              )}
            </li>
            <li>
              {t(
                "Supabase, que aloja nuestra base de datos, archivos y funciones en servidores ubicados en São Paulo, Brasil.",
              )}
            </li>
            <li>{t("Cloudflare, que publica nuestro sitio web.")}</li>
            <li>
              {t(
                "Proveedores de modelos de inteligencia artificial, solo cuando la tienda activa un agente con IA.",
              )}
            </li>
            <li>
              {t("Google y GitHub, cuando eliges iniciar sesión con ellos.")}
            </li>
          </ul>
          <p>
            {t(
              "Algunos de estos proveedores tratan datos fuera de Chile. En esos casos exigimos medidas de protección equivalentes a las de esta política. También podemos entregar datos cuando una ley o una autoridad competente lo exija.",
            )}
          </p>
        </section>
        <section id="retention" className="scroll-mt-6 flex flex-col gap-3">
          <h2 className="text-[20px] font-bold text-foreground">
            {t("Cuánto tiempo los guardamos")}
          </h2>
          <ul className="list-disc pl-5 flex flex-col gap-2">
            <li>{t("Mientras tu cuenta y tu organización estén activas.")}</li>
            <li>
              {t(
                "Si eliminas tu organización, sus datos se borran de nuestra base de datos de inmediato y sus archivos adjuntos en un plazo máximo de una hora.",
              )}
            </li>
            <li>
              {t(
                "Los registros técnicos se eliminan automáticamente a los 90 días.",
              )}
            </li>
            <li>
              {t(
                "Meta conserva sus propias copias de los mensajes de WhatsApp según sus políticas.",
              )}
            </li>
          </ul>
        </section>
        <section id="security" className="scroll-mt-6 flex flex-col gap-3">
          <h2 className="text-[20px] font-bold text-foreground">
            {t("Cómo los protegemos")}
          </h2>
          <p>
            {t(
              "Toda la comunicación viaja cifrada con HTTPS. Cada organización solo puede acceder a sus propios datos gracias a reglas de acceso en la base de datos, y las credenciales de las integraciones se guardan con acceso restringido.",
            )}
          </p>
        </section>
        <section id="rights" className="scroll-mt-6 flex flex-col gap-3">
          <h2 className="text-[20px] font-bold text-foreground">
            {t("Tus derechos")}
          </h2>
          <p>
            {t(
              "De acuerdo con la legislación chilena de protección de datos personales (Ley N° 19.628 y sus modificaciones), puedes pedir acceso, rectificación, supresión y oposición al tratamiento de tus datos y, cuando corresponda, su portabilidad y bloqueo.",
            )}
          </p>
          <ul className="list-disc pl-5 flex flex-col gap-2">
            <li>
              {t(
                "Si eres usuario de la plataforma, puedes exportar los datos de tu organización desde Preferencias, Organización, Exportar datos, o escribirnos.",
              )}
            </li>
            <li>
              {t(
                "Si eres cliente de una tienda, dirige tu solicitud a la tienda con la que conversaste. Si nos escribes a nosotros, se la haremos llegar y la ayudaremos a responder.",
              )}
            </li>
            <li>
              {t(
                "Respondemos las solicitudes dentro de los plazos que fija la ley.",
              )}
            </li>
          </ul>
        </section>
        <section id="data-deletion" className="scroll-mt-6 flex flex-col gap-3">
          <h2 className="text-[20px] font-bold text-foreground">
            {t("Eliminación de datos")}
          </h2>
          <ul className="list-disc pl-5 flex flex-col gap-2">
            <li>
              {t(
                "El propietario de una organización puede eliminarla, con todos sus datos, desde Preferencias, Organización, Eliminar. La eliminación es inmediata y no se puede deshacer.",
              )}
            </li>
            <li>
              {t(
                "También puedes pedir que eliminemos tus datos escribiendo al correo de contacto de esta página. Indica el correo de tu cuenta o el número de WhatsApp que usaste.",
              )}
            </li>
            <li>
              {t(
                "Si conversaste con una tienda por WhatsApp, puedes pedir la eliminación de tus mensajes a esa tienda o a nosotros.",
              )}
            </li>
          </ul>
        </section>
        <section id="minors" className="scroll-mt-6 flex flex-col gap-3">
          <h2 className="text-[20px] font-bold text-foreground">
            {t("Menores de edad")}
          </h2>
          <p>
            {t(
              "DropChat no está dirigido a menores de 18 años y no recopilamos a sabiendas sus datos como usuarios de la plataforma.",
            )}
          </p>
        </section>
        <section id="changes" className="scroll-mt-6 flex flex-col gap-3">
          <h2 className="text-[20px] font-bold text-foreground">
            {t("Cambios a esta política")}
          </h2>
          <p>
            {t(
              "Si hacemos cambios importantes, actualizaremos la fecha de esta página y avisaremos a los usuarios de la plataforma por correo o dentro de la app.",
            )}
          </p>
        </section>
        <section id="contact" className="scroll-mt-6 flex flex-col gap-3">
          <h2 className="text-[20px] font-bold text-foreground">
            {t("Contacto")}
          </h2>
          <p>
            {t(
              "Para cualquier consulta sobre privacidad o para ejercer tus derechos, escríbenos a:",
            )}
          </p>
          <p>
            {PRIVACY_CONTACT_EMAIL ? (
              <a
                className="text-primary underline"
                href={`mailto:${PRIVACY_CONTACT_EMAIL}`}
              >
                {PRIVACY_CONTACT_EMAIL}
              </a>
            ) : (
              <span className="font-semibold">
                {t("Correo de contacto por definir")}
              </span>
            )}
          </p>
        </section>
      </main>
    </div>
  );
}
