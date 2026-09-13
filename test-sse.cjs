async function run() {
  const loginRes = await fetch('http://localhost:3000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'kauaigouveia@gmail.com', password: process.env.INITIAL_MASTER_PASSWORD })
  });
  const cookie = (loginRes.headers.get('set-cookie') || '').split(';')[0];
  
  // Teste local autenticado
  const reqLocal = await fetch('http://localhost:3000/api/realtime', {
    headers: { 'Cookie': cookie }
  });
  console.log('--- LOCAL ---');
  console.log('Status:', reqLocal.status);
  console.log('Headers:', Array.from(reqLocal.headers.entries()).map(([k,v]) => `${k}: ${v}`).join(', '));
  
  // Lendo apenas os primeiros bytes para validar
  const readerLocal = reqLocal.body.getReader();
  const chunkLocal = await readerLocal.read();
  console.log('First chunk (LOCAL):', new TextDecoder().decode(chunkLocal.value));
  reqLocal.body.cancel();

  // Teste remoto autenticado
  try {
    const reqRemote = await fetch('https://sentinelconsig.vercel.app/api/realtime', {
      headers: { 'Cookie': cookie },
      signal: AbortSignal.timeout(10000)
    });
    console.log('\n--- REMOTE ---');
    console.log('Status:', reqRemote.status);
    console.log('Headers:', Array.from(reqRemote.headers.entries()).map(([k,v]) => `${k}: ${v}`).join(', '));
    const readerRemote = reqRemote.body.getReader();
    const chunkRemote = await readerRemote.read();
    console.log('First chunk (REMOTE):', new TextDecoder().decode(chunkRemote.value));
    reqRemote.body.cancel();
  } catch (e) {
    console.log('\n--- REMOTE ERROR ---');
    console.log(e.message);
  }
}
run();
