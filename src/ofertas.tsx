import { useState, useEffect } from "react";
import { rpc, soles, numero, type Fila } from "./datos";
import { Formulario, Campo } from "./controles";
export interface Oferta {
  id_oferta?: string;
  cantidad: number;
  precio: number;
  activa: boolean;
}
export interface Cotizacion {
  total: number;
  ofertas: { cantidad: number; precio: number; veces: number }[];
}
export function EditorOfertas({
  lista,
  cambiar,
  base,
}: {
  lista: Oferta[];
  cambiar: (v: Oferta[]) => void;
  base: number;
}) {
  function editar(i: number, v: Partial<Oferta>) {
    cambiar(lista.map((o, j) => (j === i ? { ...o, ...v } : o)));
  }
  return (
    <fieldset className="ofertas">
      <legend>Ofertas y promociones</legend>
      {lista.map((o, i) => (
        <div key={o.id_oferta ?? i}>
          <Campo titulo="Cantidad de números">
            <input
              type="number"
              min={2}
              step={1}
              required
              value={o.cantidad || ""}
              onChange={(e) => editar(i, { cantidad: Number(e.target.value) })}
            />
          </Campo>
          <Campo titulo="Precio de la oferta">
            <input
              type="number"
              min=".01"
              step=".01"
              max={
                o.activa
                  ? (Math.round(base * o.cantidad * 100) - 1) / 100
                  : undefined
              }
              required
              value={o.precio || ""}
              onChange={(e) => editar(i, { precio: Number(e.target.value) })}
            />
          </Campo>
          <label>
            <input
              type="checkbox"
              checked={o.activa}
              onChange={(e) => editar(i, { activa: e.target.checked })}
            />
            Activa
          </label>
          <span>
            Normal {soles(base * o.cantidad)} · Ahorro{" "}
            {soles(base * o.cantidad - o.precio)}
          </span>
        </div>
      ))}
      <button
        type="button"
        onClick={() =>
          cambiar([...lista, { cantidad: 2, precio: 0, activa: true }])
        }
      >
        Agregar oferta
      </button>
    </fieldset>
  );
}
export function ResumenCompra({
  base,
  cantidad,
  seleccion,
  ofertas,
  cotizacion,
}: {
  base: number;
  cantidad: number;
  seleccion: number[];
  ofertas: Oferta[];
  cotizacion?: Cotizacion;
}) {
  const proxima = ofertas.find((o) => o.cantidad > cantidad);
  return (
    <div className="cotizacion">
      {ofertas.length > 0 && (
        <>
          <h4>Ofertas disponibles</h4>
          {ofertas.map((o) => (
            <p key={o.cantidad}>
              {o.cantidad} números por {soles(o.precio)} · Normal{" "}
              {soles(base * o.cantidad)} · Ahorro{" "}
              {soles(base * o.cantidad - o.precio)}
            </p>
          ))}
        </>
      )}
      {cantidad > 0 && (
        <>
          <h4>Resumen de compra</h4>
          <p>{seleccion.map(numero).join(" · ")}</p>
          <p>
            Precio individual {soles(base)} · Subtotal {soles(base * cantidad)}
          </p>
          {cotizacion ? (
            <>
              {cotizacion.ofertas.map((o) => (
                <p key={o.cantidad}>
                  {o.veces} × oferta de {o.cantidad} por {soles(o.precio)}
                </p>
              ))}
              <p>Ahorro {soles(base * cantidad - cotizacion.total)}</p>
              <strong>Total a pagar {soles(cotizacion.total)}</strong>
            </>
          ) : (
            <p>Consultando precio…</p>
          )}
          {proxima && (
            <p>
              Agrega {proxima.cantidad - cantidad} más para la oferta de{" "}
              {proxima.cantidad} por {soles(proxima.precio)}.
            </p>
          )}
          <p>Los números se agrupan en el boleto del participante.</p>
        </>
      )}
    </div>
  );
}
export function CancelarNumeros({
  lineas,
  venta,
  recargar,
}: {
  lineas: Fila[];
  venta: string;
  recargar: () => void;
}) {
  const [ids, elegir] = useState<string[]>([]);
  if (lineas.length < 2) return null;
  return (
    <details>
      <summary>Cancelar números de esta venta</summary>
      <Formulario
        accion="Revisar cancelación"
        deshabilitado={!ids.length}
        guardar={async (f) => {
          const args = { p_venta: venta, p_detalles: ids };
          const c = await rpc<{
            total: number;
            cobrado: number;
            saldo: number;
            devolver: number;
          }>("ajustar_numeros_venta", args);
          if (
            !confirm(
              "Nuevo total " +
                soles(c.total) +
                " · Saldo " +
                soles(c.saldo) +
                " · Por devolver " +
                soles(c.devolver) +
                ". ¿Confirmar cancelación?",
            )
          )
            throw Error("Operación cancelada.");
          await rpc("ajustar_numeros_venta", {
            ...args,
            p_confirmar: true,
            p_motivo: f.get("motivo"),
            p_total_esperado: c.total,
            p_cobrado_esperado: c.cobrado,
          });
          elegir([]);
          recargar();
        }}
      >
        {lineas.map((l) => (
          <label key={String(l.id_detalle_venta)}>
            <input
              type="checkbox"
              checked={ids.includes(String(l.id_detalle_venta))}
              onChange={(e) =>
                elegir(
                  e.target.checked
                    ? [...ids, String(l.id_detalle_venta)]
                    : ids.filter((id) => id !== l.id_detalle_venta),
                )
              }
            />
            {numero(Number(l.numero))}
          </label>
        ))}
        <Campo titulo="Motivo">
          <input required name="motivo" />
        </Campo>
      </Formulario>
    </details>
  );
}
export function AnularRifa({
  id,
  nombre,
  enSorteo,
  recargar,
}: {
  id: string;
  nombre: string;
  enSorteo: boolean;
  recargar: () => void;
}) {
  const [abierto, abrir] = useState(false),
    [resumen, guardar] = useState<{
      asignados: number;
      personas: number;
      cobrado: number;
    }>(),
    [error, avisar] = useState("");
  useEffect(() => {
    if (!abierto) return;
    let vivo = true;
    rpc<{ asignados: number; personas: number; cobrado: number }>(
      "resumen_anulacion",
      { p_rifa: id },
    )
      .then((v) => {
        if (vivo) guardar(v);
      })
      .catch((e) => {
        if (vivo) avisar(e.message);
      });
    return () => {
      vivo = false;
    };
  }, [abierto, id]);
  return abierto ? (
    <section role="dialog" aria-label="Anular rifa">
      <h3>Anular {nombre}</h3>
      {error && <p role="alert">{error}</p>}
      {resumen && (
        <>
          <p>
            {resumen.asignados} números asignados · {resumen.personas}{" "}
            participantes · Recaudado {soles(resumen.cobrado)}
          </p>
          <p>
            Se cerrarán las operaciones y los pagos quedarán pendientes de
            devolución.
          </p>
          <Formulario
            accion="Confirmar anulación"
            guardar={async (f) => {
              await rpc("anular_rifa", {
                p_rifa: id,
                p_motivo: f.get("motivo"),
                p_confirmacion: f.get("confirmacion"),
              });
              recargar();
            }}
          >
            <Campo titulo="Motivo de anulación">
              <input required name="motivo" />
            </Campo>
            {enSorteo && (
              <Campo titulo="Confirma escribiendo el nombre exacto de la rifa">
                <input required name="confirmacion" />
              </Campo>
            )}
          </Formulario>
        </>
      )}
      <button onClick={() => abrir(false)}>Volver</button>
    </section>
  ) : (
    <button onClick={() => abrir(true)}>Anular rifa</button>
  );
}
