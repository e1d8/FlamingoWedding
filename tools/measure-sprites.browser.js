import {measureCoupleSprite} from './measure-couple.browser.js';

// Authoring helper: run in a local browser. Measures the original PNGs without editing them.
export async function measureSpriteSheets() {
  const manifest = {version: 3, canonicalWidth: 450, timing: {hold: .18, takeoffFps: 20, flightFps: 24, liftoff: 1.03}};
  for (const [name, pageCount] of [['takeoff', 8], ['flight', 4]]) {
    const sequence = {pages: [], frames: []};
    for (let page = 0; page < pageCount; page++) {
      const file = `${name}-${String.fromCharCode(97 + page)}.png`;
      const image = new Image();
      image.src = new URL(`../assets/flamingo/${file}`, import.meta.url).href;
      await image.decode();
      const {width, height} = image;
      const canvas = document.createElement('canvas');
      canvas.width = width; canvas.height = height;
      const context = canvas.getContext('2d', {willReadFrequently: true});
      context.drawImage(image, 0, 0);
      const pixels = context.getImageData(0, 0, width, height).data;
      const visited = new Uint8Array(width * height);
      const stack = new Int32Array(width * height);
      const columns = [];
      for (let col = 0; col < 2; col++) {
        const left = Math.ceil(col * width / 2), right = Math.floor((col + 1) * width / 2) - 1;
        const components = [];
        for (let y = 0; y < height; y++) for (let x = left; x <= right; x++) {
          const first = y * width + x;
          if (visited[first] || pixels[first * 4 + 3] < 24) continue;
          let count = 0, minX = x, maxX = x, minY = y, maxY = y, top = 0;
          stack[top++] = first; visited[first] = 1;
          while (top) {
            const n = stack[--top], xx = n % width, yy = Math.floor(n / width);
            count++; minX = Math.min(minX, xx); maxX = Math.max(maxX, xx); minY = Math.min(minY, yy); maxY = Math.max(maxY, yy);
            for (const next of [n - 1, n + 1, n - width, n + width]) {
              const nx = next % width;
              if (next < 0 || next >= width * height || nx < left || nx > right || visited[next] || pixels[next * 4 + 3] < 24) continue;
              visited[next] = 1; stack[top++] = next;
            }
          }
          if (count > 500) components.push({bounds: [minX, minY, maxX, maxY], count});
        }
        const birds = components.sort((a, b) => b.count - a.count).slice(0, 2).sort((a, b) => a.bounds[1] - b.bounds[1]);
        if (birds.length !== 2) throw new Error(`${file}: cannot isolate two birds in column ${col}`);
        columns.push(birds);
      }
      sequence.pages.push({file, width, height});
      for (let row = 0; row < 2; row++) for (let col = 0; col < 2; col++) {
        const bounds = columns[col][row].bounds;
        const previous = columns[col][row - 1], next = columns[col][row + 1];
        const y0 = previous ? Math.floor((previous.bounds[3] + bounds[1]) / 2) : 0;
        const y1 = next ? Math.floor((bounds[3] + next.bounds[1]) / 2) : height;
        const cellWidth = width / 2, left = col * cellWidth;
        const extended = name === 'flight' || page >= 4;
        const probe = Math.round(left + cellWidth * (extended ? .82 : .57));
        let neckY = -1;
        for (let y = bounds[1]; y <= bounds[3]; y++) {
          if (pixels[(y * width + probe) * 4 + 3] < 160) continue;
          let a = probe, b = probe;
          while (a > left && pixels[(y * width + a - 1) * 4 + 3] > 160) a--;
          while (b < left + cellWidth - 1 && pixels[(y * width + b + 1) * 4 + 3] > 160) b++;
          if (b - a >= cellWidth * .035) neckY = y;
        }
        if (neckY < 0) throw new Error(`${file}: no torso/neck registration for frame ${row * 2 + col}`);
        let contactSum = 0, contactPixels = 0;
        for (let y = Math.max(bounds[1], bounds[3] - 2); y <= bounds[3]; y++) {
          for (let x = bounds[0]; x <= bounds[2]; x++) {
            if (pixels[(y * width + x) * 4 + 3] > 64) { contactSum += x; contactPixels++; }
          }
        }
        const contact = [contactPixels ? contactSum / contactPixels : (bounds[0] + bounds[2]) / 2, bounds[3]];
        const pivot = [left + cellWidth * .445, neckY + cellWidth * .025];
        if (extended) {
          // The extended head is unoccluded throughout the wingbeat: use it to suppress drift.
          let minX = width, maxX = 0, minY = height, maxY = 0;
          for (let y = bounds[1]; y <= bounds[3]; y++) for (let x = Math.ceil(left + cellWidth * .88); x < left + cellWidth; x++) {
            if (pixels[(y * width + x) * 4 + 3] < 160) continue;
            minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
          }
          if (maxX >= minX) { pivot[0] = (minX + maxX) / 2 - cellWidth * .49; pivot[1] = (minY + maxY) / 2 + cellWidth * .035; }
        }
        sequence.frames.push({page, rect: [left, y0, cellWidth, y1 - y0], pivot, unitScale: manifest.canonicalWidth / cellWidth, bounds, contact});
      }
    }
    if (name === 'takeoff') {
      // These running feet cross the automatic neck probe; register the torso explicitly.
      sequence.frames[4].pivot[1] = 346.675;
      sequence.frames[6].pivot[1] = 943;
      sequence.frames[7].pivot[1] = 945;
      // Interleave the two rising-wing pages instead of restarting the upstroke.
      const order = [0,1,2,3,4,5,6,7,8,12,9,13,10,14,11,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31];
      sequence.frames = order.map(index => sequence.frames[index]);
    }
    manifest[name] = sequence;
  }
  manifest.pair = await measureCoupleSprite();
  return manifest;
}
