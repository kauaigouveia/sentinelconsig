const fs = require('fs');
const path = require('path');
const jpeg = require('jpeg-js');
const { PNG } = require('pngjs');

const inputPath = path.join(__dirname, 'src/assets/images/evolve_logo_png_1789068933814.jpg');
const outputPath = path.join(__dirname, 'public/evolve_logo.png');

if (!fs.existsSync(inputPath)) {
  console.error('Input file not found:', inputPath);
  process.exit(1);
}

const jpegData = fs.readFileSync(inputPath);
const rawJpeg = jpeg.decode(jpegData, { useTArray: true });

const png = new PNG({
  width: rawJpeg.width,
  height: rawJpeg.height,
});

for (let y = 0; y < rawJpeg.height; y++) {
  for (let x = 0; x < rawJpeg.width; x++) {
    const idx = (rawJpeg.width * y + x) * 4;
    
    const r = rawJpeg.data[idx];
    const g = rawJpeg.data[idx + 1];
    const b = rawJpeg.data[idx + 2];

    png.data[idx] = r;
    png.data[idx + 1] = g;
    png.data[idx + 2] = b;

    // Determine background whiteness
    // High brightness threshold for pure white / near white background
    const minComponent = Math.min(r, g, b);
    const maxComponent = Math.max(r, g, b);
    const isGrayish = (maxComponent - minComponent) < 25;

    if (r > 220 && g > 220 && b > 220 && isGrayish) {
      // Calculate smooth alpha transition for antialiasing
      const avg = (r + g + b) / 3;
      if (avg >= 245) {
        png.data[idx + 3] = 0; // Completely transparent
      } else {
        // Feather edge
        const alpha = Math.round((245 - avg) / (245 - 220) * 255);
        png.data[idx + 3] = Math.max(0, Math.min(255, alpha));
      }
    } else {
      png.data[idx + 3] = 255; // Fully opaque logo
    }
  }
}

const buffer = PNG.sync.write(png);
fs.writeFileSync(outputPath, buffer);

// Also copy to src/assets/images and public/assets
fs.mkdirSync(path.join(__dirname, 'public/assets'), { recursive: true });
fs.writeFileSync(path.join(__dirname, 'public/assets/evolve_logo.png'), buffer);
fs.writeFileSync(path.join(__dirname, 'src/assets/images/evolve_logo.png'), buffer);

console.log('Successfully created transparent PNG logo at:', outputPath);
