# Sara i Pau

Invitación animada con Three.js, diseñada primero para móvil. Ilustración 2D con cámara ortográfica, flamencos a contraluz animados mediante sprite sheets y agua animada mediante shaders. HTML, CSS y módulos JavaScript, sin proceso de compilación.

## Vista previa

Desde esta carpeta, ejecutar `python3 -m http.server 8000` y abrir <http://localhost:8000>. La versión interactiva necesita HTTP porque utiliza módulos JavaScript; abrir el archivo directamente con `file://` muestra la alternativa estática.

## GitHub Pages

Subir estos archivos al repositorio. En **Settings → Pages → Build and deployment**, seleccionar **Deploy from a branch**, la rama deseada y **/ (root)**. Todos los recursos usan rutas relativas; funciona también bajo `/SaraPau/`. No es necesario instalar paquetes ni generar una carpeta `dist`.

## Experiencia

- Carga con un corazón que se dibuja al preparar los recursos, decodificar las doce hojas de vuelo y la imagen de la pareja y subirlas a la GPU. Después, entrada de 2,6 s; toque o clic en cualquier punto, Enter o espacio para comenzar. Un toque durante la carga o la entrada se recuerda.
- Reacción, preparación, despliegue de alas, impulso, vuelo y subida de cámara continuos. El título aparece mediante opacidad, desplazamiento y desenfoque suaves, sin máscara de recorte ni cortinilla. Comienza a los 6,9 s y se habilita el scroll nativo a los 10,2 s.
- Los flamencos son siluetas completamente opacas, sin ojos, ribetes ni líneas interiores. El perfil incorpora un cuerpo compacto con plumas caídas, cuello de grosor variable, pico curvado, patas largas y articulaciones discretas. Las posturas de espera y de la pareja son estáticas.
- El flamenco principal usa 32 poses de despegue repartidas en ocho hojas de cuatro imágenes, a 20 fotogramas por segundo. Su postura de espera es el primer sprite. Tras el despegue se reproduce un ciclo de 16 poses a 24 fotogramas por segundo, repartidas en cuatro hojas. Los contornos proceden de las imágenes; la traslación y el alejamiento se animan suavemente con Three.js.
- Durante los pasos de impulso el cuerpo avanza hacia la derecha sobre el agua; después despega con una subida suave y una trayectoria predominantemente horizontal, siguiendo la orientación de las poses. La silueta completa sale por la derecha antes de los 3 s. La cámara empieza a subir a los 3,12 s, cuando ya ha salido; el título conserva su aparición a los 6,9 s.
- La bandada usa el mismo ciclo de sprites con fases desfasadas. La pareja utiliza una nueva imagen realista estática: cuellos curvados en corazón y picos próximos. Las patas del flamenco inicial y de la pareja quedan parcialmente sumergidas; el recorte desaparece durante el vuelo para conservar completas las alas.
- El agua refleja los flamencos renderizados en ese instante. Ondas, salpicaduras, luz solar, nubes, relieve lejano y vegetación completan el paisaje sin cambiar su composición 2D.
- Pistas sin texto tras 5 s de espera; cada una desaparece definitivamente al realizar su acción durante esa visita.
- Las animaciones continúan completas aunque el dispositivo solicite movimiento reducido, por decisión del diseño. Se pausan al ocultar la pestaña.
- Recargar inicia de nuevo. Sin JavaScript o WebGL2, si falla la carga, o si se pierde el contexto gráfico, se muestra la ilustración estática con el título y la pareja. Un límite de 60 s evita quedar bloqueado en una carga fallida y permite descargar los sprites en conexiones lentas.
- Sin sonido, cookies, analítica, almacenamiento de visitas ni peticiones a servicios externos.

`scene.js` controla la carga, el tiempo visible, las fases, el texto y el scroll. `render/lagoon.js` configura Three.js y los reflejos; `render/sprites.js` reproduce los sprites del flamenco principal, la pareja y la bandada; `render/water-level.js` comparte la altura del agua y la profundidad de las patas; `render/atmosphere.js` contiene los shaders. `styles.css` controla la interfaz y la ilustración de `index.html` queda como alternativa estática.

Three.js **0.180.0** se incluye en `vendor/`, con su licencia MIT. Todo se sirve desde el mismo origen, también bajo una subcarpeta de GitHub Pages. No es necesario ejecutar `npm install`. La resolución de render se limita a 1,65 veces los píxeles CSS; el reflejo se calcula a una resolución menor. La escena deja de renderizarse cuando la pestaña está oculta.

`assets/flamingo/couple.png` contiene la pareja y se utiliza también en la alternativa sin JavaScript o WebGL. Las siluetas vectoriales antiguas se conservan como material de autoría, sin cargarse en la escena.

Las hojas de sprites están en `assets/flamingo/`. Cada PNG conserva la transparencia generada; el material utiliza su máscara alfa para mostrar una silueta negra uniforme. `sprites.json` contiene los recortes y anclajes medidos por fotograma para compensar los márgenes irregulares de las hojas sin cortar patas ni plumas. Todas las texturas caben en un límite de 2048 píxeles. Las hojas de vuelo miden 1254 × 1254, con cuatro poses por hoja; la pareja ocupa una imagen de 1536 × 1024.

Los prompts exactos y la procedencia de las imágenes generadas están en `assets/flamingo/ARTWORK.md`. `tools/measure-sprites.browser.js` es una herramienta opcional de autoría para medir las hojas en un navegador local; no se necesita en producción. Los estudios densos de `assets/flamingo/studies/` no se cargan en la web.

La fuente **Allura**, de Robert E. Leuschke, se sirve localmente en un subconjunto WOFF2 con los caracteres del título. Su licencia SIL Open Font License está en `assets/OFL-Allura.txt`.

## Verificación

Las pruebas se ejecutan con Node.js, sin instalar paquetes: `node --test tests/*.test.mjs`. Incluyen la reproducción de la secuencia, el cierre del ciclo, las dimensiones y transparencia de los PNG, los recortes completos, la conservación de proporciones y la continuidad de la trayectoria, la inmersión de las patas y el encuadre de la nueva pareja.

La edición Three.js se ha comprobado con Playwright en Chromium y WebKit, con vistas de 320 × 568, 393 × 852, 852 × 393 y 1440 × 900. Se han verificado WebGL2, la secuencia completa, el movimiento reducido activado, las pistas, el teclado, los toques anticipados y repetidos, el cambio de orientación, el scroll sin salto, la recarga y la pausa al ocultar la pestaña. También se han probado la ruta `/SaraPau/`, la pérdida del contexto, JavaScript y WebGL desactivados, y fallos de carga tanto del motor como del archivo principal.

Sin peticiones externas: Three.js, los sprites y las fuentes se sirven localmente. Las doce hojas de vuelo y la pareja PNG suman aproximadamente 5,8 MB; el conjunto inicial ronda los 6,7 MB sin compresión HTTP. Todas las texturas se precargan para que el aleteo no dependa de descargas durante la secuencia.

La fluidez y el comportamiento de las barras del navegador deben comprobarse también en dispositivos iOS y Android físicos. Las pruebas de escritorio con vistas móviles no sustituyen esa revisión.
