import { Ayuda, type TemaAyuda } from "./ayuda";
import {
  useState,
  useRef,
  useId,
  cloneElement,
  isValidElement,
  type ReactElement,
  type ReactNode,
  type FormEvent,
} from "react";
export function Formulario({
  children,
  guardar,
  accion = "Guardar",
  limpiar = false,
  deshabilitado = false,
  ayuda,
  clase,
}: {
  children: ReactNode;
  guardar: (f: FormData) => Promise<unknown>;
  accion?: string;
  clase?: string;
  limpiar?: boolean;
  deshabilitado?: boolean;
  ayuda?: TemaAyuda;
}) {
  const [ocupado, set] = useState(false),
    [aviso, msg] = useState("");
  const bloqueo = useRef(false);
  async function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (bloqueo.current) return;
    bloqueo.current = true;
    const form = e.currentTarget;
    set(true);
    msg("");
    try {
      await guardar(new FormData(form));
      if (limpiar) form.reset();
      msg("Guardado.");
    } catch (err) {
      msg(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      set(false);
      bloqueo.current = false;
    }
  }
  return (
    <form className={clase} onSubmit={enviar}>
      <fieldset disabled={ocupado}>
        {children}
        <span className="accion-form">
          <button disabled={deshabilitado} className="principal" type="submit">
            {ocupado ? "Procesando…" : accion}
          </button>
          {ayuda && <Ayuda tema={ayuda} />}
        </span>
      </fieldset>
      <span role="status">{aviso}</span>
    </form>
  );
}
export function Campo({
  titulo,
  ayuda,
  children,
}: {
  titulo: string;
  ayuda?: TemaAyuda;
  children: ReactNode;
}) {
  const id = useId();
  if (ayuda && isValidElement(children))
    return (
      <div className="campo-ayuda">
        <span className="etiqueta">
          <label htmlFor={id}>{titulo}</label>
          <Ayuda tema={ayuda} />
        </span>
        {cloneElement(children as ReactElement<{ id: string }>, { id })}
      </div>
    );
  return (
    <label>
      <span className="etiqueta">{titulo}</span>
      {children}
    </label>
  );
}
export function Accion({
  texto,
  deshabilitado,
  ayuda,
  ejecutar,
}: {
  texto: string;
  deshabilitado?: boolean;
  ayuda?: TemaAyuda;
  ejecutar: () => Promise<unknown>;
}) {
  return (
    <Formulario
      deshabilitado={deshabilitado}
      ayuda={ayuda}
      accion={texto}
      guardar={ejecutar}
    >
      {null}
    </Formulario>
  );
}
