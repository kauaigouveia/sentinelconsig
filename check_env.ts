
import fs from 'fs';
import dotenv from 'dotenv';

const allEnv = { ...process.env };
if (fs.existsSync('.env')) {
  const envConfig = dotenv.parse(fs.readFileSync('.env'));
  Object.assign(allEnv, envConfig);
}

for (const [key, value] of Object.entries(allEnv)) {
  if (key.includes('URL') || key.includes('DATABASE')) {
    try {
      if (typeof value === 'string' && value.startsWith('postgresql://')) {
         const url = new URL(value);
         console.log(`${key}: Host=${url.hostname}, Port=${url.port || '5432'}, DB=${url.pathname.slice(1)}, Params=${url.search}`);
      } else {
         // console.log(`${key}: [NOT A POSTGRES URL]`);
      }
    } catch (e) {
      console.log(`${key}: [PRESENT, INVALID URL]`);
    }
  }
}
