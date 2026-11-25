# Arquitectura de RifaPes

Aplicación de una sola página con React 19, TypeScript y Vite. Supabase aporta Auth, PostgreSQL, Storage y una Edge Function en Deno. Netlify compila con Node 24, publica `dist` y redirige las rutas de la aplicación a `index.html`. Las versiones exactas están en `package-lock.json`.

## Mapa para conversaciones por módulo

| Módulo | Entrada principal | Conexiones |
|---|---|---|
| Acceso, navegación y resumen | `src/main.tsx` | Sesión de Supabase, perfil, rifas y vistas de indicadores. |
| Rifas, premios y participantes | `src/gestion.tsx`, `src/seleccion-persona.tsx` | Configuración por rifa, fotos en Storage, selección de comprador e historial. |
| Operaciones y finanzas | `src/operaciones.tsx`, `src/ofertas.tsx`, `src/pagos.tsx` | Reservas, cotización, venta, abonos, anulaciones y devoluciones. |
| Boletos y transmisión | `src/boletos.tsx`, `src/plataformas.tsx` | Plantilla, consulta pública, descargas, catálogo y envío del organizador. |
| Sorteo en vivo | `src/sorteo.tsx`, `src/tombola.tsx` | PostgreSQL determina candidatos y resultados. Canvas representa los números; la pantalla consulta los cambios durante el evento. |
| Compartido | `src/datos.ts`, `src/controles.tsx`, `src/ayuda.tsx`, `src/estilo.css` | Cliente Supabase, lecturas paginadas, RPC, formatos y componentes reutilizables. |

## Datos y límites de acceso

- **Administración.** Auth identifica la cuenta; `perfil` delimita la propiedad de `rifa` y `persona`. La interfaz lee tablas o vistas con RLS y solicita operaciones mediante RPC. Las funciones que modifican una rifa comprueban propiedad y estado y coordinan las operaciones concurrentes.
- **Comercio.** `numero_rifa` representa el inventario. `reserva` y `venta` tienen detalles por número. `oferta_rifa`, `pago`, `devolucion` y `ajuste_venta` permiten reconstruir precios y movimientos. `vw_historial_reservas` reutiliza `cotizar_reserva` para el saldo. `vw_comprobantes_operacion` aporta el estado de pago o reserva de cada número al envío privado. Las vistas alimentan el resumen, el historial y las cuentas por cobrar.
- **Emisión.** `boleto` conserva la emisión individual; `boleto_grupo` identifica la pareja rifa–participante. `plantilla_boleto` y `configuracion_transmision` suministran el diseño y el lugar vigentes. Las rutas públicas `/boleto/:token` y `/rifa/:token` llaman a `supabase/functions/consultar-boleto/index.ts`, que valida la consulta, limita su frecuencia e invoca la RPC `consultar_boleto`.
- **Sorteo.** `premio_rifa` define los premios y rondas. `participacion_sorteo` vincula detalles pagados con el evento; `extraccion_sorteo` registra selecciones y `resultado_sorteo` los ganadores. `auditoria` conserva cambios críticos. La migración 16 añade el conjunto elegible por extracción. La consulta `resumen_candidatos` también informa del estado de la rifa, la cantidad de extracciones y el último premio extraído para sincronizar el historial entre pantallas.
- **Dependencias de presentación.** `qrcode` genera QR; `html-to-image`, `jspdf` y `fflate` producen PNG, PDF y ZIP. La interfaz utiliza CSS, Tailwind y Lucide. WhatsApp se abre con un mensaje preparado o mediante las funciones nativas de compartir del dispositivo.

## Entornos y pruebas

Las definiciones SQL evolucionan en `supabase/migrations/`; al revisar una función busca también sus redefiniciones posteriores. `supabase/manual/` contiene la autorización de administradoras, la programación de reservas y la verificación. `supabase/desarrollo/` contiene datos de ejemplo. La configuración de conexión y el orden de instalación están en [README.md](README.md).

[Pruebas SQL](pruebas/base.test.mjs) levanta PostgreSQL temporal con dos conexiones y servicios mínimos de Auth y Storage. [Pruebas de interfaz](pruebas/interfaz/flujos.spec.ts) recorre la aplicación con Playwright y respuestas simuladas de Supabase. El alcance de la última comprobación registrada figura en [CHANGELOG.md](CHANGELOG.md).
