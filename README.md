# Sara i Pau

Invitación animada con Three.js, diseñada primero para móvil. Ilustración 2D con cámara ortográfica, siluetas articuladas a contraluz y agua animada mediante shaders. HTML, CSS y módulos JavaScript, sin proceso de compilación.

## Vista previa

Desde esta carpeta, ejecutar `python3 -m http.server 8000` y abrir <http://localhost:8000>. La versión interactiva necesita HTTP porque utiliza módulos JavaScript; abrir el archivo directamente con `file://` muestra la alternativa estática.

## GitHub Pages

Subir estos archivos al repositorio. En **Settings → Pages → Build and deployment**, seleccionar **Deploy from a branch**, la rama deseada y **/ (root)**. Todos los recursos usan rutas relativas; funciona también bajo `/SaraPau/`. No es necesario instalar paquetes ni generar una carpeta `dist`.

## Experiencia

- Carga con un corazón que se dibuja al preparar los recursos y los programas gráficos. Después, entrada de 2,6 s; toque o clic en cualquier punto, Enter o espacio para comenzar. Un toque durante la carga o la entrada se recuerda.
- Reacción, preparación, despliegue de alas, impulso, vuelo y subida de cámara continuos. El título comienza a los 6,9 s y se habilita el scroll nativo a los 10,2 s.
- Los flamencos conservan el mismo cuerpo articulado durante el despegue: cuello deformable, cabeza, dos alas con plumas, patas y dedos. La pareja comparte este sistema con una postura específica para formar el corazón.
- El agua refleja los flamencos renderizados en ese instante. Ondas, salpicaduras, luz solar, nubes, relieve lejano y vegetación completan el paisaje sin cambiar su composición 2D.
- Pistas sin texto tras 5 s de espera; cada una desaparece definitivamente al realizar su acción durante esa visita.
- Las animaciones continúan completas aunque el dispositivo solicite movimiento reducido, por decisión del diseño. Se pausan al ocultar la pestaña.
- Recargar inicia de nuevo. Sin JavaScript o WebGL2, si falla la carga, o si se pierde el contexto gráfico, se muestra la ilustración SVG estática con el título y la pareja. Un límite de 20 s evita quedar bloqueado en la carga.
- Sin sonido, cookies, analítica, almacenamiento de visitas ni peticiones a servicios externos.

`scene.js` controla la carga, el tiempo visible, las fases, el texto y el scroll. `render/lagoon.js` configura Three.js y los reflejos; `render/birds.js` contiene los flamencos articulados y la bandada; `render/atmosphere.js` contiene los shaders. `styles.css` controla la interfaz y la ilustración SVG de `index.html` queda como alternativa estática.

Three.js **0.180.0** se incluye en `vendor/`, con su licencia MIT. Todo se sirve desde el mismo origen, también bajo una subcarpeta de GitHub Pages. No es necesario ejecutar `npm install`. La resolución de render se limita a 1,65 veces los píxeles CSS; el reflejo se calcula a una resolución menor. La escena deja de renderizarse cuando la pestaña está oculta.

La fuente **Allura**, de Robert E. Leuschke, se sirve localmente en un subconjunto WOFF2 con los caracteres del título. Su licencia SIL Open Font License está en `assets/OFL-Allura.txt`.

## Verificación

Las pruebas de continuidad del flamenco se ejecutan con Node.js, sin instalar paquetes: `node --test tests/rig.test.mjs`. Comprueban la deformación continua, la conservación de la geometría, la unión entre cabeza y cuello, el inicio sin salto de postura y la composición de la pareja.

La edición Three.js se ha comprobado con Playwright en Chromium y WebKit, con vistas de 320 × 568, 393 × 852, 852 × 393 y 1440 × 900. Se han verificado WebGL2, la secuencia completa, el movimiento reducido activado, las pistas, el teclado, los toques anticipados y repetidos, el cambio de orientación, el scroll sin salto, la recarga y la pausa al ocultar la pestaña. También se han probado la ruta `/SaraPau/`, la pérdida del contexto, JavaScript y WebGL desactivados, y fallos de carga tanto del motor como del archivo principal.

Sin errores gráficos inesperados ni peticiones externas en esas pruebas. Los recursos de la página suman aproximadamente 800 KB sin comprimir, principalmente Three.js. La medición local en Chromium, con móvil emulado de 393 × 852 y densidad 3, dio intervalos medios de 16,67 ms entre fotogramas, tanto con un flamenco como con la pareja y sus reflejos. Esta medición corresponde al ordenador de desarrollo.

La fluidez y el comportamiento de las barras del navegador deben comprobarse también en dispositivos iOS y Android físicos. Las pruebas de escritorio con vistas móviles no sustituyen esa revisión.
