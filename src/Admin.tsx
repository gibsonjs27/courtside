import StatsExplorer from './StatsExplorer'
import { useRef, useState, type FormEvent } from 'react'
import { gameDate, grades, venues, newest, newGame, points, stats, summary, statLabels, totals, type GameWrite, type Game, type Stat } from './model'
import type { LocalState } from './store'

type Write = (kind: GameWrite, game: Game) => Promise<boolean>

export function SignIn({ onSignIn }: { onSignIn: (email: string, password: string) => Promise<void> }) {
  const [busy, setBusy] = useState(false)
  return <section className="panel credentials">
    <h1>Admin sign-in</h1><p>Sign in to track games and manage public stats.</p>
    <form onSubmit={async event => {
      event.preventDefault()
      const data = new FormData(event.currentTarget)
      setBusy(true)
      try { await onSignIn(String(data.get('email')), String(data.get('password'))) }
      finally { setBusy(false) }
    }}>
      <label>Email<input name="email" type="email" autoComplete="username" required /></label>
      <label>Password<input name="password" type="password" autoComplete="current-password" required /></label>
      <button className="primary" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
    </form>
  </section>
}

function BoxForm({ initial, busy, onSave, onCancel }: {
  initial: Game; busy: boolean; onSave: (game: Game, kind: GameWrite) => void; onCancel?: () => void
}) {
  const [counts, setCounts] = useState(initial.counts)
  const box = initial.mode === 'box'
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const opponent = String(data.get('opponent')).trim()
    if (!opponent) {
      const field = event.currentTarget.elements.namedItem('opponent') as HTMLInputElement
      field.setCustomValidity('Enter an opponent.')
      field.reportValidity()
      return
    }
    const publish = (event.nativeEvent as SubmitEvent).submitter?.getAttribute('value') === 'publish'
    const grade = grades.find(value => value === data.get('grade')) ?? ''
    const venue = venues.find(value => value === data.get('venue')) ?? ''
    onSave({ ...initial, counts, grade, venue, opponent, date: String(data.get('date')),
      us: Number(data.get('us')), them: Number(data.get('them')), notes: String(data.get('notes')) },
    publish ? 'save-and-publish' : 'save')
  }
  return <form className="game-form" onSubmit={submit}>
    <div className="form-grid">
      <label>Opponent<input required name="opponent" maxLength={80} defaultValue={initial.opponent} onInput={event => event.currentTarget.setCustomValidity('')} /></label>
      <label>Game date<input required name="date" type="date" defaultValue={initial.date} /></label>
      <label>Grade<select name="grade" defaultValue={initial.grade ?? ''}><option value="">Unspecified</option>{grades.map(grade => <option key={grade} value={grade}>Grade {grade}</option>)}</select></label>
      <label>Venue<select name="venue" defaultValue={initial.venue ?? ''}><option value="">Unspecified</option>{venues.map(venue => <option key={venue}>{venue}</option>)}</select></label>
      <label>Team score<input required name="us" type="number" inputMode="numeric" min="0" max="999" defaultValue={initial.us} /></label>
      <label>Opponent score<input required name="them" type="number" inputMode="numeric" min="0" max="999" defaultValue={initial.them} /></label>
    </div>
    {box && <><h3>Box score <span>{points(counts)} points</span></h3><div className="form-grid stat-inputs">{stats.map(stat =>
      <label key={stat}>{statLabels[stat]}<input required type="number" inputMode="numeric" min="0" max="999" value={counts[stat]} onChange={event => setCounts({ ...counts, [stat]: event.target.valueAsNumber || 0 })} /></label>
    )}</div></>}
    <label>Private notes<textarea name="notes" rows={2} maxLength={2000} defaultValue={initial.notes} /></label>
    <div className="action-row">
      <button disabled={busy} className={box ? undefined : 'primary'}>{box ? (initial.published ? 'Save without publishing' : 'Save privately') : initial.rev ? 'Save changes' : 'Start tracking'}</button>
      {box && <button className="primary" value="publish" disabled={busy}>Save and publish</button>}
      {onCancel && <button type="button" disabled={busy} onClick={onCancel}>Cancel</button>}
    </div>
  </form>
}

const negativeStats = new Set<Stat>(['missTwo', 'missThree', 'missFree', 'tov', 'foul'])

function Live({ game, busy, save }: { game: Game; busy: boolean; save: (game: Game) => void }) {
  const counts = totals(game)
  const add = (stat: Stat) => save({ ...game, events: [...game.events, { id: crypto.randomUUID(), stat, period: game.period, time: Date.now() }] })
  const score = (side: 'us' | 'them', label: string) => <div>
    <small>{label.toUpperCase()}</small><strong>{game[side]}</strong>
    <div className="score-controls">
      <button aria-label={'Subtract one from ' + label} disabled={busy || game[side] === 0} onClick={() => save({ ...game, [side]: game[side] - 1 })}>−</button>
      <button aria-label={'Add one to ' + label} disabled={busy || game[side] === 999} onClick={() => save({ ...game, [side]: game[side] + 1 })}>+</button>
    </div>
  </div>
  return <>
    <div className="scoreboard">
      {score('us', 'team score')}
      <div><label>Period<select value={game.period} disabled={busy} onChange={event => save({ ...game, period: Number(event.target.value) })}>
        {Array.from({ length: 12 }, (_, index) => <option key={index} value={index + 1}>{index < 4 ? 'Q' + (index + 1) : 'OT' + (index - 3)}</option>)}
      </select></label></div>
      {score('them', 'opponent score')}
    </div>
    <div className="live-totals"><strong>{points(counts)} PTS</strong><span>{counts.reb} REB</span><span>{counts.ast} AST</span><span>{counts.stl} STL</span><span>{counts.blk} BLK</span></div>
    <h3>Log a play</h3>
    <div className="event-buttons" aria-label="Live stat buttons">{stats.map(stat => <button className={negativeStats.has(stat) ? 'negative' : 'positive'} key={stat} disabled={busy} onClick={() => add(stat)}><span>{statLabels[stat]}</span><small aria-label={counts[stat] + ' recorded'}>{counts[stat]}</small></button>)}</div>
    <div className="action-row"><button disabled={busy || !game.events.length} onClick={() => save({ ...game, events: game.events.slice(0, -1) })}>Undo last play</button><button className="primary" disabled={busy} onClick={() => save({ ...game, status: 'final' })}>Finalize game</button></div>
  </>
}

export default function Admin({ state, write, retry, discard, onSignOut, offline }: {
  state: LocalState; write: Write; retry: () => void; discard: () => void; onSignOut?: () => void; offline: boolean
}) {
  const [view, setView] = useState<'games' | 'stats'>('games')
  const [selected, setSelected] = useState<string>()
  const [draft, setDraft] = useState<Game>()
  const [busy, setBusy] = useState(false)
  const editor = useRef<HTMLElement>(null)
  const game = state.games.find(item => item.id === selected)
  const current = draft ?? game
  const save = async (kind: GameWrite, next: Game) => {
    setBusy(true)
    try {
      if (await write(kind, next)) {
        setSelected(kind === 'delete' ? undefined : next.id)
        setDraft(undefined)
      }
    } finally { setBusy(false) }
  }
  const openDraft = (mode: Game['mode']) => {
    setDraft(newGame(mode))
    setSelected(undefined)
    editor.current?.scrollIntoView({ block: 'nearest' })
  }
  const exportQueue = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(state.queue, null, 2)], { type: 'application/json' }))
    const link = document.createElement('a')
    link.href = url
    link.download = 'courtside-pending-private.json'
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  return <>
    <section className="admin-banner">
      <div><span className="season"><span/> {onSignOut ? 'Private workspace' : 'Demo workspace'}</span><h1>Game tracker</h1><p>Track a game live or enter the box score afterward.</p></div>
      {onSignOut && <button onClick={onSignOut}>Sign out</button>}
    </section>
    <div className="admin-actions">
      <button className="primary" onClick={() => { setView('games'); openDraft('live') }} disabled={busy}>＋ New live game</button>
      <button onClick={() => { setView('games'); openDraft('box') }} disabled={busy}>Post-game entry</button>
      <button aria-pressed={view === 'stats'} onClick={() => setView(view === 'stats' ? 'games' : 'stats')}>{view === 'stats' ? 'Back to games' : 'Detailed stats'}</button>
      <span role="status">{state.queue.length ? state.queue.length + ' pending sync' : offline ? 'Offline' : onSignOut ? 'Synced' : 'Saved on this device'}</span>
    </div>
    {!!state.queue.length && <details className="queue-tools"><summary>Pending changes</summary><p>Changes are saved on this device. They sync when this workspace is online.</p><div className="action-row"><button onClick={retry}>Retry sync</button><button onClick={exportQueue}>Export queue</button><button disabled={offline || busy} onClick={discard}>Discard pending changes</button></div></details>}
    {view === 'stats' ? <StatsExplorer detailed games={state.games.filter(game => game.status === 'final').map(game => ({ ...summary(game), box: totals(game) }))} /> :
    <div className="admin-grid">
      <section className="panel archive"><header className="panel-head"><h2>My games</h2></header>
        {newest(state.games).map(item => <button key={item.id} className={'archive-item ' + (selected === item.id ? 'selected' : '')} onClick={() => { setSelected(item.id); setDraft(undefined); editor.current?.scrollIntoView({ block: 'nearest' }) }} disabled={busy}>
          <strong>{item.opponent}</strong><span>{gameDate(item.date)} · {item.status === 'live' ? 'In progress' : item.published ? 'Published' : 'Private'}</span>
        </button>)}
        {!state.games.length && <p className="empty">Start a live game or enter a completed game.</p>}
      </section>
      <section className="panel editor" ref={editor}>
        {!current ? <div className="editor-body"><h2>Ready to track?</h2><p>Select a game or start a new one.</p></div> : <>
          <header className="panel-head"><div><h2>{current.opponent || (current.mode === 'live' ? 'New live game' : 'Post-game entry')}</h2><p>{current.rev ? (current.status === 'live' ? 'In progress' : 'Final') + ' · ' + (current.published ? 'Published' : 'Private') : 'Game details'}</p></div></header>
          <div className="editor-body">
            {draft ? <BoxForm key={draft.id + draft.rev} initial={draft} busy={busy}
              onSave={(next, kind) => void save(kind, next)} onCancel={() => setDraft(undefined)} /> : game && <>
              {game.status === 'live' ? <>
                <Live game={game} busy={busy} save={next => void save('save', next)} />
                <details className="edit-details"><summary>Edit game details and score</summary>
                  <BoxForm key={game.id + game.rev} initial={game} busy={busy} onSave={next => void save('save', next)} />
                </details>
              </> : <>
                <div className="live-totals"><strong>{points(totals(game))} PTS</strong><span>{totals(game).reb} REB</span><span>{totals(game).ast} AST</span><span>{totals(game).stl} STL</span><span>{totals(game).blk} BLK</span></div>
                <div className="action-row">
                  <button className="primary" disabled={busy} onClick={() => setDraft({ ...game, mode: 'box', counts: totals(game) })}>Edit</button>
                  {game.published && <button disabled={busy} onClick={() => {
                    if (confirm('Remove the game against ' + game.opponent + ' from the public profile? You can publish it again from Admin.')) {
                      void save('unpublish', game)
                    }
                  }}>Unpublish</button>}
                </div>
              </>}
              {(game.mode === 'live' || game.events.length > 0) && <details className="play-log"><summary>Play log ({game.events.length})</summary>
                <ol reversed>{[...game.events].reverse().map(play => <li key={play.id}>{play.period <= 4 ? 'Q' + play.period : 'OT' + (play.period - 4)} · {statLabels[play.stat]} · {new Date(play.time).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</li>)}</ol>
              </details>}
            </>}
            {!draft && game && !game.published && <div className="edit-details">
              <button className="delete-game" disabled={busy} onClick={() => {
                if (confirm('Delete the unpublished game against ' + game.opponent + '? This cannot be undone after it syncs.')) {
                  void save('delete', game)
                }
              }}>Delete game</button>
            </div>}
          </div>
        </>}
      </section>
    </div>}
  </>
}
