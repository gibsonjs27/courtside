import { useEffect, useState, type FormEvent } from 'react'
import { supabase } from './store'
import { allowedVideoLink, connectOneDrive, finishOneDriveConnection, oneDriveConfigured, oneDriveConnected,
  revokeOneDriveClip, shareOneDriveClip, trashOneDriveClip, uploadOneDriveClip } from './oneDrive'

export type Highlight = { id: string; game_id: string; title: string; embed_url: string; inline_player: boolean }
type Clip = { id: string; title: string; item_id: string; embed_url: string | null; permission_id: string | null }
const message = (error: unknown) => error instanceof Error ? error.message : String(error)
const check = ({ error }: { error: { message: string } | null }) => { if (error) throw new Error(error.message) }

function Player({ title, url, inline }: { title: string; url: string; inline: boolean }) {
  const [playing, setPlaying] = useState(false)
  const embed = allowedVideoLink(url)
  if (!embed) return null
  const external = <a className="highlight-external" href={embed} target="_blank" rel="noreferrer"
    aria-label={'Watch ' + title + ' in OneDrive'}>Play in OneDrive ↗</a>
  if (!inline) return external
  return <>
    <div className="highlight-actions">
      <button type="button" className="highlight-play" aria-expanded={playing} onClick={() => setPlaying(!playing)}>
        {playing ? 'Close player' : 'Play here'}
      </button>
      {external}
    </div>
    {playing && <iframe className="highlight-player" src={embed} title={title} allow="autoplay; fullscreen; picture-in-picture" allowFullScreen referrerPolicy="no-referrer" />}
  </>
}

export function usePublicHighlights() {
  const [clips, setClips] = useState<Highlight[]>([])
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    if (!supabase || !oneDriveConfigured) return
    let active = true
    void supabase.from('published_highlights').select('id,game_id,title,embed_url,inline_player').order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (!active) return
        if (error) setFailed(true)
        else setClips((data ?? []).filter(clip => allowedVideoLink(clip.embed_url)))
      })
    return () => { active = false }
  }, [])
  return { clips, failed }
}

export function GameHighlights({ clips }: { clips: Highlight[] }) {
  return <div className="highlight-grid">{clips.map(clip => <article key={clip.id}>
    <h3>{clip.title}</h3>
    <Player key={clip.embed_url} title={clip.title} url={clip.embed_url} inline={clip.inline_player !== false} />
  </article>)}</div>
}

export default function GameClips({ gameId, pending, onClipsLoaded }: { gameId: string; pending: boolean; onClipsLoaded: (gameId: string, count: number) => void }) {
  const [clips, setClips] = useState<Clip[]>([])
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [connected, setConnected] = useState(oneDriveConnected)
  const [unsavedClip, setUnsavedClip] = useState<{ itemId: string; title: string; ownerId: string }>()
  const client = supabase
  const load = async () => {
    if (!client) return
    const result = await client.from('game_clips').select('id,title,item_id,embed_url,permission_id,video_url,video_permission_id').eq('game_id', gameId).order('created_at', { ascending: false })
    check(result)
    setClips((result.data ?? []).map(clip => ({
      ...clip, embed_url: clip.video_url ?? clip.embed_url, permission_id: clip.video_permission_id ?? clip.permission_id,
    })))
    onClipsLoaded(gameId, result.data?.length ?? 0)
    setLoaded(true)
  }
  useEffect(() => {
    if (!oneDriveConfigured || !client) return
    let active = true
    void finishOneDriveConnection().then(() => {
      if (active) setConnected(oneDriveConnected())
    }).catch(error => { if (active) setNotice(message(error)) })
    void load().catch(error => { if (active) setNotice(message(error)) })
    return () => { active = false }
  }, [gameId])

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true)
    setNotice('')
    try { await action() }
    catch (error) { setNotice(message(error)) }
    finally { setConnected(oneDriveConnected()); setBusy(false) }
  }

  if (!client || !oneDriveConfigured) return null

  const saveClip = async (clip: { itemId: string; title: string; ownerId: string }) => {
    check(await client.from('game_clips').upsert({
      game_id: gameId, owner_id: clip.ownerId, title: clip.title, item_id: clip.itemId,
    }, { onConflict: 'owner_id,item_id', ignoreDuplicates: true }))
    setUnsavedClip(undefined)
    await load()
  }

  const upload = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = event.currentTarget
    const data = new FormData(form)
    const file = data.get('video')
    const title = String(data.get('title')).trim()
    if (!(file instanceof File) || !file.size || !title) {
      setNotice('Enter a title and choose a video.')
      return
    }
    void run(async () => {
      const user = await client.auth.getUser()
      check(user)
      if (!user.data.user) throw new Error('Sign in to Courtside to upload a clip.')
      const item = await uploadOneDriveClip(file)
      const clip = { itemId: item.id, title, ownerId: user.data.user.id }
      setUnsavedClip(clip)
      form.reset()
      await saveClip(clip)
    })
  }

  return <section className="edit-details clips-admin" aria-label="Video clips">
    <h3>Video clips</h3>
    <p>Upload to OneDrive, then publish individual clips to Highlights.</p>
    {!connected && <button type="button" disabled={busy} onClick={() => void run(() => connectOneDrive(gameId))}>Connect OneDrive</button>}
    {connected && loaded && !pending && !unsavedClip && <form className="game-form" onSubmit={upload}>
      <label>Clip title<input name="title" required maxLength={100} /></label>
      <label>Video<input name="video" type="file" accept="video/mp4,video/quicktime,video/x-m4v,.mp4,.mov,.m4v" required /></label>
      <button className="primary" disabled={busy}>{busy ? 'Working…' : 'Upload clip'}</button>
    </form>}
    {pending && <p>Wait for the game to sync before uploading.</p>}
    {unsavedClip && <button type="button" disabled={busy} onClick={() => void run(() => saveClip(unsavedClip))}>Retry attaching uploaded clip</button>}
    {notice && <p role="alert">{notice}</p>}
    <ul className="clip-list">{clips.map(clip => <li key={clip.id}>
      <strong>{clip.title}</strong><span>{clip.embed_url ? 'Public' : 'Private'}</span>
      <div className="action-row">
        <button type="button" disabled={busy || !connected} onClick={() => {
          if (!clip.embed_url && !confirm('Publish this clip for anyone to watch?')) return
          void run(async () => {
            if (clip.permission_id) {
              await revokeOneDriveClip(clip.item_id, clip.permission_id)
              check(await client.from('game_clips').update({ embed_url: null, permission_id: null, video_url: null, video_permission_id: null }).eq('id', clip.id))
            } else {
              const link = await shareOneDriveClip(clip.item_id)
              check(await client.from('game_clips').update({ video_url: link.url, video_permission_id: link.permissionId, inline_player: link.inline }).eq('id', clip.id))
            }
            await load()
          })
        }}>{clip.embed_url ? 'Unpublish clip' : 'Publish clip'}</button>
        <button type="button" disabled={busy || !connected} onClick={() => {
          if (!confirm('Remove this clip from Courtside and move its OneDrive file to the recycle bin?')) return
          void run(async () => {
            await trashOneDriveClip(clip.item_id)
            check(await client.from('game_clips').delete().eq('id', clip.id))
            await load()
          })
        }}>Delete clip</button>
      </div>
    </li>)}</ul>
  </section>
}
