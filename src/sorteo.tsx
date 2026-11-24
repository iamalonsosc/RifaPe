import { Tombola } from "./tombola";
import { useState, useEffect, useRef } from "react";
import { Accion } from "./controles";
import {
  db,
  filas,
  rpc,
  numero,
  type Premio,
  type Rifa,
  type Fila,
} from "./datos";
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
  const [muestraInicial, previsualizar] = useState<number[]>([]);
  useEffect(() => {
    let vigente = true;
    if (r.estado === "activa" && db)
      void db
        .from("vw_numeros_por_persona")
        .select("numero")
        .eq("id_rifa", r.id_rifa)
        .eq("estado", "pagada")
        .order("numero")
        .limit(12)
        .then(({ data }) => {
          if (vigente) previsualizar((data ?? []).map((n) => Number(n.numero)));
        });
    return () => {
      vigente = false;
    };
  }, [r.id_rifa, r.estado, version]);
  const [salida, extraida] = useState<number>();
  const [mezclando, animar] = useState(false),
    [mostrarCelebracion, celebrar] = useState("");
  const [resumen, candidatos] = useState<{
    numeros: number;
    participantes: number;
    muestra: number[] | null;
  }>();
  const premioId = p?.id_premio_rifa;
  useEffect(() => {
    let vigente = true;
    candidatos(undefined);
    if (premioId && r.estado === "en_sorteo")
      rpc<NonNullable<typeof resumen>>("resumen_candidatos", {
        p_rifa: r.id_rifa,
        p_premio: premioId,
      })
        .then((x) => {
          if (vigente) candidatos(x);
        })
        .catch((e) => {
          if (vigente) error(e.message);
        });
    return () => {
      vigente = false;
    };
  }, [premioId, r.id_rifa, r.estado, version]);
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
            <Tombola muestra={muestraInicial} mezcla={false} />
            <p>
              Al iniciar se cierran las ventas y se fijan los premios y los
              números pagados.
            </p>
            {listo && (
              <Accion
                texto="Iniciar sorteo oficial"
                ejecutar={async () => {
                  if (!confirm("¿Cerrar ventas e iniciar el sorteo oficial?"))
                    throw Error("El sorteo sigue pendiente.");
                  await rpc("iniciar_sorteo", { p_rifa: r.id_rifa });
                  recargar();
                }}
              />
            )}
          </>
        ) : r.estado === "terminada" ? (
          <h2>Sorteo terminado</h2>
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
                {resumen.numeros} números habilitados · {resumen.participantes}{" "}
                participantes
              </p>
            )}
            <Tombola
              muestra={resumen?.muestra ?? []}
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
                  ayuda="Sacar número"
                  texto={orden === 1 ? "Sortear" : "Sacar siguiente número"}
                  ejecutar={async () => {
                    mostrar(p.id_premio_rifa);
                    extraida(undefined);
                    animar(true);
                    try {
                      const resultado = await rpc<Fila>(
                        "extraer_numero_sorteo",
                        {
                          p_rifa: r.id_rifa,
                          p_premio: p.id_premio_rifa,
                          p_orden: orden,
                          p_solicitud: crypto.randomUUID(),
                        },
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
