import { Tombola } from "./tombola";
import { useState, useEffect, useRef } from "react";
import { Accion } from "./controles";
import { filas, rpc, numero, type Premio, type Rifa, type Fila } from "./datos";
export function Sorteo({
  r,
  premios,
  version,
  recargar,
}: {
  r: Rifa;
  premios: Premio[];
  version: number;
  recargar: () => void;
}) {
  const [extracciones, set] = useState<Fila[]>([]),
    [ganadores, resultados] = useState<Fila[]>([]),
    [err, error] = useState(""),
    [listo, preparar] = useState(false);
  useEffect(() => {
    let vivo = true;
    preparar(false);
    async function cargar() {
      const f: [string, string] = ["id_rifa", r.id_rifa];
      const [e, g] = await Promise.all([
        filas<Fila>("vw_selecciones_rifa", f, "fecha_extraccion"),
        filas<Fila>("vw_historial_ganadores", f, "orden_sorteo"),
      ]);
      if (vivo) {
        set(e);
        resultados(g);
        preparar(true);
        error("");
      }
    }
    void cargar().catch((e) => error(e.message));
    return () => {
      vivo = false;
    };
  }, [r.id_rifa, version]);
  const clave = "premio-en-pantalla:" + r.id_rifa;
  const [visible, seleccionar] = useState(
    () => sessionStorage.getItem(clave) || "",
  );
  function mostrar(id: string) {
    seleccionar(id);
    sessionStorage.setItem(clave, id);
  }
  const pendiente = premios.find(
    (p) => !ganadores.some((g) => Number(g.orden_sorteo) === p.orden_sorteo),
  );
  const p =
    premios.find((p) => p.id_premio_rifa === visible) ??
    pendiente ??
    premios.at(-1);
  const ganador = ganadores.find(
    (g) => Number(g.orden_sorteo) === p?.orden_sorteo,
  );
  const pasos = extracciones.filter(
    (e) => e.id_premio_rifa === p?.id_premio_rifa,
  );
  const escenario = useRef<HTMLElement>(null);
  const [salida, extraida] = useState<number>();
  const [mezclando, animar] = useState(false),
    [mostrarCelebracion, celebrar] = useState("");
  const [resumen, candidatos] = useState<{
    estado_rifa: string;
    extracciones: number;
    ultimo_premio?: string;
    premioConsultado?: string;
    inscritos: number;
    vendidos: number;
    abiertas: boolean;
    numeros: number;
    participantes: number;
    muestra: number[] | null;
  }>();
  const premioId = p?.id_premio_rifa;
  const [congelados, fijar] = useState<number[]>([]);
  const [aviso, avisar] = useState("");
  const vendidosPrevios = useRef<number | undefined>(undefined);
  const solicitud = useRef<{ clave: string; id: string } | undefined>(
    undefined,
  );
  const refrescar = useRef(recargar);
  useEffect(() => {
    refrescar.current = recargar;
  }, [recargar]);
  useEffect(() => {
    let vivo = true,
      timer: ReturnType<typeof setTimeout>;
    if (!listo || mezclando || !["activa", "en_sorteo"].includes(r.estado))
      return;
    async function actualizar() {
      try {
        const x = await rpc<NonNullable<typeof resumen>>("resumen_candidatos", {
          p_rifa: r.id_rifa,
          p_premio: premioId ?? null,
        });
        if (vivo) {
          if (
            x.estado_rifa !== r.estado ||
            x.extracciones !== extracciones.length
          ) {
            if (x.ultimo_premio && x.extracciones > extracciones.length) {
              seleccionar(x.ultimo_premio);
              sessionStorage.setItem(clave, x.ultimo_premio);
            }
            candidatos(undefined);
            refrescar.current();
            return;
          }
          x.premioConsultado = premioId;
          const nuevos = x.inscritos - (vendidosPrevios.current ?? x.inscritos);
          if (nuevos > 0)
            avisar("¡Se incorporaron " + nuevos + " nuevos números al sorteo!");
          vendidosPrevios.current = x.inscritos;
          candidatos((anterior) =>
            anterior && JSON.stringify(anterior) === JSON.stringify(x)
              ? anterior
              : x,
          );
        }
      } catch (e) {
        if (vivo) {
          candidatos(undefined);
          error((e as Error).message);
        }
      }
      if (vivo) timer = setTimeout(actualizar, 1800);
    }
    void actualizar();
    return () => {
      vivo = false;
      clearTimeout(timer);
    };
  }, [
    premioId,
    r.id_rifa,
    r.estado,
    version,
    mezclando,
    listo,
    extracciones.length,
    clave,
  ]);
  useEffect(() => {
    if (!aviso) return;
    const reloj = setTimeout(() => avisar(""), 4500);
    return () => clearTimeout(reloj);
  }, [aviso]);
  const numerosEsfera = mezclando ? congelados : (resumen?.muestra ?? []);
  const [pelotas, contarPelotas] = useState(0);
  const consistente =
    !!resumen &&
    resumen.premioConsultado === premioId &&
    resumen.estado_rifa === r.estado &&
    resumen.numeros > 0 &&
    resumen.numeros === pelotas &&
    resumen.numeros === resumen.muestra?.length &&
    new Set(resumen.muestra).size === resumen.numeros;
  const ultimo = pasos.at(-1),
    orden = pasos.length + 1;
  const valor = (e: Fila) => numero(Number(e.numero));
  return (
    <>
      <section ref={escenario} className="transmision">
        <p className="ceja">SORTEO OFICIAL · {r.nombre}</p>
        {document.fullscreenEnabled && (
          <button
            onClick={() => {
              void (
                document.fullscreenElement
                  ? document.exitFullscreen()
                  : escenario.current!.requestFullscreen()
              ).catch(() => error("Pantalla completa no disponible."));
            }}
          >
            Pantalla completa
          </button>
        )}
        {err && <p role="alert">{err}</p>}
        {r.estado === "activa" ? (
          <>
            <h2>Iniciar sorteo</h2>
            <Tombola muestra={resumen?.muestra ?? []} mezcla={false} />
            <p>
              {r.permitir_ventas_sorteo
                ? "Las ventas seguirán abiertas. Los nuevos números participan al completar su pago."
                : "Al iniciar se cierran las ventas. Participan los números pagados."}
            </p>
            {listo && (
              <Accion
                texto="Iniciar sorteo oficial"
                ejecutar={async () => {
                  if (
                    !confirm(
                      "¿Iniciar el sorteo oficial con la configuración actual?",
                    )
                  )
                    throw Error("El sorteo sigue pendiente.");
                  await rpc("iniciar_sorteo", { p_rifa: r.id_rifa });
                  recargar();
                }}
              />
            )}
          </>
        ) : ["anulada", "terminada"].includes(r.estado) ? (
          <h2>
            {r.estado === "anulada" ? "Rifa anulada" : "Sorteo terminado"}
          </h2>
        ) : listo && p ? (
          <>
            <h2>{p.es_sorpresa && !ganador ? "Premio sorpresa" : p.nombre}</h2>
            {(p.imagen_url || p.es_sorpresa) && (
              <img
                className="foto-sorteo"
                src={
                  (p.es_sorpresa && !ganador) || !p.imagen_url
                    ? "/regalo-sorpresa.svg"
                    : p.imagen_url
                }
                alt={p.es_sorpresa && !ganador ? "Premio sorpresa" : p.nombre}
              />
            )}
            <p>
              Premio {p.orden_sorteo} de {premios.length} · Gana el número de la
              selección {p.numero_extraccion_ganadora} ·{" "}
              {p.numero_extraccion_ganadora === 3
                ? "A la tercera es la vencida"
                : p.numero_extraccion_ganadora === 1
                  ? "Al primer número"
                  : "Por rondas"}
            </p>
            {!ganador && resumen && (
              <p>
                {resumen.vendidos} vendidos vigentes · {pelotas} pelotas en el
                sorteo · {mezclando ? congelados.length : resumen.numeros}{" "}
                números habilitados · {resumen.participantes} participantes
              </p>
            )}
            <p role="status">{aviso}</p>
            <p>{resumen?.abiertas ? "Ventas abiertas" : "Ventas cerradas"}</p>
            {r.permitir_ventas_sorteo && pendiente && resumen && (
              <Accion
                texto={resumen.abiertas ? "Cerrar ventas" : "Reabrir ventas"}
                ejecutar={async () => {
                  if (!confirm("¿Cambiar el estado de las ventas?")) return;
                  await rpc("cambiar_apertura_ventas", {
                    p_rifa: r.id_rifa,
                    p_abrir: !resumen.abiertas,
                  });
                  recargar();
                }}
              />
            )}
            <Tombola
              alPintar={contarPelotas}
              muestra={numerosEsfera}
              mezcla={mezclando}
              salida={mezclando ? salida : undefined}
            />
            {pasos.length > 0 && (
              <div className="rondas">
                {pasos.map((e) => (
                  <div
                    key={String(e.id_extraccion)}
                    className={e.es_ganadora ? "premiado" : ""}
                  >
                    <small>Selección {e.orden_extraccion}</small>
                    <b>{valor(e)}</b>
                    <small>{e.es_ganadora ? "Ganador" : "No ganador"}</small>
                  </div>
                ))}
              </div>
            )}
            {mezclando && <p role="status">Mezclando los números…</p>}
            {ganador ? (
              <div aria-live="polite">
                <p>Número ganador</p>
                <div
                  className={
                    "bola " +
                    (mostrarCelebracion === premioId ? "celebracion" : "")
                  }
                >
                  <span className="pelota-seleccionada">
                    {numero(Number(ganador.numero))}
                  </span>{" "}
                  · {ganador.participante}
                </div>
                {pendiente ? (
                  <button
                    className="principal"
                    onClick={() => mostrar(pendiente.id_premio_rifa)}
                  >
                    Siguiente premio
                  </button>
                ) : (
                  <Accion
                    texto="Finalizar sorteo"
                    ejecutar={async () => {
                      await rpc("finalizar_sorteo", { p_rifa: r.id_rifa });
                      recargar();
                    }}
                  />
                )}
              </div>
            ) : (
              <>
                {ultimo && !mezclando && (
                  <div className="bola" aria-live="polite">
                    <span className="pelota-seleccionada">{valor(ultimo)}</span>{" "}
                    · Número no ganador
                  </div>
                )}
                {p.numero_extraccion_ganadora > 1 && (
                  <p>
                    {orden === p.numero_extraccion_ganadora
                      ? "Esta ronda elige al ganador."
                      : "Ronda " +
                        orden +
                        " de " +
                        p.numero_extraccion_ganadora +
                        ". El ganador se elige en la última ronda."}
                  </p>
                )}

                <Accion
                  deshabilitado={!consistente || mezclando}
                  ayuda="Sacar número"
                  texto={orden === 1 ? "Sortear" : "Sacar siguiente número"}
                  ejecutar={async () => {
                    mostrar(p.id_premio_rifa);
                    extraida(undefined);
                    fijar(resumen?.muestra ?? []);
                    animar(true);
                    try {
                      const claveSolicitud = p.id_premio_rifa + ":" + orden;
                      if (solicitud.current?.clave !== claveSolicitud)
                        solicitud.current = {
                          clave: claveSolicitud,
                          id: crypto.randomUUID(),
                        };
                      const resultado = await rpc<
                        Fila & { numeros_elegibles?: number[] }
                      >("extraer_numero_sorteo", {
                        p_rifa: r.id_rifa,
                        p_premio: p.id_premio_rifa,
                        p_orden: orden,
                        p_solicitud: solicitud.current.id,
                        p_elegibles: resumen?.muestra,
                      });
                      const oficiales = resultado.numeros_elegibles;
                      if (oficiales) fijar(previos =>
                        previos.length === oficiales.length && previos.every((n, i) => n === oficiales[i])
                          ? previos : oficiales,
                      );
                      const reducida = matchMedia(
                        "(prefers-reduced-motion: reduce)",
                      ).matches;
                      const [datos] = await Promise.all([
                        filas<Fila>("numero_rifa", [
                          "id_numero_rifa",
                          String(resultado.id_numero_rifa),
                        ]),
                        new Promise((ok) =>
                          setTimeout(ok, reducida ? 0 : 2200),
                        ),
                      ]);
                      const bola = datos.find(
                        (n) => n.id_numero_rifa === resultado.id_numero_rifa,
                      );
                      if (bola) {
                        extraida(Number(bola.numero));
                        if (!reducida)
                          await new Promise((ok) => setTimeout(ok, 850));
                      }
                      if (resultado?.es_ganadora) celebrar(p.id_premio_rifa);
                    } finally {
                      animar(false);
                      recargar();
                    }
                  }}
                />
              </>
            )}
          </>
        ) : (
          <p>Cargando premio…</p>
        )}
        {ganadores.length > 0 && (
          <details className="ganadores-pantalla">
            <summary>Ganadores anteriores</summary>
            {ganadores.map((g) => (
              <p key={String(g.orden_sorteo)}>
                {g.premio} · {numero(Number(g.numero))} · {g.participante}
              </p>
            ))}
          </details>
        )}
      </section>
      <h2>Ganadores</h2>
      {ganadores.map((g) => (
        <p key={String(g.orden_sorteo)}>
          {g.premio} · {numero(Number(g.numero))} · {g.participante}
        </p>
      ))}
      <h2>Historial de números seleccionados</h2>
      {extracciones
        .slice()
        .reverse()
        .map((e) => (
          <p key={String(e.id_extraccion)}>
            {premios.find(
              (p) =>
                p.id_premio_rifa === e.id_premio_rifa &&
                p.es_sorpresa &&
                p.estado !== "sorteado",
            )
              ? "Premio sorpresa"
              : premios.find((p) => p.id_premio_rifa === e.id_premio_rifa)
                  ?.nombre}{" "}
            ·{" "}
            {[
              "Primer número seleccionado",
              "Segundo número seleccionado",
              "Tercer número seleccionado",
            ][Number(e.orden_extraccion) - 1] ??
              "Número seleccionado " + e.orden_extraccion}{" "}
            · {valor(e)} ·{" "}
            {e.es_ganadora ? "Número ganador" : "Número no ganador"}
          </p>
        ))}
    </>
  );
}
