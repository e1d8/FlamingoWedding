// Optional authoring helper. GitHub Pages serves the committed SVG without a build step.
import {writeFile} from 'node:fs/promises';
import {Vector3} from '../vendor/three.module.min.js';
import {Flamingo, FLAMINGO_ANATOMY} from '../render/birds.js';

function simplify(points, tolerance = .14) {
  if (points.length < 3) return points;
  const first = points[0], last = points.at(-1);
  const dx = last[0] - first[0], dy = last[1] - first[1];
  const length = dx * dx + dy * dy;
  let furthest = 0, at = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const point = points[i];
    const t = length ? Math.max(0, Math.min(1, ((point[0]-first[0])*dx+(point[1]-first[1])*dy)/length)) : 0;
    const distance = (point[0]-first[0]-t*dx)**2 + (point[1]-first[1]-t*dy)**2;
    if (distance > furthest) { furthest = distance; at = i; }
  }
  if (furthest <= tolerance * tolerance) return [first, last];
  return [...simplify(points.slice(0, at + 1), tolerance).slice(0, -1), ...simplify(points.slice(at), tolerance)];
}

function outline(mesh) {
  const positions = mesh.geometry.attributes.position;
  const indices = mesh.geometry.index;
  const edges = new Map();
  for (let i = 0; i < indices.count; i += 3) {
    const triangle = [indices.getX(i), indices.getX(i + 1), indices.getX(i + 2)];
    for (let j = 0; j < 3; j++) {
      const a = triangle[j], b = triangle[(j + 1) % 3];
      const key = a < b ? `${a}:${b}` : `${b}:${a}`;
      if (edges.has(key)) edges.delete(key);
      else edges.set(key, [a, b]);
    }
  }
  const neighbors = new Map();
  for (const [a, b] of edges.values()) {
    if (!neighbors.has(a)) neighbors.set(a, []);
    if (!neighbors.has(b)) neighbors.set(b, []);
    neighbors.get(a).push(b);
    neighbors.get(b).push(a);
  }
  const visited = new Set();
  const vertex = new Vector3();
  let path = '';
  for (const first of neighbors.keys()) {
    if (visited.has(first)) continue;
    let current = first, previous = -1;
    const points = [];
    do {
      vertex.fromBufferAttribute(positions, current).applyMatrix4(mesh.matrixWorld);
      points.push([vertex.x, vertex.y]);
      visited.add(current);
      const next = neighbors.get(current).find(candidate => candidate !== previous);
      previous = current;
      current = next;
    } while (current !== undefined && current !== first && !visited.has(current));
    simplify([...points, points[0]]).forEach((point, i) => {
      path += `${i ? 'L' : 'M'}${point[0].toFixed(2)},${point[1].toFixed(2)}`;
    });
    path += 'Z';
  }
  return `<path d="${path}"/>`;
}

const paths = [];
for (const mirror of [false, true]) {
  const bird = new Flamingo({love: true, mirror});
  bird.update(0, -1, FLAMINGO_ANATOMY.pairOffset * (mirror ? 1 : -1), 0, 1);
  bird.group.updateMatrixWorld(true);
  bird.group.traverse(mesh => { if (mesh.isMesh) paths.push(outline(mesh)); });
}
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 420"><g fill="#090b0e" transform="translate(300 226) scale(.85 -.85)">${paths.join('')}</g></svg>\n`;
await writeFile(new URL('../assets/flamingo-pair.svg', import.meta.url), svg);
console.log('Exported the same silhouette geometry for the static invitation.');
