# Sara i Pau

Invitación ilustrada y animada, diseñada primero para móvil. HTML, CSS, SVG y JavaScript, sin dependencias de producción ni proceso de compilación.

## Vista previa

Desde esta carpeta, ejecutar `python3 -m http.server 8000` y abrir <http://localhost:8000>. También se puede abrir `index.html` directamente.

## GitHub Pages

Subir estos archivos al repositorio. En **Settings → Pages → Build and deployment**, seleccionar **Deploy from a branch**, la rama deseada y **/ (root)**. Todos los recursos usan rutas relativas; funciona también bajo `/SaraPau/`. No es necesario instalar paquetes ni generar una carpeta `dist`.

## Experiencia

- Entrada de 1,8 s; toque o clic en cualquier punto, Enter o espacio para comenzar. Un toque durante la entrada se recuerda.
- Reacción, vuelo, subida de cámara y título en 7,6 s. Después se habilita el scroll nativo hasta los dos flamencos.
- Pistas sin texto tras 5 s de espera; cada una desaparece definitivamente al realizar su acción durante esa visita.
- Las animaciones continúan completas aunque el dispositivo solicite movimiento reducido, por decisión del diseño. Se pausan al ocultar la pestaña.
- Recargar inicia de nuevo. Sin JavaScript se muestran el título y la pareja como ilustración estática.
- Sin sonido, cookies, analítica, almacenamiento de visitas ni peticiones a servicios externos.

Los tiempos de la secuencia están en `scene.js`; colores, composición y movimientos ambientales, en `styles.css`. Las ilustraciones SVG están en `index.html`.

La fuente **Allura**, de Robert E. Leuschke, se sirve localmente en un subconjunto WOFF2 con los caracteres del título. Su licencia SIL Open Font License está en `assets/OFL-Allura.txt`.

## Verificación

Comprobado con Playwright en Chromium y WebKit, con vistas de 320 × 568, 393 × 852, 852 × 393 y 1440 × 900. Se han verificado la secuencia completa, el movimiento reducido activado, las pistas de espera y su desaparición, el teclado, los toques repetidos y anticipados, el cambio de orientación durante la subida, la continuidad al habilitar el scroll, la recarga y la alternativa sin JavaScript. También se ha simulado el cambio de visibilidad para comprobar la pausa de cámara y temporizadores.

Sin errores de navegador, recursos ausentes, desbordamiento horizontal ni peticiones externas en esas pruebas. Los recursos que carga la página suman aproximadamente 40 KB sin comprimir. La fluidez y el comportamiento de las barras del navegador quedan pendientes de una comprobación en dispositivos iOS y Android físicos.
