import { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import type { Session } from '@supabase/supabase-js'
import Admin, { SignIn } from './Admin'
import PublicView from './PublicView'
import { discardPending, fetchPublic, local, record, supabase, sync, type LocalState } from './store'
import type { Command, Game } from './model'
import './styles.css'

const demo = !supabase
const authCache = 'courtside-admin:' + new URL(import.meta.env.BASE_URL, location.href).pathname
const message = (error: unknown) => error instanceof Error ? error.message : String(error)

function Ball() {
  return <span className="brand-ball" aria-hidden="true"><i/><b/></span>
}

function App() {
  const [admin, setAdmin] = useState(location.hash === '#admin')
  const [session, setSession] = useState<Session | null>(null)
  const [verified, setVerified] = useState<string>()
  const [authReady, setAuthReady] = useState(demo)
  const [online, setOnline] = useState(navigator.onLine)
  const [publicState, setPublicState] = useState<LocalState>()
  const [privateState, setPrivateState] = useState<{ scope: string; state: LocalState }>()
  const [notice, setNotice] = useState('')
  const [syncError, setSyncError] = useState('')
  const [refresh, setRefresh] = useState(0)
  const [publicRefresh, setPublicRefresh] = useState(0)
  const syncing = useRef(false)
  const user = session?.user.id
  const scope = demo ? 'demo' : user && verified === user ? user : undefined
  const scoped = privateState?.scope === scope ? privateState?.state : undefined

  useEffect(() => {
    const navigate = () => { setAdmin(location.hash === '#admin'); setNotice('') }
    const network = () => setOnline(navigator.onLine)
    addEventListener('hashchange', navigate)
    addEventListener('online', network)
    addEventListener('offline', network)
    const auth = supabase?.auth.onAuthStateChange((event, value) => {
      setSession(value)
      setAuthReady(true)
      if (event === 'SIGNED_OUT') { setVerified(undefined); setPrivateState(undefined) }
    })
    return () => {
      removeEventListener('hashchange', navigate)
      removeEventListener('online', network)
      removeEventListener('offline', network)
      auth?.data.subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    const client = supabase
    if (!client || !user) return
    let active = true
    if (!online && localStorage.getItem(authCache) === user) setVerified(user)
    if (online) void client.from('tracker_admins').select('user_id').eq('user_id', user).maybeSingle().then(({ data, error }) => {
      if (!active) return
      if (data) {
        setVerified(user)
        localStorage.setItem(authCache, user)
      } else if (error) {
        if (localStorage.getItem(authCache) === user) setVerified(user)
        setNotice('Could not verify admin access online. ' + error.message)
      } else {
        setVerified(undefined)
        localStorage.removeItem(authCache)
        setNotice('This account does not have tracker admin access.')
      }
    })
    return () => { active = false }
  }, [user, online])

  useEffect(() => {
    let active = true
    const update = (value: LocalState) => { if (active) setPublicState(value) }
    void local(demo ? 'demo' : 'public').then(update).catch(error => { if (active) setNotice(message(error)) })
    if (online && !demo) void fetchPublic().then(update).catch(error => { if (active && !admin) setNotice('Could not refresh public stats. ' + message(error)) })
    return () => { active = false }
  }, [admin, online, publicRefresh])

  useEffect(() => {
    if (!scope) return
    let active = true
    const update = (state: LocalState) => { if (active) setPrivateState({ scope, state }) }
    const refreshGames = async () => {
      try {
        const state = await local(scope)
        update(state)
        if (!online || scope === 'demo' || !active || syncing.current) return
        syncing.current = true
        try {
          update(await sync(scope))
          if (active) setSyncError('')
          if (state.queue.length && active) setPublicRefresh(value => value + 1)
        } catch (error) {
          if (active) {
            setSyncError(message(error))
            update(await local(scope))
          }
        } finally { syncing.current = false }
      } catch (error) { if (active) setNotice(message(error)) }
    }
    void refreshGames()
    const interval = setInterval(refreshGames, 5000)
    return () => { active = false; clearInterval(interval) }
  }, [scope, online, refresh])

  const write = async (kind: Command['kind'], game: Game) => {
    if (!scope) return false
    try {
      const state = await record(scope, kind, game)
      setPrivateState({ scope, state })
      if (demo) setPublicState(state)
      else setRefresh(value => value + 1)
      setNotice('')
      return true
    } catch (error) {
      setNotice(message(error))
      setRefresh(value => value + 1)
      return false
    }
  }
  const signIn = async (email: string, password: string) => {
    setNotice('')
    const { error } = await supabase!.auth.signInWithPassword({ email, password })
    if (error) setNotice(error.message)
  }
  const signOut = async () => {
    const { error } = await supabase!.auth.signOut({ scope: 'local' })
    if (error) setNotice(error.message)
    else { localStorage.removeItem(authCache); setNotice(''); setSyncError('') }
  }
  const discard = async () => {
    if (!scope || !scoped || !confirm('Discard all pending changes on this device and reload the server’s games? Export the queue first if you need a copy.')) return
    try {
      const state = await discardPending(scope, scoped.queue.map(command => command.id))
      setPrivateState({ scope, state })
      setSyncError('')
    } catch (error) { setNotice(message(error)) }
  }

  return <>
    <header className="site-header"><div className="shell nav">
      <a className="brand" href="#profile" aria-label="Courtside home"><Ball/><span>COURTSIDE</span><small>PLAYER TRACKER</small></a>
      <nav aria-label="Main navigation">
        <a href="#profile" aria-current={!admin ? 'page' : undefined}>Player profile</a>
        <a href="#admin" aria-current={admin ? 'page' : undefined}>Admin</a>
      </nav>
    </div></header>
    <main className="shell">
      {(notice || (admin && scope && syncError)) && <div className="notice" role="alert">{notice || 'Sync issue. ' + syncError}</div>}
      {!admin ? <PublicView profile={publicState?.profile ?? null} games={publicState?.publicGames ?? []}/>
        : scope && scoped ? <Admin key={scope} state={scoped} write={write} retry={() => setRefresh(value => value + 1)} discard={() => void discard()} onSignOut={demo ? undefined : () => void signOut()} offline={!online}/>
        : !authReady || scope ? <p role="status">Opening game tracker…</p>
        : session ? <section className="panel credentials"><h1>Admin access</h1><p>{online ? 'Checking tracker access…' : 'Connect to the internet to verify this account.'}</p><button onClick={() => void signOut()}>Sign out</button></section>
        : <SignIn onSignIn={signIn}/>}
    </main>
    <footer className="shell site-footer"><span><Ball/> Courtside</span>{demo && <span>Demo mode · sample player and games</span>}</footer>
  </>
}

createRoot(document.getElementById('root')!).render(<App />)
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  void navigator.serviceWorker.register(new URL('sw.js', document.baseURI)).catch(console.error)
}
