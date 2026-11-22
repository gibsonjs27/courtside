import { createClient } from '@supabase/supabase-js'
import { demoGames, demoProfile, demoPublic, summary, type Game, type Command, type GameWrite, type Profile, type PublicGame } from './model'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
if (Boolean(url) !== Boolean(key)) throw new Error('Configure both Supabase environment variables or leave both blank.')
export const supabase = url && key ? createClient(url, key) : null

export type LocalState = { games: Game[]; queue: Command[]; publicGames: PublicGame[]; profile: Profile | null }
const empty = (scope: string): LocalState => scope === 'demo'
  ? { games: demoGames(), queue: [], publicGames: demoPublic, profile: demoProfile }
  : { games: [], queue: [], publicGames: [], profile: null }

let database: Promise<IDBDatabase> | undefined
function openDatabase() {
  database ??= new Promise((resolve, reject) => {
    const request = indexedDB.open('courtside:' + new URL(import.meta.env.BASE_URL, location.href).pathname, 1)
    request.onupgradeneeded = () => request.result.createObjectStore('state')
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
  return database
}

export async function local(scope: string, change?: (state: LocalState) => void): Promise<LocalState> {
  const db = await openDatabase()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('state', change ? 'readwrite' : 'readonly')
    const store = transaction.objectStore('state')
    const request = store.get(scope)
    let state: LocalState
    let failure: unknown
    request.onsuccess = () => {
      state = request.result ?? empty(scope)
      if (!change) return
      try {
        change(state)
        store.put(state, scope)
      } catch (error) {
        failure = error
        transaction.abort()
      }
    }
    transaction.oncomplete = () => resolve(state)
    transaction.onabort = () => reject(failure ?? transaction.error ?? new Error('Could not save to this device.'))
  })
}

export function record(scope: string, kind: GameWrite, game: Game) {
  return local(scope, state => {
    const current = state.games.find(item => item.id === game.id)
    if ((current?.rev ?? 0) !== game.rev) throw new Error('This game changed. Reopen it and try again.')
    if ((kind === 'publish' || kind === 'save-and-publish') && game.status !== 'final') {
      throw new Error('Finalize the game before publishing.')
    }
    if (kind === 'delete') {
      if (!current || current.published) throw new Error('Only unpublished games can be deleted.')
      state.games = state.games.filter(item => item.id !== game.id)
      if (scope !== 'demo') state.queue.push({ id: crypto.randomUUID(), kind, game })
      return
    }
    const actions: Command['kind'][] = kind === 'save-and-publish' ? ['save', 'publish'] : [kind]
    let next = game
    for (const action of actions) {
      next = { ...next, rev: next.rev + 1, published: action === 'save' ? next.published : action === 'publish' }
      if (scope !== 'demo') state.queue.push({ id: crypto.randomUUID(), kind: action, game: next })
    }
    state.games = [next, ...state.games.filter(item => item.id !== game.id)]
    if (scope === 'demo' && kind !== 'save') {
      state.publicGames = state.publicGames.filter(item => item.id !== game.id)
      if (next.published) state.publicGames.push(summary(next))
    }
  })
}

export async function fetchPublic() {
  if (!supabase) return local('demo')
  const fields = 'id,date,opponent,us,them,pts,reb,ast,stl,blk'
  const [profile, result] = await Promise.all([
    supabase.from('public_profile').select('name,team,number,position,season').eq('id', 1).maybeSingle(),
    supabase.from('approved_games').select(`${fields},grade,venue,box`).order('date', { ascending: false }),
  ])
  const games = result.error?.code === '42703'
    ? await supabase.from('approved_games').select(`${fields},grade,venue`).order('date', { ascending: false })
    : result
  if (profile.error || games.error) throw new Error(profile.error?.message ?? games.error?.message)
  return local('public', state => {
    state.profile = profile.data
    state.publicGames = games.data ?? []
  })
}

export async function sync(scope: string) {
  if (!supabase || scope === 'demo' || !navigator.onLine) return local(scope)
  const client = supabase
  const run = async () => {
    while (true) {
      const state = await local(scope)
      const command = state.queue[0]
      if (!command) break
      const identity = { expected_owner: scope, command_id: command.id }
      const { error } = command.kind === 'delete'
        ? await client.rpc('delete_unpublished_game', { ...identity, game_id: command.game.id, expected_revision: command.game.rev })
        : await client.rpc('apply_game_command', { ...identity, action: command.kind, payload: command.game })
      if (error) throw new Error(error.message)
      await local(scope, latest => {
        latest.queue = latest.queue.filter(item => item.id !== command.id)
      })
    }
    const { data, error } = await client.from('private_games').select('data')
    if (error) throw new Error(error.message)
    return local(scope, state => {
      const pending = new Set(state.queue.map(item => item.game.id))
      state.games = [...state.games.filter(game => pending.has(game.id)), ...(data ?? [])
        .map(row => row.data as Game).filter(game => !pending.has(game.id))]
    })
  }
  return navigator.locks ? navigator.locks.request('courtside-sync:' + scope, run) : run()
}

export async function discardPending(scope: string, ids: string[]) {
  if (!supabase) return local(scope)
  const client = supabase
  const run = async () => {
    const { data, error } = await client.from('private_games').select('data')
    if (error) throw new Error(error.message)
    return local(scope, state => {
      if (state.queue.some(command => !ids.includes(command.id))) throw new Error('New changes were queued. Review them before discarding.')
      state.queue = []
      state.games = (data ?? []).map(row => row.data as Game)
    })
  }
  return navigator.locks ? navigator.locks.request('courtside-sync:' + scope, run) : run()
}
