# Historial de cambios conocidos

Orden de más reciente a más antiguo. Los hashes identifican commits del repositorio. Los títulos de versión proceden de Git; `package.json` declara `1.0.0`. El historial de Git por sí solo no acredita qué versión atiende producción.

| Referencia | Cambios identificados |
|---|---|
| 25 de noviembre de 2026 · migración 17 local | Opción de participación con saldo por rifa, reservas vigentes y titular fijado en cada extracción. La configuración, la vista previa y WhatsApp reflejan la regla. Guía de mantenimiento en PDF. |
| Correcciones locales de la migración 16 | Cotización de reservas en el historial, mensajes por estado de pago, boletos parcialmente anulados y seguimiento de extracciones entre pantallas. |
| Trabajo local sobre `4b99054`, migración 16 | Historial de operaciones por estado, reservas indefinidas, trazabilidad de anulaciones y modalidad «Sin definir». Catálogo público completo, esfera sin el límite visual de 12 y ventas opcionales durante el evento con candidatos registrados por extracción. |
| `4b99054`, migración 15 | Envío de boletos, plantillas de WhatsApp por modalidad, contraste del boleto y ubicación presencial de Google Maps. |
| `28ff926`, migraciones 13–14 | Boletos agrupados, promociones, ajustes parciales, anulación de rifa con devoluciones y Google Meet. |
| `3cfae7a`, migraciones 11–12 | Segunda administradora aislada, emisión desde reservas o ventas, prioridades de premios y sorteos por puestos. |
| `56e9dc9`, migraciones 1–10 | Base de rifas, participantes, reservas, ventas, abonos, resumen financiero, sorteos, boletos públicos, imágenes y edición de plantillas. |

## Evidencia de verificación

El 25 de noviembre pasaron 23 pruebas de Node sobre PostgreSQL temporal (incluida la contenedora), cinco recorridos en Edge con Supabase simulado, ESLint y la compilación. Se comprobó el switch en ambas posiciones, la exclusión de bajas y vencimientos, la conservación del ganador tras vencer su reserva, la regla por persona y la incorporación de ventas en vivo sin duplicar números.

En la conversación de desarrollo del 24 de noviembre de 2026, la última ejecución SQL registrada informó **20 pruebas aprobadas** en el conteo de Node, incluida la prueba contenedora. La última ejecución de Playwright informó **5 recorridos aprobados en Edge**. También finalizaron correctamente la compilación y ESLint. Los escenarios cubiertos por módulo están en [FUNCIONALIDADES.md](FUNCIONALIDADES.md). Esos resultados corresponden a la revisión anterior.

En la verificación posterior de estas correcciones, Node informó 21 pruebas aprobadas, incluida la actualización desde la versión 15 con datos históricos. Los cinco recorridos de Edge pasaron tras corregir la expectativa de un boleto de tres números y repetir el recorrido afectado. Dos pestañas observaron el mismo ganador sin recargar manualmente. ESLint, TypeScript y la compilación de producción finalizaron correctamente en una copia temporal.

## Documentación modular

Se incorporaron [instrucciones permanentes](AGENTS.md), [arquitectura](ARQUITECTURA.md), [funcionalidades y aceptación](FUNCIONALIDADES.md), este historial y [pendientes](PENDIENTES.md) para continuar el proyecto en conversaciones independientes.
