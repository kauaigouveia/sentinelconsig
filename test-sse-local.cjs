async function run() {
  const loginRes = await fetch('http://localhost:3000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'kauaigouveia@gmail.com', password: process.env.INITIAL_MASTER_PASSWORD })
  });
  const cookie = (loginRes.headers.get('set-cookie') || '').split(';')[0];
  
  const reqLocal = await fetch('http://localhost:3000/api/realtime', {
    headers: { 'Cookie': cookie }
  });
  console.log('--- LOCAL ---');
  console.log('Status:', reqLocal.status);
  console.log('Headers:', Array.from(reqLocal.headers.entries()).map(([k,v]) => `${k}: ${v}`).join(', '));
  
  const readerLocal = reqLocal.body.getReader();
  const chunkLocal = await readerLocal.read();
  console.log('First chunk (LOCAL):', new TextDecoder().decode(chunkLocal.value));

  // wait 30s to see if heartbeat drops
  setTimeout(async () => {
     console.log('Reading next chunk...');
     try {
       const chunk2 = await readerLocal.read();
       console.log('Next chunk (LOCAL):', new TextDecoder().decode(chunk2.value));
     } catch(e) {
       console.log('Error reading next chunk', e);
     }
     readerLocal.cancel();
     process.exit(0);
  }, 30000);
}
run();
