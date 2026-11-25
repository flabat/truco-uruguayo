# Capturas para las tiendas

## Tamaños

| Tienda | Dispositivo | Tamaño en píxeles | Cantidad |
| --- | --- | --- | --- |
| App Store | iPhone 6,9" (obligatorio) | 1320×2868 vertical | 3 a 10 |
| App Store | iPad 13" (porque `supportsTablet` está activo) | 2064×2752 vertical | 3 a 10 |
| Google Play | Teléfono | entre 320 y 3840 de lado, proporción 9:16; por ejemplo 1080×1920 | 2 a 8 |
| Google Play | Tablet de 7" y de 10" | opcionales; recomendadas para aparecer en tablets | hasta 8 |

App Store escala las capturas de 6,9" a los iPhone más chicos. Si la app deja de declarar `supportsTablet`, no hacen falta las de iPad.

## Qué mostrar

Las mismas cinco pantallas en las dos tiendas, en este orden. Partidas armadas con computadoras y nombres neutros, sin datos de jugadores reales.

1. **La mesa de parejas** en plena mano, con la muestra a la vista y un globo de «¡Truco!». Leyenda: «Truco uruguayo, con muestra y flor».
2. **La seña del compañero** al pie, en parejas. Leyenda: «Señas que solo ve tu compañero».
3. **El salón** con mesas públicas. Leyenda: «Jugá con amigos o mirá una partida».
4. **Crear mesa** con «Jugar con computadoras». Leyenda: «¿Faltan jugadores? Sumá computadoras».
5. **El resumen de tantos** al final de una mano. Leyenda: «Cada tanto, bien contado».

Las leyendas van en la parte de arriba, en DM Serif Text sobre el fondo crema, con la captura del teléfono debajo.

## Cómo sacarlas

- iOS: simulador «iPhone 17 Pro Max» (6,9") y «iPad Pro 13-inch», con `xcrun simctl io booted screenshot`.
- Android: emulador Pixel_API_36 con `adb exec-out screencap -p > captura.png`.
- Barra de estado limpia: en iOS, `xcrun simctl status_bar booted override --time 9:41 --batteryLevel 100 --cellularBars 4`; en Android, el modo demo (`adb shell settings put global sysui_demo_allowed 1` y los comandos de `com.android.systemui.demo`).
