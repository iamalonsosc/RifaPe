import { Clock, CheckCircle2, CircleDollarSign } from "lucide-react";
import { useState } from "react";
import { Campo, Formulario } from "./controles";
import { campo, fecha, soles, type Fila } from "./datos";
const medios: Record<string, string> = {
  yape: "Yape",
  plin: "Plin",
  efectivo: "Efectivo",
  otro: "Otro",
};
export type DatosResumen = {
  total: number;
  cobrado: number;
  cancelada: boolean;
  identidad: string;
  cantidad: number;
  movimientos: Fila[];
};
export function ResumenPagos({
  total,
  cobrado,
  cancelada,
  identidad,
  cantidad,
  movimientos,
}: DatosResumen) {
  let centimos = 0;
  const historial = [...movimientos]
    .sort(
      (a, b) =>
        Date.parse(String(a.fecha_pago)) - Date.parse(String(b.fecha_pago)) ||
        String(a.id_pago).localeCompare(String(b.id_pago)),
    )
    .map((p) => {
      centimos += Math.round(Number(p.importe) * 100);
      return { p, abonado: centimos / 100 };
    })
    .reverse();
  return (
    <section className="resumen-pagos">
      <h3>Resumen de pagos</h3>
      <p>{identidad}</p>
      <div className="indicadores-pago">
        {[
          [cantidad > 1 ? "Total de la venta" : "Precio del boleto", total],
          ["Total abonado", cobrado],
          ["Saldo pendiente", cancelada ? 0 : total - cobrado],
        ].map(([k, v]) => (
          <div key={k}>
            <small>{k}</small>
            <strong
              className={
                k === "Saldo pendiente" && Number(v) > 0
                  ? "saldo-abierto"
                  : undefined
              }
            >
              {soles(Number(v))}
            </strong>
          </div>
        ))}
      </div>
      <span
        className={
          "financiero " +
          (cancelada
            ? ""
            : cobrado === total
              ? "pagado"
              : cobrado
                ? "parcial"
                : "")
        }
      >
        {cobrado === total && !cancelada ? (
          <CheckCircle2 size={15} />
        ) : cobrado ? (
          <CircleDollarSign size={15} />
        ) : (
          <Clock size={15} />
        )}{" "}
        {cancelada
          ? "Venta cancelada"
          : cobrado === total
            ? "Pagado completamente"
            : cobrado
              ? "Abonado parcialmente"
              : "Pendiente de pago"}
      </span>
      <h4>Historial de pagos</h4>
      {historial.map(({ p, abonado }) => {
        const metodo = medios[String(p.medio_pago)] ?? "Otro";
        return (
          <article className="movimiento" key={String(p.id_pago)}>
            <span className={"medio " + p.medio_pago}>
              {metodo === "Efectivo" ? "S/" : metodo}
            </span>
            <div>
              <strong>
                {abonado < total
                  ? "Abono parcial"
                  : Number(p.importe) === total
                    ? "Pago completo"
                    : "Pago de saldo pendiente"}
              </strong>
              <small>{fecha(String(p.fecha_pago))}</small>
              <small>Método de pago · {metodo}</small>
              {p.referencia && <small>{p.referencia}</small>}
            </div>
            <div className="importes">
              <strong>+ {soles(Number(p.importe))}</strong>
              <small>Acumulado {soles(abonado)}</small>
              <small>Saldo {soles(total - abonado)}</small>
            </div>
          </article>
        );
      })}
      <small>
        {historial.length}{" "}
        {historial.length === 1
          ? "movimiento registrado"
          : "movimientos registrados"}
      </small>
    </section>
  );
}
export function FormularioAbono({
  saldo,
  total,
  identidad,
  guardar,
}: {
  saldo: number;
  total: number;
  identidad: string;
  guardar: (
    importe: number,
    medio: string,
    referencia: string,
  ) => Promise<void>;
}) {
  const [valor, poner] = useState("0.00"),
    [tocado, tocar] = useState(false);
  const importe = Number(valor),
    valido =
      /^[0-9]+(?:[.][0-9]{1,2})?$/.test(valor) &&
      importe > 0 &&
      importe <= saldo;
  const restante = (Math.round(saldo * 100) - Math.round(importe * 100)) / 100;
  const limpiar = () => {
    poner("0.00");
    tocar(false);
  };
  return (
    <Formulario
      clase="form-abono"
      accion="Registrar abono"
      deshabilitado={!valido}
      limpiar
      guardar={async (f) => {
        if (!valido) throw Error("Revisa el importe.");
        await guardar(importe, campo(f, "medio"), campo(f, "ref"));
        limpiar();
      }}
    >
      <h3>Registrar abono</h3>
      <small>{identidad}</small>
      <dl className="previa-pago">
        <dt>Precio total</dt>
        <dd>{soles(total)}</dd>
        <dt>Total abonado</dt>
        <dd>{soles(total - saldo)}</dd>
        <dt>Saldo pendiente</dt>
        <dd>{soles(saldo)}</dd>
      </dl>
      <div className="entrada-dinero">
        <button
          type="button"
          onClick={() => {
            poner(saldo.toFixed(2));
            tocar(true);
          }}
        >
          Pagar saldo completo
        </button>
        <Campo titulo="Importe del abono" ayuda="Abonar">
          <input
            aria-invalid={tocado && !valido}
            type="number"
            inputMode="decimal"
            step=".01"
            min=".01"
            max={saldo}
            value={valor}
            onFocus={(e) => e.target.select()}
            onChange={(e) => {
              poner(e.target.value);
              tocar(true);
            }}
            required
          />
        </Campo>
        <span aria-hidden="true">S/</span>
      </div>
      {tocado && !valido && (
        <small role="alert">
          Ingresa un importe mayor que cero, con hasta dos decimales y dentro
          del saldo disponible.
        </small>
      )}
      <Campo titulo="Método de pago" ayuda="Método">
        <select name="medio">
          {Object.entries(medios).map(([k, v]) => (
            <option value={k} key={k}>
              {v}
            </option>
          ))}
        </select>
      </Campo>
      <Campo titulo="Referencia (opcional)" ayuda="Referencia">
        <input name="ref" placeholder="Ej. Operación 00123456" />
      </Campo>
      <dl className="previa-pago">
        <dt>Saldo pendiente actual</dt>
        <dd>{soles(saldo)}</dd>
        <dt>Nuevo abono</dt>
        <dd>{soles(importe || 0)}</dd>
        <dt>Saldo después del abono</dt>
        <dd aria-live="polite">{valido || !importe ? soles(restante) : "—"}</dd>
      </dl>
      {valido && restante === 0 && (
        <p>El boleto quedará completamente pagado.</p>
      )}
      <button type="reset" onClick={limpiar}>
        Cancelar
      </button>
    </Formulario>
  );
}
