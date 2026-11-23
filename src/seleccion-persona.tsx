import { useEffect, useMemo, useState } from "react";
import { Campo, Formulario } from "./controles";
import { campo, nombre, rpc, type Persona } from "./datos";

export function normalizar(texto: string) {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

export function SeleccionPersona({
  personas,
  seleccion,
  elegir,
}: {
  personas: Persona[];
  seleccion: Persona | null;
  elegir: (p: Persona | null) => void;
}) {
  const [texto, buscar] = useState(""),
    [termino, filtrar] = useState(""),
    [alta, registrar] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => filtrar(normalizar(texto)), 250);
    return () => clearTimeout(timer);
  }, [texto]);
  const resultados = useMemo(
    () =>
      termino.length >= 3
        ? personas
            .filter((p) => normalizar(nombre(p)).includes(termino))
            .slice(0, 12)
        : [],
    [termino, personas],
  );
  function seleccionar(p: Persona) {
    elegir(p);
    registrar(false);
    buscar("");
  }
  if (seleccion)
    return (
      <div className="persona-fila">
        <div>
          <strong>{nombre(seleccion)}</strong>
          <small>{seleccion.telefono}</small>
        </div>
        <button onClick={() => elegir(null)}>Cambiar participante</button>
      </div>
    );
  return (
    <div className="selector-persona">
      <Campo titulo="Buscar participante">
        <input
          type="search"
          placeholder="Escribe al menos 3 letras"
          value={texto}
          onChange={(e) => buscar(e.target.value)}
        />
      </Campo>
      {termino === normalizar(texto) && termino.length >= 3 && (
        <div>
          {resultados.length ? (
            resultados.map((p) => (
              <button
                className="persona-fila"
                key={p.id_persona}
                onClick={() => seleccionar(p)}
              >
                <strong>{nombre(p)}</strong>
                <small>{p.telefono}</small>
              </button>
            ))
          ) : (
            <p>Sin coincidencias.</p>
          )}
        </div>
      )}
      <button onClick={() => registrar(!alta)}>
        {alta ? "Cerrar registro" : "+ Registrar nuevo participante"}
      </button>
      {alta && (
        <Formulario
          accion="Guardar y seleccionar"
          guardar={async (f) => {
            const n = campo(f, "nombre"),
              tel = campo(f, "telefono");
            if (
              !n ||
              !/^\+?[\d\s()-]+$/.test(tel) ||
              tel.replace(/\D/g, "").length < 6
            )
              throw Error("Revisa el nombre y el teléfono.");
            const similar = personas.some(
              (p) =>
                normalizar(nombre(p)) === normalizar(n) ||
                p.telefono?.replace(/\D/g, "") === tel.replace(/\D/g, ""),
            );
            if (
              similar &&
              !confirm(
                "Ya hay una coincidencia de nombre o teléfono. ¿Registrar una persona diferente?",
              )
            )
              throw Error("Busca y selecciona el registro existente.");
            const id = await rpc<string>("guardar_persona", {
              p_nombres: n,
              p_telefono: tel,
            });
            seleccionar({
              id_persona: id,
              nombres: n,
              apellidos: null,
              telefono: tel,
            });
          }}
        >
          <Campo titulo="Nombre completo">
            <input required name="nombre" defaultValue={texto.trim()} />
          </Campo>
          <Campo titulo="Número de teléfono">
            <input required type="tel" name="telefono" />
          </Campo>
        </Formulario>
      )}
    </div>
  );
}
