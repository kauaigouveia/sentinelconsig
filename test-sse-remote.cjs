async function run() {
  const loginRes = await fetch('http://localhost:3000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'kauaigouveia@gmail.com', password: process.env.INITIAL_MASTER_PASSWORD })
  });
  const cookie = (loginRes.headers.get('set-cookie') || '').split(';')[0];

  try {
    const reqRemote = await fetch('https://sentinelconsig.vercel.app/api/realtime', {
      headers: { 'Cookie': cookie }
    });
    console.log('\n--- REMOTE ---');
    console.log('Status:', reqRemote.status);
    console.log('Headers:', Array.from(reqRemote.headers.entries()).map(([k,v]) => `${k}: ${v}`).join(', '));
    const readerRemote = reqRemote.body.getReader();
    const chunkRemote = await readerRemote.read();
    console.log('First chunk (REMOTE):', new TextDecoder().decode(chunkRemote.value));
    readerRemote.cancel();
  } catch (e) {
    console.log('\n--- REMOTE ERROR ---');
    console.log(e.message);
  }
}
run();
