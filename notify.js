// api/notify.js
import fs from 'fs';
const STORE_PATH = '/tmp/transactions.json';
const SERVER_KEY = process.env.MIDTRANS_SERVER_KEY || 'SB-Mid-server-bOIP842TZo_2Sh3N45fDAC0K';
function loadStore() {
  try {
    if (fs.existsSync(STORE_PATH)) return JSON.parse(fs.readFileSync(STORE_PATH,'utf8')||'{}');
  } catch(e){}
  return {};
}
function saveStore(obj) {
  try { fs.writeFileSync(STORE_PATH, JSON.stringify(obj,null,2),'utf8'); } catch(e){}
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const body = req.body && Object.keys(req.body).length ? req.body : await new Promise(r=> {
    let data='';
    req.on('data',c=>data+=c);
    req.on('end',()=>r(JSON.parse(data||'{}')));
  });

  // Midtrans sends keys such as order_id, status_code, gross_amount, signature_key, transaction_status
  const { order_id, status_code, gross_amount, signature_key, transaction_status } = body;

  // Validate signature: SHA512(order_id + status_code + gross_amount + serverKey)
  const crypto = await import('crypto');
  const expected = crypto.createHash('sha512').update(String(order_id||'') + String(status_code||'') + String(gross_amount||'') + String(SERVER_KEY)).digest('hex');

  if (!signature_key || signature_key !== expected) {
    console.warn('Invalid signature on notify', { order_id });
    return res.status(400).json({ status: 'invalid_signature' });
  }

  // update store
  const store = loadStore();
  if (!store[order_id]) store[order_id] = { order_id, gross_amount, transaction_status: transaction_status || status_code || 'unknown', updated_at: new Date().toISOString(), notifications: [] };
  store[order_id].transaction_status = transaction_status || store[order_id].transaction_status;
  store[order_id].status_code = status_code || store[order_id].status_code;
  store[order_id].updated_at = new Date().toISOString();
  store[order_id].notifications = store[order_id].notifications || [];
  store[order_id].notifications.push({ body, received_at: new Date().toISOString() });

  saveStore(store);

  // return 200 OK to Midtrans
  res.status(200).json({ status: 'ok' });
}