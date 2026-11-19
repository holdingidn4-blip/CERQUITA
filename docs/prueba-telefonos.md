# Cerquita · Prueba en 2 teléfonos

Objetivo: recorrer el piloto en dos celulares Android reales para pasar las filas de la app de “sin verificar” a “verificado” en `docs/estado.md` (tabla A). Cada paso dice qué fila cubre. Anota OK o falla y, si falla, una captura.

## Antes de empezar
- **Teléfono A (cliente)** y **teléfono B (profesional)**, Android 10 o más, con datos o wifi.
- Dos números de prueba distintos cargados en Supabase (Authentication → Phone → números de prueba). El código es el fijo de esos números.
- La versión más reciente del APK del piloto instalada en ambos (enlace en `docs/produccion.md` → “APK del piloto”). Las funciones nuevas (profesional que no llega, inicio nuevo, plazo de constancias) necesitan el **build 3 o posterior** (hoy build 4) y las migraciones del 18-11 aplicadas en producción.
- Un usuario de soporte en el panel para aprobar el oficio (primer administrador o revisor). Sin eso, la prueba se detiene en el paso 4.
- Estar cerca (menos de 3 km entre los dos teléfonos) y con el GPS encendido.

## Pasos

| # | Teléfono | Qué hacer | Qué debe pasar | Fila de la tabla A | Resultado |
| --- | --- | --- | --- | --- | --- |
| 1 | A | Abrir la app, escribir el número de prueba, elegir “Necesito un servicio”, poner el código | Entra al inicio del cliente | App: ingreso y modo | |
| 2 | B | Igual, eligiendo “Ofrezco mis servicios” | Abre el registro, paso 1 de 3 | App: ingreso y modo | |
| 3 | B | Completar nombre, elegir Gasfitero, subir DNI (frente y reverso), selfie, antecedentes y 2 fotos de trabajo con la cámara; zona 5 km; enviar | “Enviado” en Mis oficios | App: registro y evidencia | |
| 4 | Panel | Soporte abre el caso y aprueba (en observación) | El teléfono B muestra “En observación” | Panel en producción con ingreso real | |
| 5 | B | Abrir Solicitudes y ponerse “En línea”; aceptar el permiso de ubicación | Aparece “En línea” | App: servicio en curso (GPS) | |
| 6 | A | En el inicio: “Usar mi ubicación”, buscar “gasfi” y tocar Gasfitero; describir, foto, dirección, precio y publicar | “Buscando gasfiteros cerca…”; el inicio cuenta 1 profesional cerca | App: publicar pedido | |
| 7 | B | Ver el pedido (sin dirección exacta), Cotizar, elegir precio y “30 min”, enviar | “Oferta enviada” | App: cotizar y aceptar | |
| 8 | A | Ver la oferta con “llega en 30 min”, Aceptar | “(nombre del pro) aceptó tu pedido” y la llegada acordada | App: cotizar y aceptar | |
| 9 | A ↔ B | Chat: A intenta mandar un número de teléfono; luego un mensaje normal | El número se bloquea; el mensaje llega a B | App: chat con filtro | |
| 10 | B | “Ir al domicilio” y caminar unos metros | A ve el punto moverse y “Llega en N min” | App: servicio en curso | |
| 11 | B | Escribir un código equivocado y luego el que ve A; “Llegué al domicilio” | Con el equivocado no avanza; con el correcto, “En el domicilio” | App: servicio en curso | |
| 12 | B | “Terminado”; A confirma el monto y califica con Yape y 5 estrellas | Servicio confirmado y calificado | App: cierre y calificación | |
| 13 | B | Mi comisión: ver la deuda; Pagar comisión con constancia (foto) | “En revisión · te respondemos en menos de 2 h” | App: pausa por deuda y pago | |
| 14 | Panel | Soporte aprueba la constancia | La deuda de B vuelve a S/ 0 | App: pausa por deuda y pago | |
| 15 | A | Publicar otro pedido; B cotiza con “15 min”; A acepta. Esperar 15 min después de la hora acordada sin que B salga | A ve “no llegó a la hora acordada” y “Cambiar de profesional” | App: el profesional no llega | |
| 16 | A | Tocar “Cambiar de profesional” | Vuelve a las ofertas; B ve “Llegadas incumplidas: 1 de 3” | App: el profesional no llega | |
| 17 | A | SOS: esperar la cuenta regresiva | Soporte ve la alerta en el panel y la cierra | App: SOS | |
| 18 | A | Desde el perfil del profesional: “Reportar o bloquear” | “Reportaste y bloqueaste…”; aparece en Panel → Reportes | App: reportar y bloquear | |
| 18b | B | En línea, sin servicio: bloquear el teléfono 5 minutos y caminar unos 150 m | Avísame: reviso en la base que su posición se actualizó con la app en segundo plano | App: antifraude GPS en segundo plano | |
| 19 | B | Cerrar la app por completo y volver a abrirla | La sesión sigue abierta | App: ingreso y modo | |
| 20 | A | Ajustes → Eliminar cuenta (al final) | Vuelve al ingreso | App: eliminar cuenta | |

## Qué no cubre esta prueba
- Notificaciones push: necesitan Firebase (FCM). Hasta entonces la app no las recibe.
- Antifraude GPS en segundo plano fuera de un servicio (pendiente en el roadmap).
- SMS reales: con Twilio en prueba solo funcionan los números de prueba o los verificados en Twilio.

## Al terminar
Pásame la tabla con OK o falla y las capturas de lo que falló. Con eso actualizo la tabla A: lo que pase en el teléfono queda “verificado”, con esta prueba como fuente.
