// Measures the generated source without changing its pixels.
export async function measureCoupleSprite() {
  const image = new Image();
  image.src = new URL('../assets/flamingo/couple.png', import.meta.url).href;
  await image.decode();
  const {width, height} = image;
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const context = canvas.getContext('2d', {willReadFrequently: true});
  context.drawImage(image, 0, 0);
  const pixels = context.getImageData(0, 0, width, height).data;
  let left = width, top = height, right = 0, bottom = 0;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (pixels[(y * width + x) * 4 + 3] < 128) continue;
    left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
  }
  const row = Math.round(bottom - height * .12);
  const contacts = [0, 1].map(side => {
    let sum = 0, count = 0;
    for (let y = row - 2; y <= row + 2; y++) for (let x = Math.floor(side * width / 2); x < (side + 1) * width / 2; x++) {
      if (pixels[(y * width + x) * 4 + 3] >= 128) { sum += x; count++; }
    }
    if (!count) throw new Error('Cannot find the pair’s lower legs');
    return [sum / count, row];
  });
  return {pages: [{file: 'couple.png', width, height}], frames: [{page: 0, rect: [0, 0, width, height], pivot: [width / 2, height * .53], unitScale: 600 / width, bounds: [left, top, right, bottom], contacts}]};
}
