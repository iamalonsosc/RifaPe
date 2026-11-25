# Pendientes y límites de verificación

Corte de revisión: 25 de noviembre de 2026. Este registro distingue tareas abiertas, límites históricos y propuestas que requieren una decisión del propietario.

| Estado | Módulo | Siguiente comprobación o criterio de cierre |
|---|---|---|
| Pendiente de integración en destino | Disponibilidad pública | En Netlify y Supabase de pruebas, abrir y recargar el enlace de disponibilidad sin iniciar sesión, comprobar las fotos de Storage, Cron, la respuesta a la revocación y el aspecto de los emojis al recibir el mensaje desde WhatsApp Web y desde la aplicación móvil. Autorizar producción tras validar el recorrido del README. |
| Pendiente de publicación | Participación por rifa | Aplicar la migración 17 tras la 16 con autorización. Comprobar el switch, una reserva ganadora, una venta en vivo con saldo y su mensaje de WhatsApp en una rifa de pruebas del entorno de destino. |
| Pendiente de revisión y publicación | Operaciones en vivo | La migración 16 ya figura en Git. Confirmar las migraciones aplicadas en el entorno de destino. Con autorización, respaldar la base, aplicar las pendientes en orden y publicar el frontend según [README.md](README.md). |
| Pendiente de validación en el entorno de destino | Integración | En una rifa de pruebas, comprobar el vencimiento por Cron, abrir un QR anterior desde el dominio configurado, descargar en un teléfono real y verificar el mensaje y la imagen en WhatsApp. Ensayar el sorteo con dos ventanas y observar que una venta pagada durante una extracción ingresa en la siguiente. La base temporal y las respuestas simuladas del navegador cubren partes distintas de este flujo. |
| Revisión concreta | Boleto público | `AccesoEvento` comprueba que el navegador pueda interpretar la URL y que el protocolo sea HTTPS. Falta verificar una dirección heredada malformada en el entorno de destino. El criterio acordado exige botón deshabilitado y mensaje explicativo para un destino inválido. |
| Límite de los datos históricos | Sorteos y finanzas | El conjunto de candidatos por extracción se guarda desde la migración 16. Los ajustes antiguos solo permiten reconstruir números retirados cuando existe evidencia suficiente. Para reservas activas heredadas, la migración conserva el precio base y fija las ofertas disponibles en el momento de actualizar. El historial identifica esas reservas y solicita confirmar el importe antes de convertirlas. Contrastar cualquier discrepancia con el acuerdo original. |
| Propuesta sin alcance aprobado | Comercialización | Se conversó sobre alquilar el sistema a más organizadores con marca propia. El modelo confirmado admite dos administradoras aisladas. Acordar gestión de cuentas, marcas y permisos antes de ampliar ese límite. |

Los errores corregidos y sus pruebas se registran en [CHANGELOG.md](CHANGELOG.md). Para incorporar un fallo nuevo, anotar el módulo, el entorno, los pasos para reproducirlo y el resultado esperado.
