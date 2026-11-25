import type { Ticket } from "./datos";
export function CatalogoPremios({
  premios,
}: {
  premios: Ticket["premios_publicos"];
}) {
  return (
    <div className="catalogo-premios">
      {premios?.map((p) => (
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
  );
}
