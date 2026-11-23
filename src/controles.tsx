import { useState, useRef, type ReactNode, type FormEvent } from "react";
export function Formulario({
  children,
  guardar,
  accion = "Guardar",
  limpiar = false,
}: {
  children: ReactNode;
  guardar: (f: FormData) => Promise<unknown>;
  accion?: string;
  limpiar?: boolean;
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
    <form onSubmit={enviar}>
      <fieldset disabled={ocupado}>
        {children}
        <button className="principal" type="submit">
          {ocupado ? "Procesando…" : accion}
        </button>
      </fieldset>
      <span role="status">{aviso}</span>
    </form>
  );
}
export function Campo({
  titulo,
  children,
}: {
  titulo: string;
  children: ReactNode;
}) {
  return (
    <label>
      {titulo}
      {children}
    </label>
  );
}
export function Accion({
  texto,
  ejecutar,
}: {
  texto: string;
  ejecutar: () => Promise<unknown>;
}) {
  return (
    <Formulario accion={texto} guardar={ejecutar}>
      {null}
    </Formulario>
  );
}
