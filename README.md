# RifaPes 1.0

Aplicación privada para hasta dos administradoras, cada una con sus propias rifas. Cada rifa tiene participantes, premios, reservas, ventas en soles, pagos manuales y un sorteo oficial. Cada número conserva su registro individual y cada participante recibe un comprobante agrupado por rifa. La consulta pública funciona en `/boleto/:token`.

## 1. Preparar Supabase

Usa un proyecto dedicado. Si ya tienes información en el proyecto que pensabas usar, primero revisa las tablas con `select schemaname, tablename from pg_tables where schemaname='public' order by tablename;`. Antes de aplicar las migraciones sobre una base con datos, revisa los posibles conflictos y conserva una copia.

En **SQL Editor → New query**, pega y ejecuta **un archivo completo a la vez**, en este orden. Espera el resultado correcto de cada archivo. Cada uno utiliza una transacción. Si falla, conserva el mensaje y corrige la causa antes de continuar. Lleva registro de los archivos ejecutados si usas SQL Editor.

| Orden | Archivo dentro de `supabase/migrations/` | Contenido |
|---|---|---|
| 1 | `20261123000100_estructura.sql` | Tablas, RLS, claves, índices y extensión pgcrypto |
| 2 | `20261123000200_operaciones.sql` | Alta de rifas, premios, números, operaciones comerciales y emisión |
| 3 | `20261123000300_sorteos_consultas.sql` | Sorteos, auditoría, vistas y consulta limitada de boleto |
| 4 | `20261123000400_integridad_archivos.sql` | Integridad entre rifas, bloqueo de configuración y bucket de imágenes |
| 5 | `20261123000500_limite_consultas.sql` | Límite de consultas públicas |
| 6 | `20261123000600_eliminar_borrador.sql` | Eliminación de rifas sin movimientos |
| 7 | `20261123000700_plantilla_vigente.sql` | Aplicar la plantilla actual en la consulta pública de boletos ya emitidos |
| 8 | `20261123000800_premios_destacados.sql` | Premios destacados y datos vigentes al consultar el boleto |
| 9 | 20261123000900_fotos_boleto.sql | Fotos opcionales de premios |
| 10 | 20261123001000_eliminar_persona.sql | Eliminar participantes sin historial de ventas o reservas |
| 11 | 20261123001100_dos_administradoras.sql | Segunda administradora y auditoría por propietaria |
| 12 | 20261123001200_emision_y_premios.sql | Emisión desde reservas o ventas, prioridades sin tope, responsable de abonos y puestos |
| 13 | 20261124000100_grupos_ofertas_anulacion.sql | Comprobantes agrupados, ofertas por operación, ajustes y anulación con devolución |
| 14 | 20261124000200_plataforma_meet.sql | Google Meet y modalidad en la consulta pública |
| 15 | 20261124000300_ubicacion_presencial.sql | Ubicación opcional de Google Maps para el mensaje presencial |
| 16 | 20261124000400_operaciones_en_vivo.sql | Reservas opcionales, anulación trazable, catálogo público y ventas durante el sorteo |
| 17 | 20261125000100_participacion_sin_pago.sql | Participación de ventas con saldo y reservas vigentes por rifa |

Si ya aplicaste la migración 16, ejecuta solamente la 17. Desde la versión 15 aplica la 16 y luego la 17. En instalaciones anteriores aplica las pendientes en orden. En las rifas anteriores se seleccionan inicialmente hasta cinco premios según el orden del sorteo. En rifas activas puedes cambiar esa selección desde **Premios**. Al mover un destacado a una prioridad ocupada, ambos intercambian sus posiciones en el boleto.

Para WhatsApp abre un boleto, personaliza el mensaje y prepara la imagen. El selector del dispositivo permite elegir WhatsApp si admite archivos. También puedes descargar el PNG y adjuntarlo al mensaje preparado.

El boleto muestra el nombre y número de emisión, junto a la fecha, foto y premios vigentes. El teléfono aparece en la copia que genera la administradora. La consulta pública por QR omite el teléfono. Descarga de nuevo los archivos para distribuir los cambios.

La instalación espera que pgcrypto esté en el esquema `extensions` estándar del proyecto. Puedes comprobarlo con `select extnamespace::regnamespace from pg_extension where extname='pgcrypto';`.

## 2. Dar acceso a la administradora

1. En **Authentication**, habilita correo y contraseña y desactiva el registro de nuevos usuarios. La configuración local equivalente está en `supabase/config.toml`.
2. En **Authentication → Users**, crea tu cuenta con correo confirmado y copia el **User UID**.
3. Abre `supabase/manual/01_autorizar_administradora.sql`, reemplaza el UUID de ceros por ese UID y ejecútalo en SQL Editor. La autorización usa metadatos de aplicación controlados por el servidor. Para autorizar a la segunda administradora en el mismo sitio, repite los pasos 2 y 3 con el UID de su cuenta. Ambas usan el mismo proyecto de Supabase y cada una ve únicamente sus datos.
4. Habilita la integración **Cron** de Supabase. Ejecuta `supabase/manual/02_programar_reservas.sql` para liberar reservas vencidas cada minuto. Las asignaciones también comprueban el vencimiento dentro de la transacción.
5. Ejecuta `supabase/manual/03_verificar.sql`. Debes ver RLS activo en las tablas de RifaPes, uno o dos perfiles autorizados, un trabajo Cron activo y el bucket `rifafacil-imagenes` con un límite de 5 MiB. El bucket público está destinado a imágenes de premios y fondos. Sube los recursos desde la cuenta autorizada.

Opcionalmente, en un proyecto de desarrollo, `supabase/desarrollo/semilla.sql` crea una persona y una rifa de ejemplo. Ejecútalo una vez. Las pruebas automáticas usan su propia base temporal.

## 3. Habilitar la consulta pública

Despliega **consultar-boleto** desde `supabase/functions/consultar-boleto/index.ts`. El código usa Deno y la clave interna que Supabase proporciona a las funciones. El navegador solo necesita la clave pública.

Con Supabase CLI instalada, desde la carpeta del proyecto:

```sh
supabase login
supabase link --project-ref TU_PROJECT_REF
supabase secrets set ORIGEN_APLICACION=https://TU-SITIO.netlify.app
supabase functions deploy consultar-boleto --no-verify-jwt
```

También puedes crear la Edge Function con ese nombre desde el panel, pegar el contenido del archivo y desactivar la verificación JWT para **esa función**. Configura el secreto `ORIGEN_APLICACION` con el origen exacto, sin barra final. Para pruebas locales de la página pública usa `http://localhost:5173` como origen en un proyecto de desarrollo.

La función exige un UUID, aplica un límite de 60 consultas por minuto y por clave de origen, y pide al servidor exclusivamente el boleto correspondiente. Comprueba el comportamiento del encabezado del proxy en el despliegue. Si el proxy agrupa varias conexiones bajo una IP, compartirán el límite. El boleto conserva los datos históricos de emisión y se presenta con la plantilla vigente de la rifa. El destino de transmisión se consulta en el momento. Los boletos anulados solo muestran su estado.

## 4. Iniciar la aplicación

Usa Node.js 24 LTS y npm. Copia `.env.example` a `.env.local`. Completa `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY` con el Project URL y la publishable key de Supabase. Reinicia Vite después de modificar estas variables.

```sh
npm ci
npm run dev
```

Abre la dirección que indica Vite. Entra con tu cuenta, crea una rifa y agrega sus premios en el orden de revelación. Registra participantes desde el menú lateral o desde la selección de números. Al guardar la plantilla, los cambios de presentación se aplican también a los boletos emitidos. Vuelve a descargar las imágenes o PDF que quieras actualizar.

## 5. Desplegar en Netlify

Importa el proyecto a Netlify con `npm run build` como comando, `dist` como directorio publicado y las dos variables públicas configuradas en el entorno de build. `netlify.toml` incluye las rutas SPA y encabezados. También puedes ejecutar el build con las variables locales y subir el contenido compilado de `dist` usando la opción de despliegue manual.

Configura la Site URL de Auth y `ORIGEN_APLICACION` con el dominio definitivo. Emite los boletos desde ese dominio para que sus QR apunten a una dirección estable.

## 6. Verificación por fase

| Fase | Implementación y comprobación |
|---|---|
| Base de datos | Migraciones ordenadas sobre PostgreSQL temporal con dos conexiones. Los esquemas mínimos de Auth y Storage del entorno de pruebas están en `pruebas/servicios-locales.sql`. |
| Auth, rifas, premios y dashboard | Ruta privada, login, tema persistido, indicadores y edición. Playwright cubre login, creación de rifa, navegación móvil y tema con API simulada. |
| Participantes y operaciones | Una persona participa en varias ventas. Pruebas SQL de venta simultánea, reserva, conversión, vencimiento, pagos parciales, cancelación, precio histórico y devolución. |
| Boletos | Pruebas SQL de emisión y consulta. Playwright verifica el QR, el enlace y las dos descargas en navegador con un boleto de prueba. |
| Sorteos | PostgreSQL comprueba factibilidad, las tres reglas de ganadores, idempotencia, bloqueo, 25 premios y continuación desde otra conexión. |
| Entrega | TypeScript, ESLint y build de producción. La conexión al proyecto alojado, Cron, Storage y el despliegue se comprueban después de configurar las cuentas. |

```sh
npm run lint
npm run build
npm test
npx playwright install chromium
npm run test:interfaz
```

Como alternativa en Windows con Microsoft Edge instalado, usa PowerShell:

```powershell
$env:CANAL_NAVEGADOR = 'msedge'
npm run test:interfaz
```

Las pruebas de PostgreSQL necesitan poder iniciar un proceso temporal, escribir en la carpeta temporal y escuchar en localhost. Usan un puerto aleatorio y eliminan el clúster al terminar. Para desarrollar en Linux, ejecútalas como usuario normal.

### Prueba final en tu proyecto de desarrollo

1. Inicia sesión, crea una rifa, sube una imagen y verifica su vista previa. Agrega dos premios con extracciones ganadoras 3 y 1.
2. Registra a Alonso, vende 007 y 009 en una venta, cobra el importe completo y abre ambos boletos. Vende 025 reutilizando su ficha.
3. Abre un QR en una ventana privada. Cambia el enlace de transmisión y verifica que «Ver sorteo» tome el destino actualizado. Cancela una venta antes del sorteo y comprueba que sus boletos se muestren anulados. Registra el dinero devuelto cuando corresponda.
4. Crea una reserva corta y comprueba su liberación por Cron. Registra suficientes números pagados para el sorteo. Inicia, extrae, recarga la página y continúa desde el último resultado confirmado.
5. Prueba el enlace público directamente desde el dominio final y las descargas en el móvil que usarás para compartir.

## Decisiones de negocio

- Un número vendido queda ocupado desde la creación de la venta. Puedes emitir desde una reserva o desde una venta con cualquier saldo. Al convertir la reserva se conserva su QR. Por defecto solo participa una venta pagada. En **Configuración → Incluir Números sin pagar**, guarda la opción antes del inicio para incluir ventas pendientes y reservas vigentes, con o sin boleto emitido. El precio de cada línea se conserva. Una cancelación pagada crea devoluciones pendientes por pago. La recaudación vigente excluye ventas anuladas. Los importes recibidos y las devoluciones pendientes o realizadas se conservan en el historial.
- Las operaciones de cada rifa toman un bloqueo sobre su fila. Los cambios de asignación, los detalles y el estado de cada número se confirman juntos. La base verifica que premio, participante, número y sorteo correspondan a relaciones compatibles.
- Al comenzar se bloquea la edición de premios y reglas. Si se habilitan ventas en vivo, los números se incorporan al registrar la venta si se incluyen los números sin pagar, o al completar el pago con la opción apagada. Cada nueva extracción guarda su propio conjunto elegible. Para un premio por persona, la validación considera el peor caso de que ganen primero las personas con más números. Cada extracción usa bytes aleatorios criptográficos en PostgreSQL y se confirma junto con su resultado. El navegador anima el resultado ya persistido.
- En Premios puedes agregar un sorteo por puestos. Se crean tres premios consecutivos, del tercero al primero. Cada puesto admite foto y usa el mismo registro oficial. Cada selección se inicia manualmente.
- Las imágenes subidas son públicas. Los participantes, ventas y pagos tienen políticas privadas. El nombre impreso en el boleto procede de su emisión. El enlace y el lugar de transmisión reflejan la configuración vigente.

### Envío individual a WhatsApp

En Boletos selecciona el boleto emitido y abre **Compartir por WhatsApp**. El sistema usa el teléfono del participante; puedes corregir el destino para ese envío. Para guardarlo permanentemente, edita la ficha del participante. Prepara la imagen, descarga el PNG y abre el chat con el mensaje preparado. Adjunta el archivo antes de enviar. El enlace público del boleto mantiene privado el teléfono del cliente.

En Android, iOS y escritorio, la opción nativa aparece si el navegador admite compartir ese archivo y el texto por HTTPS. El dispositivo determina las aplicaciones disponibles y la aplicación receptora puede descartar parte del texto. El chat directo funciona en WhatsApp Web o en la aplicación asociada por el dispositivo. [Ayuda de WhatsApp](https://faq.whatsapp.com/5913398998672934) · [Web Share API](https://www.w3.org/TR/web-share/)

Un envío automático de imagen y mensaje al número del cliente requeriría una integración de servidor con WhatsApp Business Platform, cuenta empresarial de WhatsApp, número emisor registrado, identificador de número y token con permiso whatsapp_business_messaging. Requiere consentimiento, y fuera de la ventana de atención de 24 horas se necesitan plantillas aprobadas. Pueden aplicarse cargos según mercado y categoría. Para confirmar entrega se necesitan notificaciones de estado. La aplicación actual usa las opciones del navegador. [Documentación empresarial de Meta](https://developers.facebook.com/documentation/business-messaging/whatsapp/overview)

### Probar y publicar la versión agrupada

1. Usa Supabase local o un proyecto de pruebas que tenga las migraciones 1–12 y la función consultar-boleto. En el editor SQL de ese entorno aplica las migraciones 13 a 17 en orden. Con Supabase CLI y una instancia local ya inicializada, usa `supabase migration up --local`.
2. Configura la URL y la clave pública **de pruebas** en .env.local. Ejecuta `npm ci` y `npm run dev`. Un frontend en localhost opera sobre el proyecto al que apuntan estas variables.
3. Configura una rifa a S/ 10 con tres números por S/ 25, vende tres y cobra S/ 15. Verifica saldo S/ 10, compra posterior separada, descarga agrupada y consulta pública. Revisa la anulación y confirma una devolución desde Números y ventas.
4. Tras aprobar las pruebas, conserva un respaldo y aplica las migraciones pendientes hasta la 17 a producción antes de publicar el frontend en Netlify. Mantén la función consultar-boleto y su configuración de origen. Publica desde la rama conectada al sitio y comprueba una URL antigua, una agrupada y el ZIP.

Los QR antiguos conservan su ruta y validación individual. El nuevo QR identifica a la pareja rifa–participante. Los números de ventas adicionales se actualizan en la consulta y en la siguiente descarga; los archivos ya guardados son copias de la fecha de descarga.

### Actualizar a operaciones en vivo

1. En pruebas, sobre la versión 15, ejecuta completo `supabase/migrations/20261124000400_operaciones_en_vivo.sql`. Conserva el cron existente. La versión 15 registraba el precio base de cada reserva y calculaba el descuento al convertirla. La actualización conserva la cotización disponible en ese momento. En las reservas heredadas, contrasta el importe mostrado con lo acordado antes de confirmar la conversión. Las reservas previas mantienen su vencimiento y las rifas comienzan con las ventas en vivo deshabilitadas.
2. En Configuración habilita ventas durante el sorteo y guarda el precio. Desde dos ventanas abre Números y ventas y Sorteo. Completa un pago durante una extracción y comprueba su incorporación al siguiente conjunto elegible. La pantalla consulta el servidor periódicamente; los números definitivos y cada ganador se registran bajo el bloqueo de la rifa.
3. Consulta un QR anterior en móvil. Comprueba la lista completa de premios, el lugar y ambas descargas. Las instantáneas de candidatos corresponden a las extracciones posteriores a la migración. Las anteriores conservan sus resultados originales.
4. Tras aprobar las pruebas, guarda un respaldo, aplica la misma migración en Supabase de producción y luego publica el frontend desde la rama conectada a Netlify. Verifica un QR antiguo y uno agrupado. La función Edge consultar-boleto conserva su contrato.

### Actualizar la participación del sorteo

En un proyecto de pruebas con la versión 16, aplica la migración 17 antes de actualizar la interfaz. Las rifas comienzan con la opción apagada. Comprueba la vista previa con una venta pagada, una pendiente y una reserva vigente. Enciende el switch, guarda y comprueba que aparecen las tres. Verifica el historial tras la extracción. Para publicar, confirma el respaldo y la autorización del entorno de destino.

Si al guardar aparece `Could not find the function public.configurar_participacion`, comprueba en el SQL Editor del proyecto al que apunta `VITE_SUPABASE_URL` si existe con `select to_regprocedure('public.configurar_participacion(uuid,boolean)');`. Si devuelve `NULL`, aplica las migraciones pendientes hasta la 17 en orden. Si aparece la función, ejecuta `notify pgrst, 'reload schema';` para actualizar la caché de la API. Después vuelve a guardar la opción antes del sorteo. Las reservas vigentes anteriores se incluyen automáticamente.

[Guía del proyecto, los datos y los mensajes (PDF)](output/pdf/Guia-de-RifaPes.pdf)
