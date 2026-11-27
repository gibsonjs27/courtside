import { useEffect, useRef } from 'react'
import { GameHighlights, type Highlight } from './GameClips'
import { gameResult, type Profile, type PublicGame } from './model'

export default function GameSummary({ game, profile, highlights, onClose }: {
  game: PublicGame
  profile: Profile | null
  highlights?: Highlight[]
  onClose: () => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const element = dialog.current
    if (element && !element.open) element.showModal()
  }, [])

  const result = gameResult(game)
  const resultLabel = { W: 'Win', L: 'Loss', T: 'Tie' }[result]
  const box = game.box
  const shooting = box && [
    ['FG', box.two + box.three, box.missTwo + box.missThree],
    ['3PT', box.three, box.missThree],
    ['FT', box.free, box.missFree],
  ] as const
  const totals = [
    ['PTS', game.pts], ['REB', game.reb], ['AST', game.ast], ['STL', game.stl],
    ['BLK', game.blk], ['TO', box?.tov], ['PF', box?.foul],
  ] as const

  return <dialog ref={dialog} className="game-summary" aria-labelledby="game-summary-title" onClose={onClose}>
    <header className="panel-head">
      <div>
        <h2 id="game-summary-title">Game summary</h2>
        <p><time dateTime={game.date}>{game.date}</time>{game.venue && ' · ' + game.venue}</p>
      </div>
      <form method="dialog"><button type="submit">Close</button></form>
    </header>
    <div className="game-summary-body">
      <div className="summary-scoreboard" aria-label="Final score">
        <div><span>{profile?.team || 'Team'}</span><strong>{game.us}</strong></div>
        <span className={'result ' + result}>{resultLabel}</span>
        <div><span>{game.opponent}</span><strong>{game.them}</strong></div>
      </div>
      <table className="game-table summary-table">
        <caption>{profile?.name || 'Player'} box score</caption>
        <thead><tr>{totals.map(([label]) => <th key={label} scope="col">{label}</th>)}</tr></thead>
        <tbody><tr>{totals.map(([label, value]) => <td key={label} className={label === 'PTS' ? 'points' : undefined}>{value ?? '—'}</td>)}</tr></tbody>
      </table>
      {shooting ? <table className="game-table summary-table">
        <caption>Shooting</caption>
        <thead><tr><th scope="col">Shot</th><th scope="col">Made</th><th scope="col">Attempts</th><th scope="col">Pct</th></tr></thead>
        <tbody>{shooting.map(([label, made, missed]) => {
          const attempts = made + missed
          return <tr key={label}><th scope="row">{label}</th><td>{made}</td><td>{attempts}</td><td>{attempts ? (100 * made / attempts).toFixed(1) + '%' : '—'}</td></tr>
        })}</tbody>
      </table> : <p className="stats-coverage">This game was published with summary stats only.</p>}
      {highlights?.length ? <section aria-labelledby="summary-highlights-title">
        <h3 id="summary-highlights-title">Highlights</h3>
        <GameHighlights clips={highlights} />
      </section> : null}
    </div>
  </dialog>
}
