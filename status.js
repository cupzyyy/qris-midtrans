// api/status.js
import fs from 'fs';
const STORE_PATH = '/tmp/transactions.json';
function loadStore() {
  try { if (fs.existsSync(STORE_PATH)) return JSON.parse(fs.readFileSync(STORE_PATH,'utf8')||'{}'); } catch(e){}
  return {};
}

export default function handler(req, res) {
  const order_id = req.query.order_id;
  if (!order_id) return res.status(400).json({ error: 'order_id required' });
  const store = loadStore();
  const info = store[order_id];
  if (!info) return res.status(404).json({ error: 'order not found' });
  return res.status(200).json(info);
}