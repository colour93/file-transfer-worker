import { AwsClient } from 'aws4fetch'
import type { Env } from './types'

const client = (env: Env) => new AwsClient({ accessKeyId: env.S3_ACCESS_KEY_ID, secretAccessKey: env.S3_SECRET_ACCESS_KEY, region: env.S3_REGION || 'auto', service: 's3' })
const urlFor = (env: Env, key: string) => { const endpoint = new URL(env.S3_ENDPOINT); const encodedKey = key.split('/').map(encodeURIComponent).join('/'); if (env.S3_FORCE_PATH_STYLE === 'true') return `${endpoint.origin}/${encodeURIComponent(env.S3_BUCKET)}/${encodedKey}`; endpoint.hostname = `${env.S3_BUCKET}.${endpoint.hostname}`; endpoint.pathname = `/${encodedKey}`; return endpoint.toString() }
export const md5Base64 = (hex: string) => btoa(String.fromCharCode(...(hex.match(/.{2}/g) || []).map((part) => Number.parseInt(part, 16))))
export const presignPut = (env: Env, key: string, contentType: string, md5Hex: string, ttl: number) => { const url = new URL(urlFor(env, key)); url.searchParams.set('X-Amz-Expires', String(ttl)); return client(env).sign(new Request(url, { method: 'PUT', headers: { 'content-type': contentType, 'content-md5': md5Base64(md5Hex), 'x-amz-meta-md5': md5Hex } }), { aws: { signQuery: true } }).then((r) => r.url) }
export const presignGet = (env: Env, key: string, filename: string, ttl: number) => { const url = new URL(urlFor(env, key)); url.searchParams.set('response-content-disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`); url.searchParams.set('X-Amz-Expires', String(ttl)); return client(env).sign(new Request(url, { method: 'GET' }), { aws: { signQuery: true } }).then((r) => r.url) }
export const headObject = (env: Env, key: string) => client(env).fetch(urlFor(env, key), { method: 'HEAD' })
export const deleteObject = (env: Env, key: string) => client(env).fetch(urlFor(env, key), { method: 'DELETE' })
