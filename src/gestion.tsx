import { EditorOfertas, AnularRifa, type Oferta } from "./ofertas";
import { ResumenPagos, type DatosResumen } from "./pagos";
import { Ayuda } from "./ayuda";
import { useEffect, useId, useState, useRef } from "react";
import { Campo, Formulario, Accion } from "./controles";
import {
  db,
  campo,
  filas,
  rpc,
  imagen,
  localPeru,
  fecha,
  soles,
  nombre,
  numero,
  type Persona,
  type Rifa,
  type Premio,
  resumenBoletos,
  type Fila,
  type Numero,
} from "./datos";
import { Operaciones } from "./operaciones";
import { Boletos } from "./boletos";
import { Sorteo } from "./sorteo";
function VentasEnVivo({ r, recargar }: { r: Rifa; recargar: () => void }) {
  const [permitir, cambiar] = useState(!!r.permitir_ventas_sorteo);
  const [importe, precio] = useState(
    String(r.precio_en_vivo ?? r.precio_numero),
  );
  return (
    <section>
      <h3>Ventas durante el sorteo</h3>
      <Formulario
        accion="Guardar ventas durante el sorteo"
        guardar={async (f) => {
          await rpc("configurar_ventas_sorteo", {
            p_rifa: r.id_rifa,
            p_permitir: permitir,
            p_precio: Number(f.get("precio") || r.precio_numero),
          });
          recargar();
        }}
      >
        <label className="interruptor">
          <input
            type="checkbox"
            role="switch"
            checked={permitir}
            onChange={(e) => cambiar(e.target.checked)}
          />{" "}
          Permitir ventas durante el sorteo
        </label>
        <p>Precio normal: {soles(r.precio_numero)}</p>
        <Campo titulo="Precio por número durante el sorteo (S/)">
          <input
            type="number"
            name="precio"
            step=".01"
            min=".01"
            required={permitir}
            disabled={!permitir}
            value={importe}
            onChange={(e) => precio(e.target.value)}
          />
        </Campo>
        {permitir && (
          <p>
            {Number(importe) > 0 &&
              Number(importe) < r.precio_numero &&
              "Descuento del " +
                Number(
                  ((1 - Number(importe) / r.precio_numero) * 100).toFixed(2),
                ) +
                "%. "}
            {r.incluir_numeros_sin_pagar
              ? "Cada venta registrada participa desde la siguiente extracción elegible."
              : "Los nuevos números pagados participarán desde la siguiente extracción elegible."}
          </p>
        )}
      </Formulario>
    </section>
  );
}
export function EditarRifa({
  r,
  alGuardar,
}: {
  r?: Rifa;
  alGuardar: (id: string) => void;
}) {
  const [ofertas, cambiar] = useState<Oferta[]>([]),
    [base, precio] = useState(r?.precio_numero ?? 0),
    [listas, listo] = useState(!r),
    [error, avisar] = useState("");
  useEffect(() => {
    if (!r) return;
    let vivo = true;
    listo(false);
    filas<Oferta>("oferta_rifa", ["id_rifa", r.id_rifa], "cantidad")
      .then((o) => {
        if (vivo) {
          cambiar(o);
          listo(true);
        }
      })
      .catch((e) => {
        if (vivo) avisar(e.message);
      });
    return () => {
      vivo = false;
    };
  }, [r]);
  return (
    <section>
      {error && <p role="alert">{error}</p>}
      <Formulario
        deshabilitado={!listas}
        guardar={async (f) =>
          alGuardar(
            await rpc<string>("guardar_rifa_ofertas", {
              p_ofertas: ofertas,
              p_nombre: campo(f, "nombre"),
              p_descripcion: campo(f, "descripcion"),
              p_precio: Number(f.get("precio")),
              p_cantidad: Number(f.get("cantidad")),
              p_fecha: campo(f, "fecha") + ":00-05:00",
              p_regla: campo(f, "regla"),
              p_imagen: await imagen(f, "foto", r?.imagen_premio_url),
              p_rifa: r?.id_rifa ?? null,
            }),
          )
        }
      >
        <Campo titulo="Nombre">
          <input name="nombre" required defaultValue={r?.nombre} />
        </Campo>
        <Campo titulo="Descripción">
          <input name="descripcion" defaultValue={r?.descripcion || ""} />
        </Campo>
        <Campo titulo="Precio por número (S/)">
          <input
            name="precio"
            type="number"
            min=".01"
            step=".01"
            value={base || ""}
            onChange={(e) => precio(Number(e.target.value))}
            required
          />
        </Campo>
        <Campo titulo="Cantidad de números">
          <input
            name="cantidad"
            type="number"
            list="cantidades"
            min={r?.cantidad_numeros ?? 1}
            max={100000}
            defaultValue={r?.cantidad_numeros ?? 100}
            required
          />
          <datalist id="cantidades">
            <option>50</option>
            <option>100</option>
            <option>200</option>
          </datalist>
        </Campo>
        <Campo titulo="Fecha y hora de la rifa">
          <input
            type="datetime-local"
            name="fecha"
            required
            defaultValue={r ? localPeru(r.fecha_sorteo) : ""}
          />
        </Campo>
        <Campo titulo="Regla de ganadores">
          <select name="regla" defaultValue={r?.regla_ganador}>
            <option value="numero">Un premio por número</option>
            <option value="persona">Un premio por persona</option>
            <option value="repeticion">Permitir repetición</option>
          </select>
        </Campo>
        <Campo titulo="Imagen de la rifa · 1200 × 1200 px recomendados">
          <input
            name="foto"
            type="file"
            accept="image/png,image/webp,image/jpeg"
          />
        </Campo>
        <EditorOfertas lista={ofertas} cambiar={cambiar} base={base} />
      </Formulario>
    </section>
  );
}
function EditorPremio({
  r,
  p,
  siguiente,
  premios,
  recargar,
}: {
  r: Rifa;
  p?: Premio;
  siguiente: number;
  premios: Premio[];
  recargar: () => void;
}) {
  const sorpresaId = useId();
  const [destacar, cambiar] = useState(p?.prioridad != null);
  const ocupados = premios.filter(
    (x) => x.prioridad != null && x.id_premio_rifa !== p?.id_premio_rifa,
  );
  const prioridades = Array.from(
    new Set([
      ...Array.from(
        { length: Math.max(3, premios.length + 1) },
        (_, i) => i + 1,
      ),
      ...premios.flatMap((x) => (x.prioridad ? [x.prioridad] : [])),
    ]),
  ).sort((a, b) => a - b);
  return (
    <Formulario
      limpiar={!p}
      guardar={async (f) => {
        await rpc("guardar_premio_con_prioridad", {
          p_rifa: r.id_rifa,
          p_premio: p?.id_premio_rifa ?? null,
          p_nombre: campo(f, "nombre"),
          p_descripcion: campo(f, "desc"),
          p_imagen: await imagen(f, "foto", p?.imagen_url),
          p_orden: Number(f.get("orden")),
          p_extraccion: Number(f.get("extraccion")),
          p_sorpresa: f.has("sorpresa"),
          p_prioridad: destacar ? Number(f.get("prioridad")) : null,
        });
        recargar();
      }}
    >
      <Campo titulo="Nombre del premio">
        <input name="nombre" required defaultValue={p?.nombre} />
      </Campo>
      <Campo titulo="Descripción">
        <input name="desc" defaultValue={p?.descripcion || ""} />
      </Campo>
      <Campo titulo="Posición">
        <input
          type="number"
          name="orden"
          min="1"
          required
          defaultValue={p?.orden_sorteo ?? siguiente}
        />
      </Campo>
      <Campo titulo="Número ganador" ayuda="Número ganador">
        <input
          name="extraccion"
          type="number"
          min="1"
          required
          defaultValue={p?.numero_extraccion_ganadora ?? 1}
        />
      </Campo>
      <div className="interruptor">
        <span className="etiqueta">
          <label htmlFor={sorpresaId}>Sorpresa</label>
          <Ayuda tema="Sorpresa" />
        </span>
        <input
          role="switch"
          name="sorpresa"
          id={sorpresaId}
          type="checkbox"
          defaultChecked={p?.es_sorpresa}
        />
      </div>
      <label className="interruptor">
        Destacar en boleto
        <input
          role="switch"
          type="checkbox"
          checked={destacar}
          onChange={(e) => cambiar(e.target.checked)}
        />
      </label>
      {destacar && (
        <Campo titulo="Prioridad en el boleto" ayuda="Prioridad">
          <select
            name="prioridad"
            defaultValue={
              p?.prioridad ??
              prioridades.find((n) => !ocupados.some((x) => x.prioridad === n))
            }
          >
            {prioridades.map((n) => {
              const otro = ocupados.find((x) => x.prioridad === n);
              return (
                <option key={n} value={n} disabled={!!otro && !p?.prioridad}>
                  {n}
                  {otro
                    ? " · " +
                      otro.nombre +
                      (p?.prioridad ? " (intercambiar)" : "")
                    : ""}
                </option>
              );
            })}
          </select>
        </Campo>
      )}
      <Campo titulo="Foto del premio · 800 × 800 px recomendados">
        <input
          type="file"
          name="foto"
          accept="image/png,image/jpeg,image/webp"
        />
      </Campo>
    </Formulario>
  );
}
export function PanelRifa({
  rifa: r,
  version,
  recargar,
}: {
  rifa: Rifa;
  version: number;
  recargar: () => void;
}) {
  const [tab, set] = useState("Premios"),
    [premios, guardar] = useState<Premio[]>([]),
    [err, error] = useState("");
  useEffect(() => {
    let vivo = true;
    filas<Premio>("vw_premios_rifa", ["id_rifa", r.id_rifa], "orden_sorteo")
      .then((p) => {
        if (vivo) {
          guardar(p);
          error("");
        }
      })
      .catch((e) => error(e.message));
    return () => {
      vivo = false;
    };
  }, [r.id_rifa, version]);
  const refrescar = useRef(recargar);
  useEffect(() => {
    refrescar.current = recargar;
  }, [recargar]);
  useEffect(() => {
    if (
      tab !== "Números y ventas" ||
      !["activa", "en_sorteo"].includes(r.estado)
    )
      return;
    let vigente = true,
      timer: ReturnType<typeof setTimeout>;
    async function consultarApertura() {
      if (!document.hidden && db) {
        const { data } = await db
          .from("rifa")
          .select("estado,ventas_abiertas")
          .eq("id_rifa", r.id_rifa)
          .maybeSingle();
        if (
          vigente &&
          data &&
          (data.estado !== r.estado ||
            !!data.ventas_abiertas !== !!r.ventas_abiertas)
        )
          refrescar.current();
      }
      if (vigente) timer = setTimeout(consultarApertura, 3500);
    }
    function enfocar() {
      refrescar.current();
    }
    timer = setTimeout(consultarApertura, 3500);
    window.addEventListener("focus", enfocar);
    return () => {
      vigente = false;
      clearTimeout(timer);
      window.removeEventListener("focus", enfocar);
    };
  }, [r.id_rifa, r.estado, r.ventas_abiertas, tab]);
  return (
    <>
      <p className="ceja">{r.estado.toUpperCase().replace("_", " ")}</p>
      <h1>{r.nombre}</h1>
      {r.token_consulta && (
        <a href={"/rifa/" + r.token_consulta} target="_blank" rel="noreferrer">
          Abrir página pública de la rifa
        </a>
      )}
      <p>
        {fecha(r.fecha_sorteo)} · {soles(r.precio_numero)} por número
      </p>
      {r.imagen_premio_url && (
        <img
          className="foto"
          src={r.imagen_premio_url}
          alt="Premio de la rifa"
        />
      )}
      <div className="pestanas">
        {[
          "Premios",
          "Números y ventas",
          "Boletos",
          "Sorteo",
          "Configuración",
        ].map((s) => (
          <button key={s} aria-pressed={s === tab} onClick={() => set(s)}>
            {s}
          </button>
        ))}
      </div>
      {err && <p role="alert">{err}</p>}
      {tab === "Configuración" &&
        ["activa", "en_sorteo"].includes(r.estado) && (
          <AnularRifa
            id={r.id_rifa}
            nombre={r.nombre}
            enSorteo={r.estado === "en_sorteo"}
            recargar={recargar}
          />
        )}
      {tab === "Configuración" ? (
        r.estado === "activa" ? (
          <>
            <section>
              <h3>Participación en el sorteo</h3>
              <Formulario
                accion="Guardar participación"
                guardar={async (f) => {
                  await rpc("configurar_participacion", {
                    p_rifa: r.id_rifa,
                    p_incluir: f.has("incluir"),
                  });
                  recargar();
                }}
              >
                <label className="interruptor">
                  <input key={String(r.incluir_numeros_sin_pagar) + r.id_rifa}
                    type="checkbox" role="switch" name="incluir"
                    defaultChecked={!!r.incluir_numeros_sin_pagar} />
                  Incluir Números sin pagar
                </label>
                <p>Al activarlo, participan las ventas vigentes con o sin abonos y las reservas vigentes. Al desactivarlo, solo participan las ventas pagadas al 100 %.</p>
              </Formulario>
            </section>
            <VentasEnVivo r={r} recargar={recargar} />
            <EditarRifa r={r} alGuardar={recargar} />
            <Accion
              texto="Eliminar rifa sin movimientos"
              ejecutar={async () => {
                if (confirm("¿Eliminar esta rifa y sus premios?")) {
                  await rpc("eliminar_rifa_sin_movimientos", {
                    p_rifa: r.id_rifa,
                  });
                  recargar();
                }
              }}
            />
          </>
        ) : (
          <p>
            {r.estado === "anulada"
              ? "La rifa fue anulada. Puedes gestionar las devoluciones desde Números y ventas."
              : "La configuración quedó fijada al iniciar el sorteo."}
          </p>
        )
      ) : tab === "Premios" ? (
        <>
          <h2>Premios en orden de sorteo</h2>
          {premios.map((p) => (
            <details key={p.id_premio_rifa}>
              <summary>
                {p.orden_sorteo}. {p.nombre} · número ganador en la selección{" "}
                {p.numero_extraccion_ganadora}
                {p.es_sorpresa ? " · Sorpresa" : ""}
              </summary>
              {(p.es_sorpresa || p.imagen_url) && (
                <img
                  className="foto"
                  src={p.es_sorpresa ? "/regalo-sorpresa.svg" : p.imagen_url!}
                  alt={p.es_sorpresa ? "Premio sorpresa" : p.nombre}
                />
              )}
              <p>{p.descripcion}</p>
              {r.estado === "activa" && (
                <>
                  <EditorPremio
                    key={JSON.stringify(p)}
                    premios={premios}
                    r={r}
                    p={p}
                    siguiente={1}
                    recargar={recargar}
                  />
                  <Accion
                    texto="Eliminar premio"
                    ejecutar={async () => {
                      if (confirm("¿Eliminar este premio?")) {
                        await rpc("eliminar_premio", {
                          p_rifa: r.id_rifa,
                          p_premio: p.id_premio_rifa,
                        });
                        recargar();
                      }
                    }}
                  />
                </>
              )}
            </details>
          ))}
          {r.estado === "activa" && (
            <section>
              <details>
                <summary>Agregar sorteo por puestos</summary>
                <Formulario
                  accion="Agregar los tres puestos"
                  limpiar
                  guardar={async (f) => {
                    await rpc("agregar_puestos", {
                      p_rifa: r.id_rifa,
                      p_tercero: campo(f, "tercero"),
                      p_segundo: campo(f, "segundo"),
                      p_primero: campo(f, "primero"),
                    });
                    recargar();
                  }}
                >
                  <p>
                    Se sortearán en este orden. Puedes editar la foto y la
                    prioridad de cada puesto después.
                  </p>
                  {["tercero", "segundo", "primero"].map((puesto) => (
                    <Campo key={puesto} titulo={"Premio del puesto " + puesto}>
                      <input name={puesto} required />
                    </Campo>
                  ))}
                </Formulario>
              </details>
              <h3>Agregar premio</h3>
              <EditorPremio
                key={premios.length}
                premios={premios}
                r={r}
                siguiente={(premios.at(-1)?.orden_sorteo ?? 0) + 1}
                recargar={recargar}
              />
            </section>
          )}
        </>
      ) : tab === "Números y ventas" ? (
        <Operaciones r={r} version={version} recargar={recargar} />
      ) : tab === "Sorteo" ? (
        <Sorteo r={r} premios={premios} version={version} recargar={recargar} />
      ) : (
        <Boletos
          premios={premios}
          r={r}
          version={version}
          recargar={recargar}
        />
      )}
    </>
  );
}
import { normalizar } from "./seleccion-persona";
export function Participantes({
  version,
  recargar,
}: {
  version: number;
  recargar: () => void;
}) {
  const [ps, set] = useState<Persona[]>([]),
    [busca, buscar] = useState(""),
    [id, abrir] = useState(""),
    [edicion, editar] = useState(""),
    [finanzas, guardarFinanzas] = useState<DatosResumen[]>([]),
    [hist, guardar] = useState<string[]>([]),
    [err, error] = useState("");
  useEffect(() => {
    filas<Persona>("persona", undefined, "id_persona")
      .then(set)
      .catch((e) => error(e.message));
  }, [version]);
  useEffect(() => {
    let vivo = true;
    async function ficha() {
      if (!id) return;
      const ventas = await filas<Fila>(
        "vw_detalle_ventas",
        ["id_persona", id],
        "id_detalle_venta",
      );
      const rifas = await filas<Rifa>("rifa", undefined, "id_rifa");
      const resultados = await filas<Fila>(
        "vw_historial_ganadores",
        ["id_persona", id],
        "fecha_resultado",
      );
      const mostrar = (i: unknown) =>
        rifas.find((r) => r.id_rifa === i)?.nombre || "Rifa";
      const textos: string[] = [];
      const cuentas: DatosResumen[] = [];
      const ajustes = await filas<Fila>(
        "vw_anulaciones_parciales",
        ["id_persona", id],
        "fecha",
      );
      ajustes.forEach((a) =>
        textos.push(
          mostrar(a.id_rifa) +
            " · Anulación parcial · " +
            fecha(String(a.fecha)) +
            " · " +
            a.motivo +
            " · Venta " +
            a.id_venta +
            " · " +
            soles(Number(a.total_anterior)) +
            " → " +
            soles(Number(a.total_nuevo)),
        ),
      );
      for (const venta of new Set(ventas.map((v) => String(v.id_venta)))) {
        const lineas = ventas.filter((v) => v.id_venta === venta);
        const pagos = await filas<Fila>(
          "vw_pagos_historicos",
          ["id_venta", venta],
          "id_pago",
        );
        const neto = await rpc<number>("cobro_vigente", { p_venta: venta });
        cuentas.push({
          cantidad: lineas.length,
          total: Number(lineas[0].total),
          cobrado:
            lineas[0].estado === "cancelada"
              ? pagos.reduce((a, p) => a + Number(p.importe), 0)
              : Number(neto),
          anulada: lineas[0].estado_antes_anulacion === "pagada",
          cancelada: lineas[0].estado === "cancelada",
          identidad: [
            mostrar(lineas[0].id_rifa),
            fecha(String(lineas[0].fecha_venta)),
            ...(lineas[0].fecha_cancelacion
              ? [
                  fecha(String(lineas[0].fecha_cancelacion)),
                  "Importe original " +
                    soles(Number(lineas[0].total_original ?? lineas[0].total)),
                  lineas[0].motivo_anulacion,
                  "Venta " + venta,
                  "Responsable " +
                    (lineas[0].responsable_anulacion ?? "sin registro"),
                  "Boletos " +
                    lineas
                      .map((l) => l.id_boleto)
                      .filter(Boolean)
                      .join(", "),
                ]
              : []),
            resumenBoletos(lineas, []),
            lineas
              .map(
                (v) =>
                  "N.º " +
                  numero(Number(v.numero)) +
                  (v.estado_detalle === "cancelado" ? " (anulado)" : ""),
              )
              .join(", "),
          ].join(" · "),
          movimientos: pagos,
        });
      }
      const boletos = await filas<{
        id_rifa: string;
        token_grupo: string;
        estado: string;
        numeros: number[];
      }>("vw_comprobantes", ["id_persona", id], "token_grupo");
      boletos.forEach((b) =>
        textos.push(
          mostrar(b.id_rifa) +
            " · Boleto agrupado " +
            b.estado +
            " · " +
            b.numeros.map(numero).join(", "),
        ),
      );
      resultados.forEach((p) =>
        textos.push(
          mostrar(p.id_rifa) +
            " · Ganó " +
            p.premio +
            " con " +
            numero(Number(p.numero)),
        ),
      );
      if (vivo) {
        guardar(textos);
        guardarFinanzas(cuentas);
      }
    }
    guardar([]);
    void ficha().catch((e) => error(e.message));
    return () => {
      vivo = false;
    };
  }, [id, version]);
  const [limite, ampliar] = useState(20);
  const filtrados = ps
    .filter((p) =>
      normalizar(nombre(p) + " " + (p.telefono || "")).includes(
        normalizar(busca),
      ),
    )
    .sort((a, b) => nombre(a).localeCompare(nombre(b), "es"));
  const actual = ps.find((p) => p.id_persona === id);
  function enfocarFicha() {
    requestAnimationFrame(() =>
      document
        .getElementById("ficha-participante")
        ?.scrollIntoView({ block: "start" }),
    );
  }
  async function eliminar(p: Persona) {
    if (!confirm("¿Eliminar a " + nombre(p) + " del directorio?")) return;
    try {
      await rpc("eliminar_persona", { p_persona: p.id_persona });
      if (id === p.id_persona) abrir("");
      if (edicion === p.id_persona) editar("");
      error("");
      recargar();
    } catch (e) {
      error((e as Error).message);
    }
  }
  function acciones(p: Persona) {
    return (
      <div className="acciones-persona">
        <button
          onClick={() => {
            editar(p.id_persona);
            abrir(p.id_persona);
            enfocarFicha();
          }}
        >
          Editar
        </button>
        <button onClick={() => eliminar(p)}>Eliminar</button>
      </div>
    );
  }
  return (
    <>
      <h1>Participantes</h1>
      <p>{ps.length} participantes registrados</p>
      <Campo titulo="Buscar por nombre o teléfono">
        <input
          type="search"
          value={busca}
          onChange={(e) => {
            buscar(e.target.value);
            ampliar(20);
          }}
        />
      </Campo>
      {err && <p role="alert">{err}</p>}
      <div className="directorio">
        {filtrados.slice(0, limite).map((p) => (
          <div className="persona-fila" key={p.id_persona}>
            <div>
              <strong>{nombre(p)}</strong>
              <small>{p.telefono || "Sin teléfono"}</small>
            </div>
            <div className="acciones-persona">
              <button
                onClick={() => {
                  abrir(p.id_persona);
                  editar("");
                  enfocarFicha();
                }}
                aria-label={"Consultar a " + nombre(p)}
              >
                Consultar
              </button>
              {acciones(p)}
            </div>
          </div>
        ))}
      </div>
      {!filtrados.length && <p>Sin participantes que mostrar.</p>}
      {filtrados.length > limite && (
        <button onClick={() => ampliar(limite + 20)}>
          Mostrar más participantes
        </button>
      )}
      {actual && (
        <section id="ficha-participante">
          <h2>{nombre(actual)}</h2>
          <p>{actual.telefono}</p>
          {acciones(actual)}
          {edicion === actual.id_persona && (
            <Formulario
              key={edicion}
              accion="Guardar cambios"
              guardar={async (f) => {
                const nombres = campo(f, "nombres");
                if (!nombres) throw Error("Escribe el nombre.");
                await rpc("guardar_persona", {
                  p_persona: edicion,
                  p_nombres: nombres,
                  p_apellidos: campo(f, "apellidos") || null,
                  p_telefono: campo(f, "telefono") || null,
                });
                editar("");
                error("");
                recargar();
              }}
            >
              <Campo titulo="Nombres">
                <input name="nombres" required defaultValue={actual.nombres} />
              </Campo>
              <Campo titulo="Apellidos">
                <input name="apellidos" defaultValue={actual.apellidos || ""} />
              </Campo>
              <Campo titulo="Teléfono">
                <input
                  name="telefono"
                  type="tel"
                  defaultValue={actual.telefono || ""}
                />
              </Campo>
              <button type="button" onClick={() => editar("")}>
                Cancelar
              </button>
            </Formulario>
          )}
          {finanzas.map((cuenta, i) => (
            <ResumenPagos key={i} {...cuenta} />
          ))}
          {hist.length
            ? hist.map((s, i) => <p key={i}>{s}</p>)
            : !finanzas.length && <p>Sin movimientos registrados.</p>}
        </section>
      )}
      <section>
        <h2>Registrar participante</h2>
        <Formulario
          limpiar
          guardar={async (f) => {
            const n = campo(f, "nombres"),
              a = campo(f, "apellidos"),
              tel = campo(f, "telefono");
            if (
              ps.some(
                (p) =>
                  nombre(p).toLowerCase() ===
                    [n, a].filter(Boolean).join(" ").toLowerCase() ||
                  (tel && p.telefono === tel),
              ) &&
              !confirm(
                "Ya existe una coincidencia. ¿Crear una persona distinta?",
              )
            )
              throw Error("Selecciona la persona existente.");
            const nuevo = await rpc<string>("guardar_persona", {
              p_nombres: n,
              p_apellidos: a || null,
              p_telefono: tel || null,
            });
            abrir(nuevo);
            recargar();
          }}
        >
          <Campo titulo="Nombres">
            <input name="nombres" required />
          </Campo>
          <Campo titulo="Apellidos">
            <input name="apellidos" />
          </Campo>
          <Campo titulo="Teléfono">
            <input name="telefono" type="tel" />
          </Campo>
        </Formulario>
      </section>
    </>
  );
}
export type { Numero };
