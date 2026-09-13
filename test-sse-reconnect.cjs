async function run() {
  const loginRes = await fetch('http://localhost:3000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'kauaigouveia@gmail.com', password: process.env.INITIAL_MASTER_PASSWORD })
  });
  const cookie = (loginRes.headers.get('set-cookie') || '').split(';')[0];
  
  // Conectar
  const req = await fetch('http://localhost:3000/api/realtime', {
    headers: { 'Cookie': cookie }
  });
  const reader = req.body.getReader();
  
  // Pegar primeiro chunk (connected)
  const c1 = await reader.read();
  const c1Text = new TextDecoder().decode(c1.value);
  console.log('CONN 1:', c1Text.trim().split('\n')[0]);
  
  // Pegar segundo chunk (ping - em 25s)
  const c2 = await reader.read();
  const c2Text = new TextDecoder().decode(c2.value);
  console.log('CONN 2:', c2Text.trim().split('\n')[0]);
  
  reader.cancel();
}
run();
