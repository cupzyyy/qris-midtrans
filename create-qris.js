// api/create_qris.js
// NOTE: ganti SERVER_KEY dengan server key Midtrans sandbox/live
// This function also writes small local store to /tmp/transactions.json (ephemeral).
import fs from 'fs';
import path from 'path';

const STORE_PATH = '/tmp/transactions.json'; // ephemeral in serverless
const SERVER_KEY = process.env.MIDTRANS_SERVER_KEY || 'SB-Mid-server-eSOUgioR8OgufA3ELye3ICjU'; // set env var in Vercel for production

function loadStore() {
  try {
    if (fs.existsSync(STORE_PATH)) {
      const raw = fs.readFileSync(STORE_PATH, 'utf8');
      return JSON.parse(raw || '{}');
    }
  } catch (e) { /* ignore */ }
  return {};
}
function saveStore(obj) {
  try {
    fs.writeFileSync(STORE_PATH, JSON.stringify(obj, null, 2), 'utf8');
  } catch (e) { /* ignore */ }
}

export default async function handler(req, res) {
  const amount = parseInt(req.query.amount || '0', 10);
  if (!amount || amount < 1000) {
    return res.status(400).json({ error: 'Invalid amount. Minimal Rp1000' });
  }

  const orderId = 'INV-' + Date.now();
  const auth = Buffer.from(SERVER_KEY + ':').toString('base64');

  const payload = {
    payment_type: 'qris',
    transaction_details: {
      order_id: orderId,
      gross_amount: amount
    }
    // qris: { acquirer: 'gopay' } // optional — Midtrans determines acquirer
  };

  try {
    const r = await fetch('https://api.sandbox.midtrans.com/v2/charge', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    const j = await r.json();

    // j will include qr_string or actions -- store initial status
    const store = loadStore();
    store[orderId] = {
      order_id: orderId,
      gross_amount: amount,
      transaction_status: (j.transaction_status || 'pending'),
      response: j,
      updated_at: new Date().toISOString()
    };
    saveStore(store);

    // normalize response: include qr_string if present
    // Midtrans QRIS: sometimes response contains 'qr_string' or in 'actions' field
    let qr_string = j.qr_string || null;
    if (!qr_string && Array.isArray(j.actions)) {
      // try find QR data
      const q = j.actions.find(a => a.name && a.name.toLowerCase().includes('qr'));
      if (q && q.url) qr_string = q.url;
    }
    // Some Midtrans responses include 'actions[0].url' containing payment link; for our QR we use qrstring if exists
    return res.status(200).json({
      order_id: orderId,
      transaction_status: store[orderId].transaction_status,
      qr_string: qr_string || (j.redirect_url || j.actions?.[0]?.url) || null,
      raw: j
    });
  } catch (err) {
    console.error('create_qris error', err);
    return res.status(500).json({ error: 'Gagal koneksi ke Midtrans', details: err.message });
  }
}