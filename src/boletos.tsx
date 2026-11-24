import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import QRCode from "qrcode";
import { Campo, Formulario, Accion } from "./controles";
import {
  db,
  campo,
  filas,
  rpc,
  type Persona,
  type Premio,
  numero,
  imagen,
  type Ticket,
  type Boleto,
  type Rifa,
  type Fila,
  type Visual,
} from "./datos";
function informacionRifa(r: Rifa, premios: Premio[]) {
  const lista = premios
    .filter((p) => p.prioridad != null)
    .sort((a, b) => a.prioridad! - b.prioridad!);
  return {
    rifa: r.nombre,
    fecha: r.fecha_sorteo,
    imagen: r.imagen_premio_url,
    destacados: lista.map((p) =>
      p.es_sorpresa ? "Premio sorpresa" : p.nombre,
    ),
    fotos_destacadas: lista.map((p) =>
      p.es_sorpresa ? "/regalo-sorpresa.svg" : p.imagen_url,
    ),
    mas_premios: premios.length > lista.length,
  };
}
const fechaBoleto = new Intl.DateTimeFormat("es-PE", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Lima",
});
function usuarioTikTok(valor: string) {
  const perfil = valor
    .trim()
    .match(
      /^(?:https?:\/\/(?:www\.|m\.)?tiktok\.com\/@([\w.]+)\/?(?:[?#][^\s]*)?|@?([\w.]+))$/i,
    );
  if (!perfil)
    throw Error("Escribe el usuario de TikTok o pega el enlace a su perfil.");
  return perfil[1] || perfil[2];
}

// El lienzo se exporta a tamaño completo y la vista se adapta a la pantalla.
function VistaEscalada({
  children,
  ancho = 900,
}: {
  children: ReactNode;
  ancho?: number;
}) {
  const marco = useRef<HTMLDivElement>(null),
    contenido = useRef<HTMLDivElement>(null);
  const [medida, medir] = useState({ escala: 1, alto: 0 });
  useLayoutEffect(() => {
    const caja = marco.current!,
      interior = contenido.current!;
    function ajustar() {
      const escala = Math.min(1, caja.clientWidth / ancho);
      medir({ escala, alto: Math.ceil(interior.offsetHeight * escala) });
    }
    ajustar();
    const observador = new ResizeObserver(ajustar);
    observador.observe(caja);
    observador.observe(interior);
    return () => observador.disconnect();
  }, [ancho]);
  return (
    <div
      ref={marco}
      style={{
        maxWidth: ancho,
        width: "100%",
        height: medida.alto,
        overflow: "hidden",
      }}
    >
      <div
        ref={contenido}
        style={{
          width: ancho,
          transformOrigin: "top left",
          transform: "scale(" + medida.escala + ")",
        }}
      >
        {children}
      </div>
    </div>
  );
}
function PremiosBoleto({ b }: { b: Ticket }) {
  const caja = useRef<HTMLDivElement>(null);
  const [cantidad, limitar] = useState(0);
  useLayoutEffect(() => {
    const root = caja.current!;
    const lista = root.querySelector("ol")!;
    const aviso = root.querySelector<HTMLElement>(".aviso-premios")!;
    function medir() {
      const filas = Array.from(lista.children) as HTMLElement[];
      const margen = parseFloat(getComputedStyle(lista).rowGap) || 0;
      const libre = root.clientHeight - lista.offsetTop;
      const alturas = filas.map((f) => f.offsetHeight);
      const total = alturas.reduce((s, h, i) => s + h + (i ? margen : 0), 0);
      const limite =
        libre -
        (b.mas_premios || total > libre ? aviso.offsetHeight + margen : 0);
      let usados = 0,
        visibles = 0;
      for (const alto of alturas) {
        usados += alto + (visibles ? margen : 0);
        if (usados > limite) break;
        visibles++;
      }
      limitar(visibles);
    }
    medir();
    const obs = new ResizeObserver(medir);
    obs.observe(root);
    obs.observe(lista);
    obs.observe(aviso);
    return () => obs.disconnect();
  }, [b]);
  const premios = b.destacados ?? [];
  return (
    <div ref={caja} className="premios-boleto">
      {!!premios.length && <small>Premios destacados</small>}
      <ol>
        {premios.map((nombre, i) => (
          <li
            key={i}
            style={{ visibility: i < cantidad ? "visible" : "hidden" }}
          >
            {b.plantilla.mostrar_fotos_premios !== false &&
              (b.fotos_destacadas?.[i] || nombre === "Premio sorpresa") &&
              (i < cantidad ? (
                <img
                  className="producto-boleto"
                  crossOrigin="anonymous"
                  src={b.fotos_destacadas?.[i] || "/regalo-sorpresa.svg"}
                  alt={nombre}
                />
              ) : (
                <i className="producto-boleto" />
              ))}
            <span>{nombre}</span>
          </li>
        ))}
      </ol>
      <small
        className="aviso-premios"
        style={{
          visibility:
            b.mas_premios || cantidad < premios.length ? "visible" : "hidden",
        }}
      >
        ¡Y MÁS PREMIOS!
      </small>
    </div>
  );
}
function Tarjeta({ b, muestra = false }: { b: Ticket; muestra?: boolean }) {
  const ref = useRef<HTMLDivElement>(null),
    [qr, setQr] = useState("");
  const url = location.origin + "/boleto/" + b.codigo;
  useEffect(() => {
    let vivo = true;
    setQr("");
    QRCode.toDataURL(url, { margin: 2, width: 160 }).then((q) => {
      if (vivo) setQr(q);
    });
    return () => {
      vivo = false;
    };
  }, [url]);
  async function generarPNG() {
    await document.fonts.ready;
    if (!ref.current || (b.plantilla.mostrar_qr && !qr))
      throw Error("Espera a que cargue el boleto.");
    await Promise.all(
      Array.from(ref.current.querySelectorAll("img"), (i) => i.decode()),
    );
    const { toPng } = await import("html-to-image");
    return toPng(ref.current, { pixelRatio: 2 });
  }
  async function exportar(pdf: boolean) {
    const data = await generarPNG();
    if (!ref.current) return;
    const archivo = "Boleto-" + numero(b.numero);
    if (pdf) {
      const { jsPDF } = await import("jspdf");
      const { offsetWidth: width, offsetHeight: height } = ref.current;
      const doc = new jsPDF({
        unit: "pt",
        format: [width, height],
        orientation: width > height ? "landscape" : "portrait",
      });
      doc.addImage(data, "PNG", 0, 0, width, height);
      doc.save(archivo + ".pdf");
    } else {
      const a = document.createElement("a");
      a.href = data;
      a.download = archivo + ".png";
      a.click();
    }
  }
  if (b.estado === "anulado")
    return (
      <section>
        <h2>Boleto anulado</h2>
        <p>Este número dejó de estar asignado a esta venta.</p>
      </section>
    );
  return (
    <section className="soporte-boleto">
      <VistaEscalada>
        <div
          ref={ref}
          className={"boleto " + b.plantilla.tema}
          style={
            b.plantilla.fondo_url
              ? {
                  backgroundImage:
                    "linear-gradient(105deg,#10261fec,#10261f8a),url(" +
                    JSON.stringify(b.plantilla.fondo_url) +
                    ")",
                }
              : undefined
          }
        >
          <div className="cuerpo-boleto">
            <div className="cabecera-boleto">
              <div>
                <small>RifaPes</small>
                <h3>{b.plantilla.titulo}</h3>
                <h2>{b.rifa}</h2>
                <p>{fechaBoleto.format(new Date(b.fecha))} · Perú</p>
              </div>
              {b.imagen && (
                <img
                  className="imagen-rifa"
                  crossOrigin="anonymous"
                  src={b.imagen}
                  alt={"Fotografía de " + b.rifa}
                />
              )}
            </div>
            <div className="numero-boleto">
              <small>Número</small>
              <strong>{numero(b.numero)}</strong>
            </div>
            <h3>{b.participante}</h3>
            {b.telefono && <p>{b.telefono}</p>}
            {b.plantilla.mostrar_lugar && b.direccion && <p>{b.direccion}</p>}
            <small className="codigo-boleto">{b.codigo}</small>
          </div>
          <div className="talon-boleto">
            {b.plantilla.mostrar_premio && <PremiosBoleto b={b} />}
            <div className="pie-transmision">
              {b.plantilla.mostrar_qr && qr && (
                <img
                  className="qr-boleto"
                  src={qr}
                  alt="QR de consulta del boleto"
                />
              )}
              {b.plantilla.mostrar_lugar &&
                b.destino?.startsWith("https://") && (
                  <a href={b.destino} target="_blank" rel="noreferrer">
                    {b.destino}
                  </a>
                )}
            </div>
          </div>
        </div>
      </VistaEscalada>
      {!muestra && (
        <div className="acciones">
          <Accion texto="Descargar PNG" ejecutar={() => exportar(false)} />
          <Accion texto="Descargar PDF" ejecutar={() => exportar(true)} />
          <CompartirIndividual
            key={JSON.stringify(b)}
            b={b}
            url={url}
            generar={generarPNG}
          />
          {b.destino?.startsWith("https://") && (
            <a href={b.destino} target="_blank" rel="noreferrer">
              Ver sorteo
            </a>
          )}
        </div>
      )}
    </section>
  );
}
function CompartirIndividual({
  b,
  url,
  generar,
}: {
  b: Ticket;
  url: string;
  generar: () => Promise<string>;
}) {
  const [mensaje, editar] = useState("🎟️ ¡Gracias por participar!"),
    [foto, preparar] = useState<File>(),
    [imagen, descargar] = useState(""),
    [ocupado, cargar] = useState(false),
    [aviso, informar] = useState("");
  const [telefono, corregir] = useState(b.telefono ?? "");
  const limpio = telefono.trim().replace(/[\s()-]/g, "");
  const movil = /^(?:\+?51)?(9\d{8})$/.exec(limpio);
  const destino = movil
    ? "51" + movil[1]
    : /^\+(?!51)[1-9]\d{7,14}$/.test(limpio)
      ? limpio.slice(1)
      : "";
  const texto = [
    mensaje,
    "Hola, " + b.participante + ". Tu boleto ha sido emitido.",
    "Rifa: " + b.rifa,
    "Participante: " + b.participante,
    "Número de boleto: " + numero(b.numero),
    "Fecha del sorteo: " + fechaBoleto.format(new Date(b.fecha)),
    url,
  ].join("\n");
  const compatible =
    foto &&
    !!navigator.share &&
    navigator.canShare?.({ files: [foto], text: texto });
  async function prepararFoto() {
    cargar(true);
    informar("");
    try {
      const png = await generar();
      const blob = await (await fetch(png)).blob();
      preparar(
        new File([blob], "Boleto-" + numero(b.numero) + ".png", {
          type: "image/png",
        }),
      );
      descargar(png);
    } catch {
      informar(
        "No se pudo preparar la imagen. Revisa las fotos y vuelve a intentar.",
      );
    } finally {
      cargar(false);
    }
  }
  return (
    <details
      className="compartir"
      onToggle={(e) => {
        if (e.currentTarget.open && !foto && !ocupado) void prepararFoto();
      }}
    >
      <summary>Compartir por WhatsApp</summary>
      <Campo titulo="Teléfono para este envío">
        <input
          type="tel"
          value={telefono}
          placeholder="+51 987 654 321"
          onChange={(e) => corregir(e.target.value)}
        />
      </Campo>
      {!destino && (
        <p>
          Ingresa un celular peruano de nueve dígitos o un número internacional
          con + para abrir su chat.
        </p>
      )}
      <Campo titulo="Mensaje personalizado">
        <textarea value={mensaje} onChange={(e) => editar(e.target.value)} />
      </Campo>
      <p>
        {b.rifa} · {b.participante} · {numero(b.numero)} ·{" "}
        {fechaBoleto.format(new Date(b.fecha))}
      </p>
      {!foto ? (
        <button disabled={ocupado} onClick={prepararFoto}>
          {ocupado ? "Preparando imagen…" : "Preparar imagen"}
        </button>
      ) : (
        <>
          {compatible && (
            <button
              onClick={async () => {
                try {
                  await navigator.share({ files: [foto], text: texto });
                } catch (e) {
                  if (!(e instanceof DOMException && e.name === "AbortError"))
                    informar("Puedes usar la descarga manual.");
                }
              }}
            >
              Compartir imagen y mensaje
            </button>
          )}
          <p>
            Para enviar al cliente, descarga el PNG y adjúntalo en su chat. Si
            usas el selector del dispositivo, elige allí la aplicación y el
            contacto.
          </p>
          <a href={imagen} download={foto.name}>
            Descargar imagen
          </a>
          {" · "}
          {destino && (
            <a
              href={
                "https://wa.me/" +
                destino +
                "?text=" +
                encodeURIComponent(texto)
              }
              target="_blank"
              rel="noreferrer"
            >
              Abrir WhatsApp
            </a>
          )}
        </>
      )}
      <p role="status">{aviso}</p>
    </details>
  );
}
function EditorPlantilla({
  inicial,
  premios,
  rifa,
  destino,
  direccion,
  recargar,
}: {
  inicial: Visual;
  premios: Premio[];
  rifa: Rifa;
  destino?: string;
  direccion?: string;
  recargar: () => void;
}) {
  const [borrador, editar] = useState(inicial);
  const [archivo, seleccionar] = useState<File | null>(null);
  const [vistaLocal, previsualizar] = useState("");
  const [aviso, avisar] = useState("");
  const entrada = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!archivo) {
      previsualizar("");
      return;
    }
    const url = URL.createObjectURL(archivo);
    previsualizar(url);
    return () => URL.revokeObjectURL(url);
  }, [archivo]);
  function elegirDiseno(tema: string) {
    seleccionar(null);
    if (entrada.current) entrada.current.value = "";
    avisar("");
    editar({ ...borrador, tema, fondo_url: null });
  }
  const visual = {
    ...borrador,
    fondo_url: archivo ? vistaLocal : borrador.fondo_url,
  };
  return (
    <div className="editor-plantilla">
      <Formulario
        guardar={async (f) => {
          const fondo = await imagen(f, "fondo", borrador.fondo_url);
          await rpc("guardar_plantilla_con_fotos", {
            p_rifa: rifa.id_rifa,
            p_titulo: borrador.titulo.trim(),
            p_tema: borrador.tema,
            p_premio: borrador.mostrar_premio,
            p_lugar: borrador.mostrar_lugar,
            p_qr: borrador.mostrar_qr,
            p_fondo: fondo,
            p_fotos: borrador.mostrar_fotos_premios !== false,
          });
          recargar();
        }}
      >
        <Campo titulo="Título">
          <input
            required
            value={borrador.titulo}
            onChange={(e) => editar({ ...borrador, titulo: e.target.value })}
          />
        </Campo>
        <fieldset className="catalogo">
          <legend>Diseño del boleto</legend>
          {["elegante", "navidad", "verano"].map((tema) => (
            <label key={tema} className="opcion-diseno">
              <input
                type="radio"
                name="tema"
                value={tema}
                checked={
                  !visual.fondo_url && !archivo && borrador.tema === tema
                }
                onChange={() => elegirDiseno(tema)}
              />
              <span className={"miniatura " + tema} aria-hidden="true" />
              <span>{tema}</span>
            </label>
          ))}
        </fieldset>
        <div className="opciones-boleto">
          {(
            [
              ["mostrar_premio", "Mostrar premio"],
              ["mostrar_lugar", "Mostrar lugar"],
              ["mostrar_qr", "Mostrar QR"],
            ] as const
          ).map(([clave, texto]) => (
            <label className="interruptor" key={clave}>
              {texto}
              <input
                type="checkbox"
                role="switch"
                checked={borrador[clave]}
                onChange={(e) =>
                  editar({ ...borrador, [clave]: e.target.checked })
                }
              />
            </label>
          ))}
        </div>
        <label className="interruptor">
          Mostrar fotos de premios
          <input
            role="switch"
            type="checkbox"
            disabled={!borrador.mostrar_premio}
            checked={borrador.mostrar_fotos_premios !== false}
            onChange={(e) =>
              editar({ ...borrador, mostrar_fotos_premios: e.target.checked })
            }
          />
        </label>
        <Campo titulo="Fondo personalizado · 1800 × 800 px recomendados">
          <input
            ref={entrada}
            type="file"
            name="fondo"
            accept="image/png,image/jpeg,image/webp"
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null;
              if (
                f &&
                (f.size > 5242880 ||
                  !["image/png", "image/jpeg", "image/webp"].includes(f.type))
              ) {
                avisar("Elige una imagen PNG, JPEG o WebP de hasta 5 MB.");
                e.target.value = "";
                seleccionar(null);
                return;
              }
              avisar("");
              seleccionar(f);
            }}
          />
        </Campo>
        {aviso && <p role="alert">{aviso}</p>}
        {(archivo || borrador.fondo_url) && (
          <button type="button" onClick={() => elegirDiseno(borrador.tema)}>
            Quitar fondo personalizado
          </button>
        )}
      </Formulario>
      <div className="vista-plantilla">
        <h3>Vista previa</h3>
        <Tarjeta
          muestra
          b={{
            codigo: "MUESTRA",
            estado: "muestra",

            numero: 7,
            participante: "Participante de ejemplo",
            premio: "",
            ...informacionRifa(rifa, premios),

            plantilla: visual,
            destino,
            direccion,
          }}
        />
      </div>
    </div>
  );
}
type BoletoComprador = Boleto & { id_persona: string };

function FotoConjunta({
  boletos,
  destino,
  direccion,
}: {
  boletos: Boleto[];
  destino?: string;
  direccion?: string;
}) {
  const zona = useRef<HTMLDivElement>(null);
  const [foto, guardar] = useState<File>();
  const [enlace, url] = useState("");
  useEffect(() => {
    if (!foto) return;
    const objeto = URL.createObjectURL(foto);
    url(objeto);
    return () => URL.revokeObjectURL(objeto);
  }, [foto]);
  async function preparar() {
    const elemento = zona.current;
    if (!elemento) return;
    await document.fonts.ready;
    const imagenes = Array.from(elemento.querySelectorAll("img"));
    if (
      elemento.querySelectorAll(".qr-boleto").length !==
      boletos.filter((b) => b.datos_emision_historicos.plantilla.mostrar_qr)
        .length
    )
      throw Error("Espera a que carguen los códigos QR y vuelve a intentarlo.");
    await Promise.all(imagenes.map((i) => i.decode()));
    const { toBlob } = await import("html-to-image");
    const png = await toBlob(elemento, {
      pixelRatio: 2,
      backgroundColor: "#ffffff",
    });
    if (!png)
      throw Error("No se pudo crear la foto. Prueba con menos boletos.");
    guardar(
      new File(
        [png],
        "Boletos-" +
          boletos
            .map((b) => numero(b.datos_emision_historicos.numero))
            .join("-")
            .slice(0, 150) +
          ".png",
        { type: "image/png" },
      ),
    );
  }
  return (
    <section>
      <h3>Foto conjunta · {boletos.length} boletos</h3>
      <VistaEscalada ancho={916}>
        <div
          className="lote-boletos"
          ref={zona}
          style={{ width: 916, background: "#fff", padding: 8 }}
        >
          {boletos.map((b) => (
            <Tarjeta
              muestra
              key={b.token_publico}
              b={{
                ...b.datos_emision_historicos,
                codigo: b.token_publico,
                estado: b.estado,
                destino,
                direccion,
              }}
            />
          ))}
        </div>
      </VistaEscalada>
      {!foto ? (
        <Accion texto="Preparar foto conjunta" ejecutar={preparar} />
      ) : (
        <div className="acciones">
          {navigator.canShare?.({ files: [foto] }) && (
            <Accion
              texto="Compartir foto"
              ejecutar={() => navigator.share({ files: [foto] })}
            />
          )}
          {enlace && (
            <a href={enlace} download={foto.name}>
              Descargar foto para WhatsApp
            </a>
          )}
        </div>
      )}
    </section>
  );
}

export function Publico({ token }: { token: string }) {
  const [b, set] = useState<Ticket | null>(null),
    [msg, aviso] = useState("Consultando boleto…");
  useEffect(() => {
    let vivo = true;
    async function consultar() {
      if (!db) throw Error("Falta configurar Supabase.");
      const { data, error } = await db.functions.invoke("consultar-boleto", {
        body: { token },
      });
      if (error) {
        const respuesta = error.context;
        const status = respuesta?.status;
        if (status === 404 && respuesta instanceof Response) {
          const detalle = await respuesta
            .clone()
            .json()
            .catch(() => null);
          if (detalle?.code === "NOT_FOUND")
            throw Error(
              "La consulta pública aún no está desplegada en este proyecto de Supabase.",
            );
        }
        throw Error(
          status === 404
            ? "Boleto no encontrado."
            : status === 429
              ? "Demasiadas consultas. Intenta en un minuto."
              : status === 503
                ? "El servicio de boletos está temporalmente fuera de servicio."
                : "No se pudo conectar con la consulta pública. Comprueba tu conexión o contacta con la organización.",
        );
      }
      if (vivo) set(data);
    }
    void consultar().catch((e) => aviso(e.message));
    return () => {
      vivo = false;
    };
  }, [token]);
  return (
    <main className="publico">
      <p className="ceja">RifaPes</p>
      <h1>Consulta de boleto</h1>
      {b ? <Tarjeta b={b} /> : <p role="status">{msg}</p>}
    </main>
  );
}
export function Boletos({
  premios,
  r,
  version,
  recargar,
}: {
  premios: Premio[];
  r: Rifa;
  version: number;
  recargar: () => void;
}) {
  const [tpl, plantilla] = useState<Visual>(),
    [c, transmision] = useState<Fila>(),
    [bs, boletos] = useState<BoletoComprador[]>([]),
    [extras, marcar] = useState<string[]>([]),
    [err, error] = useState(""),
    [seleccion, abrir] = useState(""),
    [modo, modalidad] = useState("");
  useEffect(() => {
    let vivo = true;
    async function cargar() {
      const f: [string, string] = ["id_rifa", r.id_rifa];
      const [t, c, b, contactos] = await Promise.all([
        filas<Visual>("plantilla_boleto", f),
        filas<Fila>("configuracion_transmision", f),
        filas<BoletoComprador>("vw_boletos_rifa", f, "id_boleto"),
        filas<Persona>("persona", undefined, "id_persona"),
      ]);
      const telefonos = new Map(
        contactos.map((p) => [p.id_persona, p.telefono]),
      );
      if (vivo) {
        plantilla(t[0]);
        transmision(c[0]);
        modalidad(String(c[0].modalidad));
        boletos(
          b
            .flatMap((x) => {
              const id = x.id_persona;
              if (typeof id !== "string") return [];
              const historico = x.datos_emision_historicos;
              return [
                {
                  ...x,
                  id_persona: id,
                  datos_emision_historicos: {
                    ...historico,
                    ...informacionRifa(r, premios),
                    telefono: telefonos.get(id),
                    plantilla: t[0] ?? historico.plantilla,
                  },
                },
              ];
            })
            .sort(
              (a, b) =>
                a.datos_emision_historicos.numero -
                b.datos_emision_historicos.numero,
            ),
        );
        error("");
      }
    }
    void cargar().catch((e) => error(e.message));
    return () => {
      vivo = false;
    };
  }, [r, premios, version]);
  const destino =
    c?.modalidad === "tiktok" && c.usuario_tiktok
      ? "https://www.tiktok.com/@" + String(c.usuario_tiktok).replace(/^@/, "")
      : ["teams", "otro"].includes(String(c?.modalidad))
        ? String(c?.enlace_reunion || "")
        : undefined;
  const b = bs.find((b) => b.token_publico === seleccion);
  const relacionados =
    b?.estado === "emitido"
      ? bs.filter(
          (x) => x.id_persona === b.id_persona && x.estado === "emitido",
        )
      : [];
  const grupo = relacionados.filter(
    (x) => x === b || extras.includes(x.token_publico),
  );
  return (
    <>
      {err && <p role="alert">{err}</p>}
      {tpl && r.estado === "activa" && (
        <details>
          <summary>Plantilla de los boletos de esta rifa</summary>
          <EditorPlantilla
            key={JSON.stringify([r.id_rifa, tpl])}
            premios={premios}
            inicial={tpl}
            rifa={r}
            destino={destino}
            direccion={
              c?.modalidad === "presencial"
                ? String(c.direccion || "")
                : undefined
            }
            recargar={recargar}
          />
        </details>
      )}
      {c && (
        <details>
          <summary>Lugar y transmisión</summary>
          <Formulario
            guardar={async (f) => {
              await rpc("guardar_transmision", {
                p_rifa: r.id_rifa,
                p_modalidad: modo,
                p_usuario:
                  modo === "tiktok" ? usuarioTikTok(campo(f, "usuario")) : null,
                p_enlace: campo(f, "enlace") || null,
                p_direccion: campo(f, "direccion") || null,
              });
              recargar();
            }}
          >
            <Campo titulo="Modalidad">
              <select value={modo} onChange={(e) => modalidad(e.target.value)}>
                {["presencial", "teams", "tiktok", "otro"].map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </Campo>
            {modo === "presencial" ? (
              <Campo titulo="Dirección">
                <input
                  name="direccion"
                  defaultValue={String(c.direccion || "")}
                />
              </Campo>
            ) : modo === "tiktok" ? (
              <Campo titulo="Usuario o enlace de TikTok">
                <input
                  name="usuario"
                  required
                  placeholder="@usuario o https://www.tiktok.com/@usuario"
                  defaultValue={String(c.usuario_tiktok || "")}
                />
              </Campo>
            ) : (
              <Campo titulo="Enlace HTTPS">
                <input
                  name="enlace"
                  type="url"
                  pattern="https://.+"
                  required
                  defaultValue={String(c.enlace_reunion || "")}
                />
              </Campo>
            )}
          </Formulario>
        </details>
      )}
      <h2>Boletos emitidos</h2>
      {!bs.length ? (
        <p>
          Puedes emitir los boletos desde una reserva o venta. Al completar el
          pago se emiten automáticamente.
        </p>
      ) : (
        <Campo titulo="Seleccionar boleto">
          <select
            value={seleccion}
            onChange={(e) => {
              abrir(e.target.value);
              marcar([]);
            }}
          >
            <option value="">Elegir boleto</option>
            {bs.map((b) => (
              <option key={b.token_publico} value={b.token_publico}>
                {numero(b.datos_emision_historicos.numero)} ·{" "}
                {b.datos_emision_historicos.participante} · {b.estado}
              </option>
            ))}
          </select>
        </Campo>
      )}
      {b && (
        <>
          {relacionados.length > 1 && (
            <section>
              <h3>
                Juntar boletos de {b.datos_emision_historicos.participante}
              </h3>
              <p>Marca los números que quieres enviar en una sola foto.</p>
              <div className="acciones">
                {relacionados.map((x) => (
                  <label key={x.token_publico}>
                    <input
                      type="checkbox"
                      disabled={x === b}
                      checked={grupo.includes(x)}
                      onChange={(e) =>
                        marcar(
                          e.target.checked
                            ? [...extras, x.token_publico]
                            : extras.filter((id) => id !== x.token_publico),
                        )
                      }
                    />
                    {numero(x.datos_emision_historicos.numero)}
                  </label>
                ))}
              </div>
            </section>
          )}
          {grupo.length > 1 ? (
            <FotoConjunta
              key={
                JSON.stringify(grupo) +
                JSON.stringify([tpl, c?.modalidad, c?.direccion, destino])
              }
              boletos={grupo}
              destino={destino}
              direccion={
                c?.modalidad === "presencial"
                  ? String(c.direccion || "")
                  : undefined
              }
            />
          ) : (
            <>
              <Tarjeta
                b={{
                  ...b.datos_emision_historicos,
                  codigo: b.token_publico,
                  estado: b.estado,
                  direccion:
                    c?.modalidad === "presencial"
                      ? String(c.direccion || "")
                      : undefined,
                  destino,
                }}
              />
              <a
                href={"/boleto/" + b.token_publico}
                target="_blank"
                rel="noreferrer"
              >
                Abrir consulta pública
              </a>
            </>
          )}
        </>
      )}
    </>
  );
}
