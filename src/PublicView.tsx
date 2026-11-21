import { gameDate, newest, type Profile, type PublicGame } from './model'
import rhyderPortrait from './rhyder-no-24.jpg'

export function Court() {
  return <div className="court" aria-hidden="true"><div className="court-edge"><div className="court-arc"/><div className="court-key"/><div className="court-circle"/><div className="court-rim"/></div></div>
}

export default function PublicView({ profile, games }: { profile: Profile | null; games: PublicGame[] }) {
  const sorted = newest(games)
  const recent = sorted.slice(0, 5).reverse()
  const wins = sorted.filter(game => game.us > game.them).length
  const losses = sorted.filter(game => game.us < game.them).length
  const ties = sorted.length - wins - losses
  const peak = Math.max(25, ...recent.map(game => game.pts))
  const player = profile?.name.trim().split(/\s+/)
  const showPortrait = player?.[0].toLowerCase() === 'rhyder' && profile?.number.trim() === '24'
  return <>
    <section className={showPortrait ? 'hero hero-with-portrait' : 'hero'}>
      <Court />
      <div className="hero-content">
        <span className="season"><span/> {profile?.season ?? 'Player profile'}</span>
        <h1>{player?.[0] ?? 'Basketball'}<br/><em>{player?.slice(1).join(' ') || (player ? '' : 'Tracker')}</em></h1>
        {profile && <p>{profile.team}<span className="hero-dot">·</span>{profile.position}</p>}
      </div>
      {showPortrait && <img className="hero-portrait" src={rhyderPortrait} alt="Illustrated portrait of Rhyder in his maroon basketball jersey" width="720" height="720" />}
      {profile && <div className="jersey" aria-label={'Jersey number ' + profile.number}><span>NO.</span>{profile.number}</div>}
    </section>
    <section className="season-section" aria-labelledby="season-title">
      <header className="section-head"><h2 id="season-title">Season at a glance</h2><span>{sorted.length} {sorted.length === 1 ? 'game' : 'games'} published</span></header>
      <div className="metrics">
        {(['pts', 'reb', 'ast'] as const).map((stat, index) => <div className={'metric ' + (index === 0 ? 'featured' : '')} key={stat}>
          <span>{['Points per game', 'Rebounds per game', 'Assists per game'][index]}</span>
          <strong>{sorted.length ? (sorted.reduce((total, game) => total + game[stat], 0) / sorted.length).toFixed(1) : '—'}</strong>
          <small>{stat.toUpperCase()} / GAME</small>
        </div>)}
        <div className="metric"><span>Team record</span><strong>{sorted.length ? [wins, losses, ...(ties ? [ties] : [])].join('–') : '—'}</strong><small>{ties ? 'W / L / T' : 'WINS / LOSSES'}</small></div>
      </div>
    </section>
    <div className="public-grid">
      <section className="panel game-log" aria-labelledby="log-title">
        <header className="panel-head"><div><h2 id="log-title">Game log</h2><p>Published game results</p></div><span className="panel-icon" aria-hidden="true">≡</span></header>
        {sorted.length ? <>
          <table className="game-table">
            <thead><tr><th scope="col">Opponent</th><th scope="col">Result</th><th scope="col">PTS</th><th scope="col">REB</th><th scope="col">AST</th><th scope="col" className="wide-stat">STL</th><th scope="col" className="wide-stat">BLK</th></tr></thead>
            <tbody>{sorted.map(game => {
              const result = game.us > game.them ? 'W' : game.us < game.them ? 'L' : 'T'
              return <tr key={game.id}><th scope="row">{game.opponent}<small>{gameDate(game.date)}</small></th><td><span className={'result ' + result}>{result}</span> <span className="score">{game.us}–{game.them}</span></td><td className="points">{game.pts}</td><td>{game.reb}</td><td>{game.ast}</td><td className="wide-stat">{game.stl}</td><td className="wide-stat">{game.blk}</td></tr>
            })}</tbody>
          </table>
          <details className="mobile-defense"><summary>Steals and blocks</summary><ul>{sorted.map(game => <li key={game.id}>{game.opponent} · {game.stl} STL · {game.blk} BLK</li>)}</ul></details>
        </> : <p className="empty">Published games will appear here.</p>}
      </section>
      <section className="panel trend" aria-labelledby="trend-title">
        <header className="panel-head"><div><h2 id="trend-title">Scoring trend</h2><p>Points over the last {recent.length || 5} games</p></div><span className="panel-icon" aria-hidden="true">↗</span></header>
        {recent.length ? <>
          <div className="chart">
            <div className="chart-scale" aria-hidden="true"><span>{peak}</span><span>{Math.round(peak / 2)}</span><span>0</span></div>
            <div className="bars">{recent.map((game, index) =>
              <div className="bar-column" key={game.id} aria-label={gameDate(game.date) + ', ' + game.pts + ' points'}>
                <div className={'bar ' + (index === recent.length - 1 ? 'latest' : '')} style={{ height: Math.max(1, game.pts / peak * 100) + '%' }}><span>{game.pts}</span></div>
                <small>{gameDate(game.date)}</small>
              </div>
            )}</div>
          </div>
          <div className="trend-foot"><span className="trend-dot"/> Most recent game</div>
        </> : <p className="empty">A scoring trend will appear after the first published game.</p>}
      </section>
    </div>
  </>
}
