# 🎮 Mis pendientes de juegos

Una pequeña web para apuntar **lo que te falta por hacer en cada videojuego**: coleccionables, jefes, secretos, finales… con fotos (capturas), notas y prioridades.

Funciona entera en el navegador: **sin servidor, sin cuentas y sin instalar nada**. Tus datos se guardan en tu dispositivo.

## ✨ Funciones

- **Juegos con estado y plataforma**: 🎮 Jugando, ⏳ Por empezar, ⏸️ En pausa, 🏆 Completado.
- **Pendientes con foto y nota**: sube una captura, pégala con `Ctrl+V` o arrástrala encima del juego.
- **Prioridades** (🔥 alta, normal, 💤 baja). Los pendientes se ordenan solos: primero los urgentes y los hechos al final.
- **Editar** cualquier pendiente o juego, y **marcar como hecho** con fecha.
- **Barra de progreso** y resumen global (juegos, pendientes, hechos).
- **Buscador** que encuentra texto dentro de juegos, pendientes y notas, y lo resalta.
- **Filtros y orden**: por estado, por nombre, por actividad, por progreso; opción de ocultar lo ya hecho.
- **Deshacer** al borrar (sin ventanas de confirmación molestas).
- **Visor de fotos** a pantalla completa.
- **Compartir fotos** con el botón de la esquina de cada imagen: abre el menú de compartir del móvil (WhatsApp, Telegram…) o, en el ordenador, copia la foto al portapapeles.
- **Copias de seguridad**: exporta e importa todo (fotos incluidas) en un archivo `.json`.
- **Tema claro u oscuro** con un botón (la primera vez sigue el tema del sistema).
- **Instalable como app** (PWA) en el móvil o el ordenador, y funciona **sin conexión**.
- Guarda en **IndexedDB**, con mucho más espacio para fotos que la versión anterior. Si venías de la versión antigua, tus datos se migran solos.

## 🚀 Publicarla gratis con GitHub Pages

1. Crea un repositorio nuevo en GitHub (por ejemplo `pendientes-juegos`).
2. Sube todos los archivos de esta carpeta (puedes arrastrarlos en la web de GitHub con **Add file → Upload files**).
3. Ve a **Settings → Pages**.
4. En **Source** elige **Deploy from a branch**, rama `main` y carpeta `/ (root)`. Guarda.
5. En un minuto estará en `https://TU-USUARIO.github.io/pendientes-juegos/`.

Desde el móvil, abre esa dirección y usa **«Añadir a pantalla de inicio»** para tenerla como una app más.

## 💻 Usarla en local

Basta con abrir `index.html` en el navegador. Para que funcione también el modo sin conexión (service worker) hay que servirla por HTTP, por ejemplo:

```bash
python3 -m http.server 8000
# y abre http://localhost:8000
```

## 🔒 Dónde se guardan tus datos

Todo se queda **en el navegador del dispositivo** que uses (IndexedDB). Nada se envía a ningún servidor. Esto implica que:

- Los datos del móvil y los del ordenador **no se sincronizan** entre sí. Usa *Exportar / Importar* (menú `⋯`) para pasarlos de uno a otro.
- Si borras los datos del navegador, se borran también los pendientes. **Exporta una copia de vez en cuando.**

## 📁 Estructura

```
├── index.html            # Estructura de la página
├── styles.css            # Estilos (tema claro y oscuro)
├── app.js                # Toda la lógica
├── sw.js                 # Service worker (modo sin conexión)
├── manifest.webmanifest  # Datos para instalarla como app
└── icons/                # Iconos de la app
```

Si modificas algún archivo, sube el número de versión de `CACHE` en `sw.js` para que los navegadores descarguen la versión nueva.

## 📝 Licencia

[MIT](LICENSE): úsala, modifícala y compártela libremente.
