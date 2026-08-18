const enc = new TextEncoder()
const dec = new TextDecoder()
export const bytes = (n: number) => crypto.getRandomValues(new Uint8Array(n))
export const token = (n = 32) => b64(bytes(n))
export const pin = () => Array.from(bytes(10), (v) => String(v % 10)).join('')
export const b64 = (input: Uint8Array) => btoa(String.fromCharCode(...input)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
function fromB64(value: string) {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4)
  return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0))
}
export async function digest(value: string, secret: string) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return b64(new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(value))))
}
async function codeKey(secret: string) {
  const material = await crypto.subtle.digest('SHA-256', enc.encode(`upload-grant-code:${secret}`))
  return crypto.subtle.importKey('raw', material, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt'])
}
export async function sealCode(value: string, secret: string) {
  const iv = bytes(12)
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: enc.encode('upload-grant-code:v1') }, await codeKey(secret), enc.encode(value))
  return `v1.${b64(iv)}.${b64(new Uint8Array(ciphertext))}`
}
export async function revealCode(value: string, secret: string) {
  const [version, ivValue, ciphertextValue] = value.split('.')
  if (version !== 'v1' || !ivValue || !ciphertextValue) throw new Error('invalid_code_ciphertext')
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(ivValue), additionalData: enc.encode('upload-grant-code:v1') }, await codeKey(secret), fromB64(ciphertextValue))
  return dec.decode(plaintext)
}
export const safeEqual = (a: string, b: string) => a.length === b.length && [...a].every((c, i) => c === b[i])
