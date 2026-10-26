const crypto = require('crypto');
const { promisify } = require('util');
const scrypt = promisify(crypto.scrypt);

function secret() {
  const s = process.env.JWT_SECRET;
  if (!s || s.length < 16) throw new Error('Falta JWT_SECRET (16+ caracteres)');
  return s;
}
const b64u = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');

function sign(payload, ttlSeconds) {
  const h = b64u({ alg: 'HS256', typ: 'JWT' });
  const p = b64u({ ...payload, exp: Math.floor(Date.now() / 1000) + ttlSeconds });
  const s = crypto.createHmac('sha256', secret()).update(h + '.' + p).digest('base64url');
  return h + '.' + p + '.' + s;
}
function verify(token) {
  try {
    const [h, p, s] = String(token).split('.');
    if (!h || !p || !s) return null;
    const exp = crypto.createHmac('sha256', secret()).update(h + '.' + p).digest();
    const got = Buffer.from(s, 'base64url');
    if (got.length !== exp.length || !crypto.timingSafeEqual(got, exp)) return null;
    const d = JSON.parse(Buffer.from(p, 'base64url').toString());
    return d.exp > Date.now() / 1000 ? d : null;
  } catch (e) { return null; }
}
async function hashPw(pw) {
  const salt = crypto.randomBytes(16);
  const k = await scrypt(pw, salt, 64);
  return 's1$' + salt.toString('base64') + '$' + k.toString('base64');
}
async function checkPw(pw, stored) {
  if (!stored) return false;
  const [v, s, k] = String(stored).split('$');
  if (v !== 's1') return false;
  const d = await scrypt(pw, Buffer.from(s, 'base64'), 64);
  const kb = Buffer.from(k, 'base64');
  return d.length === kb.length && crypto.timingSafeEqual(d, kb);
}
const sha = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
const sameStr = (a, b) => crypto.timingSafeEqual(crypto.createHash('sha256').update(String(a)).digest(), crypto.createHash('sha256').update(String(b)).digest());
const newToken = () => crypto.randomBytes(24).toString('base64url');

module.exports = { secret, sign, verify, hashPw, checkPw, sha, sameStr, newToken };
