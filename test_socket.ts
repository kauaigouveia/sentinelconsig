
import net from 'net';

const host = 'ep-nameless-recipe-acuzyhg3-pooler.sa-east-1.aws.neon.tech';
const port = 5432;

const start = Date.now();
const socket = new net.Socket();

socket.setTimeout(2000);

socket.connect(port, host, () => {
  console.log(`Connected to ${host}:${port} in ${Date.now() - start}ms`);
  socket.destroy();
});

socket.on('error', (err) => {
  console.error(`Connection failed to ${host}:${port} in ${Date.now() - start}ms: ${err.message}`);
  socket.destroy();
});

socket.on('timeout', () => {
  console.error(`Connection timed out to ${host}:${port} in ${Date.now() - start}ms`);
  socket.destroy();
});
