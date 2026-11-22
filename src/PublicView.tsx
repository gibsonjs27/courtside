import GameLog from './GameLog'
import { useEffect, useState } from 'react'
import StatsExplorer, { type Metric } from './StatsExplorer'
import { gameDate, newest, seasonOf, type Profile, type PublicGame } from './model'
import rhyderJumper from './rhyder-three-point-jumper.png'

export function Court() {
  return <div className="court" aria-hidden="true"><div className="court-edge"><div className="court-arc"/><div className="court-key"/><div className="court-circle"/><div className="court-rim"/></div></div>
}

export default function PublicView({ profile, games }: { profile: Profile | null; games: PublicGame[] }) {
  const [chart, setChart] = useState<Metric>()
  useEffect(() => {
    if (location.hash === '#stats-explorer' || location.hash === '#highlights') {
      document.getElementById(location.hash === '#highlights' ? 'game-log' : 'stats-explorer')?.scrollIntoView()
    }
  }, [])
  const openChart = (metric: Metric) => {
    setChart(metric)
    document.getElementById('stats-explorer')?.scrollIntoView({ block: 'start' })
  }
  const allGames = newest(games)
  const season = allGames[0] && seasonOf(allGames[0].date)
  const sorted = allGames.filter(game => seasonOf(game.date) === season)
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
      {showPortrait && <img className="hero-portrait" src={rhyderJumper} alt="Rhyder, wearing No. 24, rising for a three-point jump shot" width="675" height="900" />}
      {profile && <div className="jersey" aria-label={'Jersey number ' + profile.number}><span>NO.</span>{profile.number}</div>}
    </section>
    <section className="season-section" aria-labelledby="season-title">
      <header className="section-head"><h2 id="season-title">{season ? season + " at a glance" : "Season at a glance"}</h2><span>{sorted.length} {sorted.length === 1 ? 'game' : 'games'} published</span></header>
      <div className="metrics">
        {(['pts', 'reb', 'ast'] as const).map((stat, index) => <button type="button" className={'metric stat-link ' + (index === 0 ? 'featured' : '')} key={stat} onClick={() => openChart(stat)}>
          <span>{['Points per game', 'Rebounds per game', 'Assists per game'][index]}</span>
          <strong>{sorted.length ? (sorted.reduce((total, game) => total + game[stat], 0) / sorted.length).toFixed(1) : '—'}</strong>
          <small>{stat.toUpperCase()} / GAME</small>
        </button>)}
        <div className="metric"><span>Team record</span><strong>{sorted.length ? [wins, losses, ...(ties ? [ties] : [])].join('–') : '—'}</strong><small>{ties ? 'W / L / T' : 'WINS / LOSSES'}</small></div>
      </div>
    </section>
    <div className="public-grid">
      <GameLog games={allGames} />
      <section className="panel trend" aria-labelledby="trend-title">
        <header className="panel-head"><div><h2 id="trend-title">Scoring trend</h2><p>Points over the last {recent.length || 5} games</p></div><button type="button" onClick={() => openChart('pts')}>All charts</button></header>
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
    <div id="stats-explorer"><StatsExplorer games={games} selectedMetric={chart} onMetricChange={setChart}/></div>
  </>
}
