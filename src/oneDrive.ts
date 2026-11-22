const clientId = import.meta.env.VITE_ONEDRIVE_CLIENT_ID
const redirectUri = new URL(import.meta.env.BASE_URL, location.href).href
const pendingKey = 'courtside-onedrive-pending:' + new URL(redirectUri).pathname
const authority = 'https://login.microsoftonline.com/consumers/oauth2/v2.0/'
const scope = 'https://graph.microsoft.com/Files.ReadWrite'
const graph = 'https://graph.microsoft.com/v1.0'
let accessToken = ''
let expires = 0
let exchange: Promise<void> | undefined

export const oneDriveConfigured = Boolean(clientId)
export const disconnectOneDrive = () => { accessToken = ''; expires = 0 }
export const oneDriveConnected = () => Boolean(accessToken) && Date.now() < expires - 60_000

const query = new URLSearchParams(location.search)
const pending = (() => {
  try {
    const raw = sessionStorage.getItem(pendingKey)
    if (!raw || !query.get('state')) return null
    const value = JSON.parse(raw) as { state: string; verifier: string; gameId: string }
    if (query.get('state') !== value.state) return null
    history.replaceState(null, '', redirectUri + '#admin')
    return value
  } catch { return null }
})()
export const oneDriveReturnGame = pending?.gameId

function base64url(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export async function connectOneDrive(gameId: string) {
  if (!clientId) throw new Error('OneDrive has not been configured for this site.')
  const state = crypto.randomUUID()
  const verifier = base64url(crypto.getRandomValues(new Uint8Array(32)))
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))
  sessionStorage.setItem(pendingKey, JSON.stringify({ state, verifier, gameId }))
  location.assign(authority + 'authorize?' + new URLSearchParams({
    client_id: clientId, scope, state, redirect_uri: redirectUri, response_type: 'code',
    code_challenge: base64url(new Uint8Array(digest)), code_challenge_method: 'S256', prompt: 'select_account',
  }))
}

export function finishOneDriveConnection() {
  if (!pending || !clientId) return Promise.resolve()
  exchange ??= (async () => {
    sessionStorage.removeItem(pendingKey)
    const code = query.get('code')
    if (!code) throw new Error('OneDrive sign-in was canceled or failed. Connect again to continue.')
    const response = await fetch(authority + 'token', {
      method: 'POST',
      body: new URLSearchParams({ client_id: clientId, code, code_verifier: pending.verifier,
        redirect_uri: redirectUri, grant_type: 'authorization_code', scope }),
    })
    if (!response.ok) throw new Error('OneDrive sign-in failed. Check the redirect URL and reconnect.')
    const data = await response.json() as { access_token: string; expires_in: number }
    accessToken = data.access_token
    expires = Date.now() + data.expires_in * 1000
  })()
  return exchange
}

class GraphError extends Error {
  constructor(readonly status: number) { super('OneDrive could not complete the request (' + status + ').') }
}

async function request<T>(path: string, init: RequestInit = {}, ignoreMissing = false): Promise<T> {
  if (!oneDriveConnected()) throw new Error('Connect OneDrive again to continue.')
  const headers = new Headers(init.headers)
  headers.set('Authorization', 'Bearer ' + accessToken)
  const response = await fetch(graph + path, { ...init, headers })
  if (response.status === 401) {
    accessToken = ''
    throw new Error('Your OneDrive session expired. Connect again to continue.')
  }
  if (response.status === 204 || (ignoreMissing && response.status === 404)) return undefined as T
  if (!response.ok) throw new GraphError(response.status)
  return response.json() as Promise<T>
}

const itemPath = (id: string) => '/me/drive/items/' + encodeURIComponent(id)
export const clipSizeLimit = 250_000_000

export async function uploadOneDriveClip(file: File) {
  const extension = file.name.match(/\.(mov|mp4|m4v)$/i)?.[1]
  if (!extension) throw new Error('Choose an MP4, MOV, or M4V video.')
  if (!file.size || file.size > clipSizeLimit) throw new Error('Choose a video smaller than 250 MB.')
  const folder = await request<{ id: string }>('/me/drive/special/approot')
  const filename = crypto.randomUUID() + '.' + extension.toLowerCase()
  return request<{ id: string }>(itemPath(folder.id) + ':/' + filename + ':/content', {
    method: 'PUT', headers: { 'Content-Type': file.type || 'application/octet-stream' }, body: file,
  })
}

export function allowedVideoLink(input?: string | null) {
  if (!input) return null
  try {
    const url = new URL(input)
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return null
    if (url.host === 'onedrive.live.com' && ['/embed', '/'].includes(url.pathname) && url.search) return url.href
    if (url.host === '1drv.ms' && /^\/(?:v\/)?[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*$/.test(url.pathname)) return url.href
    return null
  } catch { return null }
}

export async function shareOneDriveClip(item: string) {
  const createLink = (type: 'embed' | 'view') =>
    request<{ id: string; link?: { webUrl?: string; webHtml?: string } }>(itemPath(item) + '/createLink', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(type === 'embed' ? { type } : { type, scope: 'anonymous' }),
    })
  let embedded
  try { embedded = await createLink('embed') }
  catch (error) {
    if (!(error instanceof GraphError) || ![400, 403, 405, 501].includes(error.status)) throw error
  }
  if (embedded?.id) {
    const iframe = new DOMParser().parseFromString(embedded.link?.webHtml ?? '', 'text/html').querySelector('iframe')
    const url = allowedVideoLink(iframe?.getAttribute('src')) ?? allowedVideoLink(embedded.link?.webUrl)
    if (url) return { url, permissionId: embedded.id, inline: true }
    await revokeOneDriveClip(item, embedded.id)
  }
  const shared = await createLink('view')
  const url = allowedVideoLink(shared.link?.webUrl)
  if (url && shared.id) return { url, permissionId: shared.id, inline: false }
  if (shared.id) await revokeOneDriveClip(item, shared.id)
  throw new Error('OneDrive did not return a usable public video link.')
}

export const revokeOneDriveClip = (item: string, permission: string) =>
  request<void>(itemPath(item) + '/permissions/' + encodeURIComponent(permission), { method: 'DELETE' }, true)

export const trashOneDriveClip = (item: string) => request<void>(itemPath(item), { method: 'DELETE' }, true)
