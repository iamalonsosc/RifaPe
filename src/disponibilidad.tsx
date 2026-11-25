import { TarjetaPago, metodoDe, mensajeMetodo } from "./metodo-pago";
import { useEffect, useRef, useState } from "react";
import { Globe, Ticket as Icono, Gift, Info } from "lucide-react";
import { db, rpc, soles, fecha, numero, type Rifa, type Ticket } from "./datos";
import { CatalogoPremios } from "./catalogo-premios";
import { copiarTexto, copiarMensaje, enlaceWhatsApp } from "./whatsapp";

const opciones = [
  ["mostrar_foto_publica", "p_foto", "Mostrar fotografía de la rifa"],
  ["mostrar_precio_publico", "p_precio", "Mostrar precio por número"],
  ["mostrar_fecha_publica", "p_fecha", "Mostrar fecha y hora del sorteo"],
  ["mostrar_premios_publicos", "p_premios", "Mostrar premios"],
] as const;
export function ConfiguracionPublica({
  r,
  cantidad,
  recargar,
}: {
  r: Rifa;
  cantidad: number;
  recargar: () => void;
}) {
  const [ocupado, guardarOcupado] = useState(false);
  const [aviso, avisar] = useState("");
  const url = new URL(
    "/disponibilidad/" + r.token_disponibilidad,
    location.origin,
  ).href;
  const mensaje = [
    "🎟️ ¡Consulta nuestra rifa!",
    "Rifa: " + r.nombre,
    r.mostrar_precio_publico &&
      "💰 Precio por número: " +
        soles(
          r.estado === "en_sorteo" && r.ventas_abiertas
            ? (r.precio_en_vivo ?? r.precio_numero)
            : r.precio_numero,
        ),
    r.mostrar_fecha_publica &&
      "📅 Fecha del sorteo: " + fecha(r.fecha_sorteo) + " (Perú)",
    "Consulta los números" +
      (r.mostrar_premios_publicos ? " y los premios" : "") +
      " en el siguiente enlace:",
    url,
    !["terminada","anulada"].includes(r.estado) && mensajeMetodo(metodoDe(r)),
    !["terminada","anulada"].includes(r.estado) && "Para adquirir tus números, comunícate directamente con nosotros.",
  ]
    .filter(Boolean)
    .join("\n\n");
  async function cambiar(campo: string, valor: boolean) {
    guardarOcupado(true);
    try {
      await rpc("configurar_disponibilidad", {
        p_rifa: r.id_rifa,
        [campo]: valor,
      });
      avisar(
        campo === "p_regenerar"
          ? "Se generó un nuevo enlace."
          : "Configuración guardada.",
      );
      recargar();
    } catch {
      avisar("No se pudo guardar la configuración. Vuelve a intentarlo.");
    } finally {
      guardarOcupado(false);
    }
  }
  return (
    <section className="config-publica">
      <div className="fila">
        <h2>
          <Globe size={20} /> Disponibilidad pública
        </h2>
        <strong className={r.disponibilidad_habilitada ? "activo-publico" : ""}>
          {r.disponibilidad_habilitada ? "Habilitado" : "Deshabilitado"}
        </strong>
      </div>
      <p>Comparte la disponibilidad de tu rifa.</p>
      <fieldset disabled={ocupado}>
        <label className="interruptor">
          <input
            type="checkbox"
            checked={!!r.disponibilidad_habilitada}
            onChange={(e) => void cambiar("p_habilitada", e.target.checked)}
          />{" "}
          Habilitar enlace público
        </label>
        <h3>Información visible</h3>
        {opciones.map(([campo, parametro, titulo]) => (
          <label className="interruptor" key={campo}>
            <input
              type="checkbox"
              checked={!!r[campo]}
              onChange={(e) => void cambiar(parametro, e.target.checked)}
            />{" "}
            {titulo}
          </label>
        ))}
        {r.mostrar_premios_publicos && (
          <p>
            <Gift size={16} /> {cantidad}{" "}
            {cantidad === 1 ? "premio visible" : "premios visibles"}
          </p>
        )}
        {r.disponibilidad_habilitada && (
          <div className="acciones-publicas">
            <h3>Enlace público de la rifa</h3>
            <p>{url}</p>
            <button
              type="button"
              onClick={async () => {
                try {
                  await copiarTexto(url);
                  avisar("Enlace copiado.");
                } catch {
                  avisar("Copia el enlace que aparece arriba.");
                }
              }}
            >
              Copiar enlace
            </button>
            <a
              className="boton-evento"
              href={url}
              target="_blank"
              rel="noreferrer"
            >
              Vista previa
            </a>
            <a
              className="boton-evento"
              href={enlaceWhatsApp(mensaje)}
              target="_blank"
              rel="noreferrer"
            >
              Compartir por WhatsApp
            </a>
            <button onClick={() => void copiarMensaje(mensaje, avisar)}>
              Copiar mensaje
            </button>
          </div>
        )}
        <button
          type="button"
          onClick={() => {
            if (
              confirm(
                "¿Estás seguro de generar un nuevo enlace? Las personas que tengan el enlace anterior ya no podrán consultar la disponibilidad",
              )
            )
              void cambiar("p_regenerar", true);
          }}
        >
          Regenerar enlace
        </button>
      </fieldset>
      <span role="status">{aviso}</span>
    </section>
  );
}

interface Consulta {
  metodo_pago?: Ticket["metodo_pago"];
  nombre: string;
  estado: string;
  foto?: string;
  precio?: number;
  fecha?: string;
  numeros?: number[];
  reservados?: number[];
  comprados_emitidos?: number[];
  premios?: Ticket["premios_publicos"];
}
const porPagina = 150;
const clasesNumero = {
  Disponible: "libre",
  Reservado: "ocupado",
  "Comprado o emitido": "comprado",
  "No disponible": "cerrado",
};
export function Disponibilidad({ token }: { token: string }) {
  const [datos, mostrar] = useState<Consulta | null>(null);
  const [estado, cambiarEstado] = useState<
    "cargando" | "vigente" | "invalido" | "error"
  >("cargando");
  const [ultima, actualizarHora] = useState("");
  const [tema, elegirTema] = useState(
    () =>
      localStorage.getItem("temaDisponibilidad") ||
      localStorage.getItem("tema") ||
      (matchMedia("(prefers-color-scheme: dark)").matches ? "oscuro" : "claro"),
  );
  useEffect(() => {
    document.documentElement.dataset.tema = tema;
  }, [tema]);
  const [busqueda, buscar] = useState("");
  const [solo, filtrar] = useState(false);
  const [pagina, paginar] = useState(0);
  const [expandido, expandir] = useState(false);
  const reintentar = useRef<() => void>(() => {});
  useEffect(() => {
    document.title = "Disponibilidad pública · RifaPes";
    const meta = document.createElement("meta");
    meta.name = "robots";
    meta.content = "noindex, nofollow";
    document.head.append(meta);
    let vivo = true,
      pendiente = false,
      fin = false;
    let timer: ReturnType<typeof setTimeout>;
    async function consultar() {
      clearTimeout(timer);
      if (document.hidden || pendiente || fin || !vivo) return;
      pendiente = true;
      try {
        const valido = /^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/i.test(
          token,
        );
        if (valido && !db) throw Error();
        const respuesta = valido
          ? await db!.functions.invoke<Consulta>("consultar-disponibilidad", {
              body: { token },
              timeout: 15000,
            })
          : null;
        if (!vivo) return;
        if (
          !respuesta ||
          respuesta.error?.context?.status === 404 ||
          respuesta.error?.context?.status === 400
        ) {
          mostrar(null);
          cambiarEstado("invalido");
          fin = !valido;
          return;
        }
        if (respuesta.error || !respuesta.data) throw Error();
        mostrar(respuesta.data);
        cambiarEstado("vigente");
        actualizarHora(
          new Intl.DateTimeFormat("es-PE", {
            timeStyle: "medium",
            timeZone: "America/Lima",
          }).format(new Date()),
        );
      } catch {
        if (vivo) cambiarEstado("error");
      } finally {
        pendiente = false;
        if (vivo && !document.hidden && !fin)
          timer = setTimeout(consultar, 10000);
      }
    }
    reintentar.current = consultar;
    document.addEventListener("visibilitychange", consultar);
    void consultar();
    return () => {
      vivo = false;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", consultar);
      meta.remove();
    };
  }, [token]);
  const numeros = datos?.numeros ?? [];
  const reservados = new Set(datos?.reservados);
  const comprados = new Set(datos?.comprados_emitidos);
  function estadoNumero(n: number) {
    if (n > 0) return "Disponible";
    if (comprados.has(-n)) return "Comprado o emitido";
    if (reservados.has(-n)) return "Reservado";
    return "No disponible";
  }
  const libres = numeros.filter((n) => n > 0).length,
    ocupados = numeros.length - libres;
  const porcentaje = numeros.length
    ? Math.round((ocupados / numeros.length) * 100)
    : 0;
  const texto = busqueda.trim();
  const resultado = numeros.filter(
    (n) =>
      (!solo || n > 0) &&
      (!texto || (/^\d+$/.test(texto) && Math.abs(n) === Number(texto))),
  );
  const paginas = Math.ceil(resultado.length / porPagina);
  const actual = Math.min(pagina, Math.max(0, paginas - 1));
  return (
    <main className="publico disponibilidad">
      <header>
        <strong className="marca">
          <Icono /> RifaPes
        </strong>
        <button
          onClick={() => {
            const siguiente = tema === "oscuro" ? "claro" : "oscuro";
            localStorage.setItem("temaDisponibilidad", siguiente);
            elegirTema(siguiente);
          }}
        >
          Usar tema {tema === "oscuro" ? "claro" : "oscuro"}
        </button>
        {datos && (
          <span className="etiqueta-rifa">
            Rifa {datos.estado.replace("_", " ")}
          </span>
        )}
      </header>
      {estado === "invalido" && (
        <h1>Este enlace ya no se encuentra disponible</h1>
      )}
      {estado === "cargando" && (
        <p role="status">Consultando disponibilidad…</p>
      )}
      {estado === "error" && (
        <div role="alert">
          <p>
            No se pudo actualizar la disponibilidad.{" "}
            {datos && "Los datos mostrados podrían estar desactualizados."}
          </p>
          <button onClick={() => reintentar.current()}>Reintentar</button>
        </div>
      )}
      {datos && (
        <>
          {datos.foto && (
            <img className="portada-rifa" src={datos.foto} alt={datos.nombre} />
          )}
          <div className="cabecera-rifa">
            <h1>{datos.nombre}</h1>
            {datos.fecha && <p>{fecha(datos.fecha)} · Hora de Perú</p>}
            {datos.precio !== undefined && (
              <p>
                Precio por número <strong>{soles(datos.precio)}</strong>
              </p>
            )}
          </div>
          {datos.estado === "terminada" ? (
            <p>Esta rifa ha finalizado. Gracias por tu interés</p>
          ) : datos.estado === "anulada" ? (
            <p>Esta rifa ha sido cancelada y ya no se encuentra disponible</p>
          ) : (
            <>
              <TarjetaPago metodo={datos.metodo_pago} copiar />
              <div className="cifras-publicas">
                {[
                  [numeros.length, "Total"],
                  [libres, "Disponibles"],
                  [ocupados, "Ocupados"],
                ].map(([valor, titulo]) => (
                  <div key={titulo}>
                    <strong>{valor}</strong>
                    <small>{titulo}</small>
                  </div>
                ))}
              </div>
              <label className="progreso-publico">
                Progreso de ocupación · {porcentaje}%
                <progress value={ocupados} max={numeros.length || 1} />
              </label>
              {!libres && (
                <p>
                  {datos.estado === "en_sorteo"
                    ? "No hay números disponibles durante el sorteo."
                    : "Todos los números de esta rifa se encuentran ocupados"}
                </p>
              )}
              <section>
                <h2>Consulta de números</h2>
                <input
                  type="search"
                  aria-label="Buscar número"
                  placeholder="Buscar número, ej. 007"
                  value={busqueda}
                  onChange={(e) => {
                    buscar(e.target.value);
                    paginar(0);
                  }}
                />
                <label className="interruptor">
                  <input
                    type="checkbox"
                    checked={solo}
                    onChange={(e) => {
                      filtrar(e.target.checked);
                      paginar(0);
                    }}
                  />{" "}
                  Mostrar solo números disponibles
                </label>
                <p className="leyenda-publica">
                  <span>Disponible</span>
                  {datos.reservados && <span>Reservado</span>}
                  {datos.comprados_emitidos && (
                    <span className="comprado">Comprado o emitido</span>
                  )}
                  {ocupados > reservados.size + comprados.size && (
                    <span className="cerrado">No disponible</span>
                  )}
                </p>
                <div className="numeros-publicos">
                  {resultado
                    .slice(actual * porPagina, (actual + 1) * porPagina)
                    .map((n) => {
                      const estado = estadoNumero(n);
                      return (
                        <span
                          key={Math.abs(n)}
                          className={clasesNumero[estado]}
                          title={estado}
                          aria-label={numero(Math.abs(n)) + " · " + estado}
                        >
                          {numero(Math.abs(n))}
                        </span>
                      );
                    })}
                </div>
                {!resultado.length && (
                  <p>No encontramos números que coincidan con tu búsqueda.</p>
                )}
                {paginas > 1 && (
                  <div className="fila">
                    <button
                      disabled={!actual}
                      onClick={() => paginar(actual - 1)}
                    >
                      Anterior
                    </button>
                    <span>
                      Página {actual + 1} de {paginas}
                    </span>
                    <button
                      disabled={actual + 1 === paginas}
                      onClick={() => paginar(actual + 1)}
                    >
                      Siguiente
                    </button>
                  </div>
                )}
              </section>
            </>
          )}
          <small>Última actualización: {ultima} · Hora de Perú</small>
          {datos.premios && (
            <section>
              <h2>
                <Gift size={20} /> Premios de la rifa
              </h2>
              {datos.premios.length ? (
                <>
                  <p>
                    {datos.premios.length}{" "}
                    {datos.premios.length === 1
                      ? "premio por sortear"
                      : "premios por sortear"}
                  </p>
                  <CatalogoPremios
                    premios={
                      expandido ? datos.premios : datos.premios.slice(0, 3)
                    }
                  />
                  {datos.premios.length > 3 && (
                    <button
                      aria-expanded={expandido}
                      onClick={() => expandir(!expandido)}
                    >
                      {expandido
                        ? "Ver menos premios"
                        : "Ver los " + datos.premios.length + " premios"}
                    </button>
                  )}
                </>
              ) : (
                <p>Los premios de esta rifa serán anunciados próximamente</p>
              )}
            </section>
          )}
          <footer>
            <Info size={18} />
            <strong>Consulta exclusivamente informativa</strong>
            {!["terminada","anulada"].includes(datos.estado) && <p>
              Para adquirir un número, comunícate directamente con el
              organizador de la rifa.
            </p>}
            <small>Gestionado con RifaPes</small>
          </footer>
        </>
      )}
    </main>
  );
}
