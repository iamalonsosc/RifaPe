import {
  PlataformaBoleto,
  plataformaDe,
  nombresPlataforma,
} from "./plataformas";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
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
  soles,
  type Premio,
  numero,
  imagen,
  type Ticket,
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
  const [posiciones, distribuir] = useState<
    { columna: number; arriba: number }[]
  >([]);
  const cantidad = posiciones.length;
  useLayoutEffect(() => {
    const root = caja.current!;
    const lista = root.querySelector("ol")!;
    const aviso = root.querySelector<HTMLElement>(".aviso-premios")!;
    function medir() {
      const filas = Array.from(lista.children) as HTMLElement[];
      const margen = parseFloat(getComputedStyle(lista).rowGap) || 0;
      const libre = root.clientHeight - lista.offsetTop;
      function ubicar(alto: number) {
        let columna = 0,
          arriba = 0;
        const posiciones = [];
        for (const fila of filas) {
          if (arriba + fila.offsetHeight > alto) {
            columna++;
            arriba = 0;
          }
          if (columna > 1 || fila.offsetHeight > alto) break;
          posiciones.push({ columna, arriba });
          arriba += fila.offsetHeight + margen;
        }
        const alturas = filas
          .slice(0, posiciones.length)
          .map((fila) => fila.offsetHeight);
        const total = alturas.reduce(
          (suma, altura) => suma + altura + margen,
          0,
        );
        let izquierda = 0;
        let diferencia = Infinity;
        let corte = alturas.length;
        for (let i = 1; i < alturas.length; i++) {
          izquierda += alturas[i - 1] + margen;
          const derecha = total - izquierda;
          const distancia = Math.abs(izquierda - derecha);
          if (
            Math.max(izquierda, derecha) - margen <= alto &&
            distancia < diferencia
          ) {
            corte = i;
            diferencia = distancia;
          }
        }
        arriba = 0;
        return alturas.map((altura, i) => {
          if (i === corte) arriba = 0;
          const posicion = { columna: i < corte ? 0 : 1, arriba };
          arriba += altura + margen;
          return posicion;
        });
      }
      const todas = ubicar(libre);
      distribuir(
        b.mas_premios || todas.length < filas.length
          ? ubicar(libre - aviso.offsetHeight - margen)
          : todas,
      );
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
            style={{
              visibility: i < cantidad ? "visible" : "hidden",
              left: posiciones[i]?.columna ? "calc(50% + 5px)" : 0,
              top: posiciones[i]?.arriba ?? 0,
            }}
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
const lugarPendiente =
  "Por el momento no está definido, consultar el link de su boleto 7 días antes del evento.";
function AccesoEvento({ b }: { b: Ticket }) {
  const presencial = b.modalidad === "presencial" || !!b.direccion;
  const enlace = presencial
    ? b.enlace_mapa ||
      (b.direccion
        ? "https://www.google.com/maps/search/?api=1&query=" +
          encodeURIComponent(b.direccion)
        : "")
    : b.destino;
  const pendiente = b.modalidad === "sin_definir";
  const titulo = pendiente
    ? "Lugar del sorteo por definir"
    : presencial
      ? "Ver ubicación"
      : "Ver sorteo en vivo";
  const destino = enlace && URL.canParse(enlace) ? new URL(enlace) : null;
  return !pendiente && destino?.protocol === "https:" ? (
    <a className="boton-evento" href={enlace} target="_blank" rel="noreferrer">
      {titulo}
    </a>
  ) : (
    <>
      <button disabled>{titulo}</button>
      {!pendiente && (
        <small>El organizador aún no ha publicado el enlace.</small>
      )}
    </>
  );
}
function Tarjeta({
  publico = false,
  b,
  muestra = false,
  qrInicial = "",
}: {
  b: Ticket;
  muestra?: boolean;
  qrInicial?: string;
  publico?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null),
    [qr, setQr] = useState(qrInicial);
  const url = location.origin + "/boleto/" + (b.codigo_grupo ?? b.codigo);
  const numeros = b.numeros ?? [b.numero];
  useEffect(() => {
    if (qrInicial || b.estado === "anulado") return;
    let vivo = true;
    setQr("");
    QRCode.toDataURL(url, { margin: 4, width: 384 }).then((q) => {
      if (vivo) setQr(q);
    });
    return () => {
      vivo = false;
    };
  }, [url, qrInicial, b.estado]);
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
        <h2>BOLETO ANULADO</h2>
        {b.estado_rifa === "anulada" && <p>Rifa anulada</p>}
        <p>Este boleto ya no es válido para participar en el sorteo.</p>
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
                <p>{fechaBoleto.format(new Date(b.fecha))}</p>
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
              <small>Tus números</small>
              <div
                className="numeros-agrupados"
                style={{
                  gridTemplateColumns:
                    "repeat(" +
                    Math.min(numeros.length, numeros.length <= 12 ? 5 : 7) +
                    ", minmax(0,1fr))",
                  fontSize:
                    numeros.length === 1
                      ? 58
                      : numeros.length < 4
                        ? 36
                        : numeros.length < 13
                          ? 28
                          : 19,
                }}
              >
                {numeros.map((n) => (
                  <b key={n}>{numero(n)}</b>
                ))}
              </div>
              {numeros.length > 1 && <small>{numeros.length} números</small>}
            </div>
            <div className="datos-titular-boleto">
              <h3>{b.participante}</h3>
              {b.telefono && <p>{b.telefono}</p>}
              {b.plantilla.mostrar_lugar && b.direccion && <p>{b.direccion}</p>}
              {b.plantilla.mostrar_lugar && b.modalidad === "sin_definir" && (
                <p>Sin definir</p>
              )}
              {b.plantilla.mostrar_lugar && <PlataformaBoleto b={b} />}
            </div>
            {b.plantilla.mostrar_qr && qr && (
              <img
                className="qr-boleto"
                src={qr}
                alt="QR de consulta del boleto"
              />
            )}
          </div>
          <div className="talon-boleto">
            {b.plantilla.mostrar_premio && <PremiosBoleto b={b} />}
          </div>
        </div>
      </VistaEscalada>
      {!muestra && (
        <div className="acciones">
          <Accion texto="Descargar PNG" ejecutar={() => exportar(false)} />
          <Accion texto="Descargar PDF" ejecutar={() => exportar(true)} />
          {!publico && (
            <CompartirIndividual
              key={JSON.stringify(b)}
              b={b}
              url={url}
              generar={generarPNG}
            />
          )}
          {!publico && b.destino?.startsWith("https://") && (
            <a href={b.destino} target="_blank" rel="noreferrer">
              Ver sorteo
            </a>
          )}
          {publico && <AccesoEvento b={b} />}
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
  const [mensaje, editar] = useState(
      "¡Hola, " + b.participante + "!",
    ),
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
  const numeros = b.numeros ?? [b.numero];
  const filasNumeros = [];
  for (let i = 0; i < numeros.length; i += 5) {
    filasNumeros.push(
      numeros
        .slice(i, i + 5)
        .map(numero)
        .join(" · "),
    );
  }
  const instante = new Date(b.fecha);
  const dia = instante.toLocaleDateString("es-PE", {
    dateStyle: "full",
    timeZone: "America/Lima",
  });
  const hora = instante.toLocaleTimeString("es-PE", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: "America/Lima",
  });
  const plataforma = plataformaDe(b);
  const presencial =
    b.modalidad === "presencial" || (!plataforma && !!b.direccion);
  const estados = new Map(
    b.estados_numeros?.map((n) => [n.numero, n.estado_numero]),
  );
  const grupos = [
    [
      "pagada",
      "¡Gracias por participar! Tu boleto ha sido emitido correctamente y tus números ya están participando en el sorteo.",
    ],
    [
      "reservado",
      "¡Gracias por reservar! Tus números han sido reservados correctamente. Recuerda completar el pago para participar en el sorteo.",
    ],
    [
      "pendiente",
      "Tu boleto ha sido registrado correctamente. Recuerda completar el saldo pendiente para que tus números puedan participar en el sorteo.",
    ],
  ];
  const avisos = grupos.flatMap(([estado, aviso]) => {
    const incluidos = numeros.filter((n) => estados.get(n) === estado);
    if (!incluidos.length) return [];
    return [
      incluidos.length === numeros.length
        ? aviso
        : "Números " + incluidos.map(numero).join(", ") + " · " + aviso,
    ];
  });
  const texto = [
    mensaje,
    ...avisos,
    "🎟️ *DETALLES DE TU BOLETO*",
    [
      "🏷️ *Rifa:* " + b.rifa,
      "👤 *Participante:* " + b.participante,
      "🔢 *Números adquiridos (" + numeros.length + "):*",
      ...filasNumeros,
    ].join("\n"),
    [
      "📅 *Fecha:* " + dia[0].toUpperCase() + dia.slice(1),
      "🕔 *Hora:* " + hora + " (Perú)",
      presencial
        ? "📍 *Modalidad:* Presencial"
        : plataforma
          ? "📍 *Modalidad:* Virtual · " + plataforma.nombre
          : "",
    ]
      .filter(Boolean)
      .join("\n"),
    "📲 *CONSULTA TU BOLETO DIGITAL*\nPuedes visualizar tu boleto en el siguiente enlace:\n" +
      url,
    b.modalidad === "sin_definir"
      ? "📍 *Sin definir*\n" + lugarPendiente
      : presencial
        ? [
            "🎊 *¡ACOMPÁÑANOS EN NUESTRO GRAN SORTEO!*",
            [
              b.direccion && "📍 *Lugar:* " + b.direccion,
              b.enlace_mapa && "🗺️ *Cómo llegar:* " + b.enlace_mapa,
            ]
              .filter(Boolean)
              .join("\n"),
            "¡Te esperamos para compartir este gran momento y conocer a nuestros ganadores!",
          ]
            .filter(Boolean)
            .join("\n\n")
        : plataforma
          ? "🔴 *¡ACOMPÁÑANOS EN EL SORTEO EN VIVO!*\nIngresa a la transmisión el día del sorteo:\n" +
            b.destino
          : "",
    "🍀 ¡Mucha suerte y gracias por tu apoyo!",
    "─────────────────\n🎟️ *RifaPes* | Tu suerte comienza aquí.",
  ]
    .filter(Boolean)
    .join("\n\n");
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
  modalidad,
  direccion,
  recargar,
}: {
  inicial: Visual;
  premios: Premio[];
  rifa: Rifa;
  destino?: string;
  modalidad?: string;
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
            modalidad,
            direccion,
          }}
        />
      </div>
    </div>
  );
}
type Comprobante = {
  id_persona: string;
  token_grupo: string;
  estado: string;
  estado_rifa: string;
  numeros: number[];
  estados_numeros: Ticket["estados_numeros"];
  datos_emision_historicos: Ticket;
};
async function descargarLote(boletos: Ticket[]) {
  const [{ zipSync }, { toBlob }] = await Promise.all([
    import("fflate"),
    import("html-to-image"),
  ]);
  const archivos: Record<string, Uint8Array> = {};
  const zona = document.createElement("div");
  zona.style.cssText = "position:fixed;left:-10000px;width:900px;top:0";
  document.body.append(zona);
  const root = createRoot(zona);
  try {
    await document.fonts.ready;
    for (const b of boletos) {
      const qr = await QRCode.toDataURL(
        location.origin + "/boleto/" + b.codigo,
        { margin: 4, width: 384 },
      );
      flushSync(() =>
        root.render(<Tarjeta key={b.codigo} b={b} muestra qrInicial={qr} />),
      );
      const el = zona.querySelector<HTMLElement>(".boleto")!;
      await Promise.all([...el.querySelectorAll("img")].map((i) => i.decode()));
      await new Promise<void>((ok) =>
        requestAnimationFrame(() => requestAnimationFrame(() => ok())),
      );
      const png = await toBlob(el, { pixelRatio: 2 });
      if (!png) throw Error("No se pudo generar el boleto.");
      archivos["Boleto-" + b.codigo + ".png"] = new Uint8Array(
        await png.arrayBuffer(),
      );
    }
    const contenido = zipSync(archivos, { level: 0 });
    const url = URL.createObjectURL(
      new Blob([new Uint8Array(contenido)], { type: "application/zip" }),
    );
    const enlace = document.createElement("a");
    enlace.href = url;
    enlace.download = "Boletos-RifaPes.zip";
    enlace.click();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  } finally {
    root.unmount();
    zona.remove();
  }
}
export function Publico({
  token,
  esRifa = false,
}: {
  token: string;
  esRifa?: boolean;
}) {
  const [publicada, verRifa] = useState<{
    nombre: string;
    estado: string;
    fecha: string;
    precio: number;
    ofertas: { cantidad: number; precio: number }[];
  }>();
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
      if (!vivo) return;
      if (esRifa && data?.tipo === "rifa") verRifa(data);
      else if (!esRifa && data && data.tipo !== "rifa") set(data);
      else throw Error("Enlace no encontrado.");
    }
    void consultar().catch((e) => aviso(e.message));
    return () => {
      vivo = false;
    };
  }, [token, esRifa]);
  return (
    <main className="publico">
      <p className="ceja">RifaPes</p>
      <h1>
        {esRifa
          ? (publicada?.nombre ?? "Consulta de rifa")
          : "Consulta de boleto"}
      </h1>
      {publicada && (
        <>
          <h2>Rifa {publicada.estado.replace("_", " ")}</h2>
          <p>{fechaBoleto.format(new Date(publicada.fecha))}</p>
          {publicada.estado === "activa" && (
            <>
              <p>Precio por número {soles(publicada.precio)}</p>
              {publicada.ofertas.map((o) => (
                <p key={o.cantidad}>
                  {o.cantidad} números por {soles(o.precio)}
                </p>
              ))}
            </>
          )}
        </>
      )}
      {b ? (
        <>
          <Tarjeta b={b} publico />
          {b.estado !== "anulado" && (
            <>
              <h2>¡Conoce todos los premios que puedes ganar!</h2>
              <div className="catalogo-premios">
                {b.premios_publicos?.map((p) => (
                  <article key={p.orden}>
                    {(p.imagen || p.sorpresa) && (
                      <img
                        loading="lazy"
                        src={p.sorpresa ? "/regalo-sorpresa.svg" : p.imagen}
                        alt=""
                      />
                    )}
                    <div>
                      <small>Premio {p.orden}</small>
                      <h3>{p.nombre}</h3>
                      {p.descripcion && <p>{p.descripcion}</p>}
                    </div>
                  </article>
                ))}
              </div>
              {!!b.numeros_anulados?.length && (
                <p>
                  Boleto parcialmente anulado · Números vigentes: {b.numeros?.map(numero).join(", ")} · Números anulados: {b.numeros_anulados.map(numero).join(", ")}
                </p>
              )}
              {b.modalidad === "sin_definir" && <p>{lugarPendiente}</p>}
              {b.direccion && <p>Lugar del evento: {b.direccion}</p>}
            </>
          )}
          {b.estado === "emitido" && b.estado_rifa && (
            <p>
              Boleto vigente · Rifa {b.estado_rifa.replace("_", " ")}
              {b.estados_numeros?.some(
                (n) => n.estado_numero === "reservado",
              ) &&
                " · Reservados: " +
                  b.estados_numeros
                    .filter((n) => n.estado_numero === "reservado")
                    .map((n) => numero(n.numero))
                    .join(", ")}
            </p>
          )}
        </>
      ) : (
        !publicada && <p role="status">{msg}</p>
      )}
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
    [bs, boletos] = useState<Comprobante[]>([]),
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
        filas<Comprobante>("vw_comprobantes_operacion", f, "token_grupo"),
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
      : ["teams", "meet", "otro"].includes(String(c?.modalidad))
        ? String(c?.enlace_reunion || "")
        : undefined;
  const tickets = bs.map((x) => ({
    ...x.datos_emision_historicos,
    codigo: x.token_grupo,
    numeros: x.numeros,
    estados_numeros: x.estados_numeros,
    numero: x.numeros[0],
    estado: x.estado,
    estado_rifa: x.estado_rifa,
    modalidad: String(c?.modalidad || ""),
    enlace_mapa:
      c?.modalidad === "presencial" ? String(c.enlace_mapa || "") : undefined,
    destino,
    direccion:
      c?.modalidad === "presencial" ? String(c.direccion || "") : undefined,
  }));
  const b = tickets.find((b) => b.codigo === seleccion);
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
            modalidad={String(c?.modalidad || "")}
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
      {c && r.estado !== "anulada" && (
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
                p_mapa: campo(f, "mapa") || null,
              });
              recargar();
            }}
          >
            <Campo titulo="Modalidad">
              <select
                value={
                  ["presencial", "sin_definir"].includes(modo)
                    ? modo
                    : "virtual"
                }
                onChange={(e) =>
                  modalidad(
                    e.target.value === "virtual" ? "teams" : e.target.value,
                  )
                }
              >
                <option value="sin_definir">Sin definir</option>
                <option value="presencial">Presencial</option>
                <option value="virtual">Virtual</option>
              </select>
            </Campo>
            {!["presencial", "sin_definir"].includes(modo) && (
              <Campo titulo="Plataforma de transmisión">
                <select
                  value={modo}
                  onChange={(e) => modalidad(e.target.value)}
                >
                  {["teams", "meet", "tiktok", "otro"].map((s) => (
                    <option key={s} value={s}>
                      {nombresPlataforma[s]}
                    </option>
                  ))}
                </select>
              </Campo>
            )}
            {modo === "sin_definir" ? (
              <p>{lugarPendiente}</p>
            ) : modo === "presencial" ? (
              <>
                <Campo titulo="Dirección">
                  <input
                    name="direccion"
                    defaultValue={String(c.direccion || "")}
                  />
                </Campo>
                <Campo titulo="Enlace de Google Maps (opcional)">
                  <input
                    name="mapa"
                    type="url"
                    placeholder="https://maps.app.goo.gl/…"
                    defaultValue={String(c.enlace_mapa || "")}
                  />
                </Campo>
              </>
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
            }}
          >
            <option value="">Elegir boleto</option>
            {tickets.map((b) => (
              <option key={b.codigo} value={b.codigo}>
                {b.participante} · {b.numeros.length} números · {b.estado}
              </option>
            ))}
          </select>
        </Campo>
      )}
      {tickets.some((t) => t.estado === "emitido") && (
        <Accion
          texto="Descargar boletos agrupados (ZIP)"
          ejecutar={() =>
            descargarLote(tickets.filter((t) => t.estado === "emitido"))
          }
        />
      )}
      {b && (
        <>
          <Tarjeta b={b} />
          <a href={"/boleto/" + b.codigo} target="_blank" rel="noreferrer">
            Abrir consulta pública
          </a>
        </>
      )}
    </>
  );
}
