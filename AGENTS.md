# Trabajar en RifaPes

## Al iniciar una tarea por módulo

1. Lee la petición actual, revisa `git status --short --branch` y conserva el trabajo local previo. Dos conversaciones pueden compartir los mismos archivos.
2. Ubica el módulo y sus dependencias en [ARQUITECTURA.md](ARQUITECTURA.md). Consulta sus reglas y criterios de aceptación en [FUNCIONALIDADES.md](FUNCIONALIDADES.md).
3. Revisa [PENDIENTES.md](PENDIENTES.md) y [CHANGELOG.md](CHANGELOG.md) para distinguir código local, comprobaciones previas y cambios publicados en Git. Comprueba el código vigente antes de reutilizar una conclusión anterior.
4. Identifica los flujos afectados antes de editar. Un cambio en una venta puede repercutir en pagos, boletos, reportes y elegibilidad para el sorteo.

## Reglas permanentes

- Usa **RifaPes** en la interfaz. Conserva los identificadores técnicos heredados que utilizan Auth, Storage, Cron, RPC y enlaces ya emitidos.
- Mantén los nombres de tablas y campos en español, la normalización, las relaciones y el historial. Amplía la base con migraciones ordenadas y compatibles con los datos existentes. Conserva los contratos de clientes anteriores cuando publiques el backend antes del frontend.
- Aplica autorización por propietaria, restricciones de estado, validación de importes y controles de concurrencia en PostgreSQL. El navegador presenta resultados y valida entradas para el usuario. Mantén las claves privilegiadas en el servidor y las credenciales locales fuera de Git.
- Conserva las funciones compatibles, el diseño responsive, ambos temas, los importes en soles y las fechas del negocio en `America/Lima`. Reutiliza componentes y operaciones existentes antes de crear otros.
- Trabaja en local o con un proyecto de pruebas identificado. Solicita autorización explícita antes de desplegar, aplicar SQL en producción o realizar acciones destructivas. Un cambio solicitado solo en documentación se limita a documentación.

## Al finalizar cada tarea

- **Verifica que los cambios no afecten funcionalidades existentes.** Para cambios funcionales, prueba los criterios del módulo y sus consumidores. Revisa migraciones y concurrencia con `npm test`, los recorridos visuales con `npm run test:interfaz`, y el frontend con `npm run lint` y `npm run build`, según el alcance. En documentación comprueba referencias, afirmaciones y alcance del diff.
- **Actualiza la documentación pertinente**: arquitectura si cambia un contrato, funcionalidades si cambia una regla, changelog para una mejora entregada y pendientes para trabajo abierto o validaciones restantes. Mantén las instrucciones de instalación y publicación en [README.md](README.md).
- Indica qué se implementó, qué se probó, en qué entorno y qué queda pendiente. Reserva «verificado en producción» para comprobaciones efectivamente realizadas en ese entorno.
