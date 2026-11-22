import MetricsTimeline from './MetricsTimeline'
import { gameResult } from './GameLog'
import { useState } from 'react'
import { grades, venues, seasonOf, newest, statLabels, stats, type Counts, type PublicGame } from './model'

type StatGame = PublicGame
const basic = [
  ['pts', 'Points'], ['reb', 'Rebounds'], ['ast', 'Assists'], ['stl', 'Steals'], ['blk', 'Blocks'],
] as const
const shooting = [['fg', 'Field goals'], ['threeRate', 'Three-pointers'], ['ft', 'Free throws']] as const
export type Metric = typeof basic[number][0] | typeof stats[number] | typeof shooting[number][0]
const sums = (games: StatGame[], stat: Metric) => games.reduce((sum, game) => {
  if (stat === 'pts' || stat === 'reb' || stat === 'ast' || stat === 'stl' || stat === 'blk') return sum + game[stat]
  return sum + (game.box?.[stat as keyof Counts] ?? 0)
}, 0)
function rate(games: StatGame[], stat: Metric) {
  const made = stat === 'fg' ? sums(games, 'two') + sums(games, 'three') : sums(games, stat === 'ft' ? 'free' : 'three')
  const missed = stat === 'fg' ? sums(games, 'missTwo') + sums(games, 'missThree') : sums(games, stat === 'ft' ? 'missFree' : 'missThree')
  return { made, attempts: made + missed }
}
function display(value: number | null, percentage: boolean) {
  if (value === null) return '—'
  return (Number.isInteger(value) ? String(value) : value.toFixed(1)) + (percentage ? '%' : '')
}

export default function StatsExplorer({ games, detailed = false, initialMetric }: {
  games: StatGame[]; detailed?: boolean; initialMetric?: Metric
}) {
  const [season, setSeason] = useState('')
  const [grade, setGrade] = useState('')
  const [venue, setVenue] = useState('')
  const [result, setResult] = useState('')
  const [from, setFrom] = useState('')
  const [through, setThrough] = useState('')
  const [chosenMetrics, setChosenMetrics] = useState<Metric[] | null>(null)
  const timelineMetrics = chosenMetrics ?? (initialMetric ? [initialMetric] : ['pts', 'reb', 'ast'])
  const setTimelineMetrics = setChosenMetrics
  const [view, setView] = useState<'timeline' | 'comparison'>('timeline')
  const [metric, setMetric] = useState<Metric>(initialMetric ?? 'pts')
  const [group, setGroup] = useState('game')
  const [aggregate, setAggregate] = useState('average')
  const [selected, setSelected] = useState('')
  const metrics: ReadonlyArray<readonly [Metric, string]> = [
    ...basic, ...stats.filter(stat => !basic.some(([key]) => key === stat)).map(stat => [stat, statLabels[stat]] as const), ...shooting,
  ]
  const available = (game: StatGame, stat: Metric) => basic.some(([key]) => key === stat) || Boolean(game.box)
  const isRate = shooting.some(([key]) => key === metric)
  const seasons = [...new Set(games.map(game => seasonOf(game.date)))].sort().reverse()
  const invalidDates = Boolean(from && through && from > through)
  const filtered = newest(games.filter(game => (!from || game.date >= from) && (!through || game.date <= through)
    && (!result || gameResult(game) === result) && (!season || seasonOf(game.date) === season)
    && (!grade || (game.grade || 'unspecified') === grade) && (!venue || (game.venue || 'unspecified') === venue)))
  const chronological = [...filtered].reverse()
  const series = metrics.filter(([key]) => timelineMetrics.includes(key)).map(([key, label]) => {
    const percent = shooting.some(([id]) => id === key)
    const values = chronological.map(game => {
      if (!available(game, key)) return null
      if (!percent) return sums([game], key)
      const { made, attempts } = rate([game], key)
      return attempts ? 100 * made / attempts : null
    })
    return { key, label: label + (percent ? ' %' : ''), percent, values }
  })
  const groups = new Map<string, { label: string; games: StatGame[] }>()
  for (const game of [...filtered].reverse()) {
    const label = group === 'season' ? seasonOf(game.date)
      : group === 'grade' ? game.grade ? 'Grade ' + game.grade : 'Unspecified grade'
      : group === 'venue' ? game.venue || 'Unspecified venue'
      : game.opponent + ' · ' + game.date
    const key = group === 'game' ? game.id : label
    const entry = groups.get(key) ?? { label, games: [] }
    entry.games.push(game)
    groups.set(key, entry)
  }
  const value = (subset: StatGame[]) => {
    if (isRate) {
      const { made, attempts } = rate(subset, metric)
      return attempts ? 100 * made / attempts : null
    }
    const included = subset.filter(game => available(game, metric))
    return included.length ? sums(included, metric) / (aggregate === 'total' ? 1 : included.length) : null
  }
  const rows = [...groups.values()].map(entry => ({ ...entry, value: value(entry.games) }))
  const max = isRate ? 100 : Math.max(1, ...rows.map(row => row.value ?? 0))
  const game = filtered.find(item => item.id === selected)
  const wins = filtered.filter(item => item.us > item.them).length
  const losses = filtered.filter(item => item.us < item.them).length
  const ties = filtered.length - wins - losses

  return <section className="panel stats-explorer" aria-label={detailed ? 'Detailed stats' : 'Stats explorer'}>
    <header className="panel-head"><div><h2>{detailed ? 'Detailed stats' : 'Stats explorer'}</h2><p>{detailed ? 'Completed games · admin box scores' : 'Published game stats'}</p></div></header>
    <div className="stats-body">
      <div className="stats-filters">
        <label>Season<select name="season" value={season} onChange={e => setSeason(e.target.value)}><option value="">Career · all seasons</option>{seasons.map(item => <option key={item}>{item}</option>)}</select></label>
        <label>Grade<select name="grade" value={grade} onChange={e => setGrade(e.target.value)}><option value="">All grades</option>{grades.map(item => <option key={item} value={item}>Grade {item}</option>)}<option value="unspecified">Unspecified</option></select></label>
        <label>Venue<select name="venue" value={venue} onChange={e => setVenue(e.target.value)}><option value="">All venues</option>{venues.map(item => <option key={item}>{item}</option>)}<option value="unspecified">Unspecified</option></select></label>
        <label>Result<select name="result" value={result} onChange={e => setResult(e.target.value)}><option value="">All results</option><option value="W">Wins</option><option value="L">Losses</option><option value="T">Ties</option></select></label>
        <label>From<input type="date" value={from} onChange={e => setFrom(e.target.value)} /></label>
        <label>Through<input type="date" value={through} onChange={e => setThrough(e.target.value)} /></label>
      </div>
      {!detailed && filtered.some(game => !game.box) && <p className="stats-coverage">Some games were published with summary stats only. Shooting percentages require a published box score with shot attempts.</p>}
      {invalidDates && <p role="alert" className="empty">The end date must be on or after the start date.</p>}
      <div className="action-row chart-views">
        <button type="button" aria-pressed={view === 'timeline'} onClick={() => setView('timeline')}>Over time</button>
        <button type="button" aria-pressed={view === 'comparison'} onClick={() => setView('comparison')}>Compare groups</button>
      </div>
      {view === 'timeline' ? <fieldset className="timeline-metrics"><legend>Metrics to plot</legend>
        <div className="action-row"><button type="button" onClick={() => setTimelineMetrics(metrics.map(([key]) => key))}>Select all</button><button type="button" onClick={() => setTimelineMetrics([])}>Clear metrics</button></div>
        <div className="metric-options">{metrics.map(([key, label]) => <label key={key}><input type="checkbox" checked={timelineMetrics.includes(key)} onChange={e => setTimelineMetrics(e.target.checked ? [...timelineMetrics, key] : timelineMetrics.filter(item => item !== key))} />{label}{shooting.some(([id]) => id === key) ? ' %' : ''}</label>)}</div>
      </fieldset> : <div className="stats-filters">
        <label>Chart stat<select name="metric" value={metric} onChange={e => setMetric(e.target.value as Metric)}>{metrics.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        <label>Group chart by<select name="group" value={group} onChange={e => setGroup(e.target.value)}><option value="game">Game</option><option value="season">Season</option><option value="grade">Grade</option><option value="venue">Venue</option></select></label>
        <label>Show<select name="aggregate" value={aggregate} disabled={isRate} onChange={e => setAggregate(e.target.value)}>{isRate && <option value={aggregate}>Shooting percentage</option>}{!isRate && <><option value="average">Per-game averages</option><option value="total">Totals</option></>}</select></label>
      </div>}
      <div className="stats-overview">
        <span><strong>{filtered.length}</strong> Games</span>
        <span><strong>{wins}–{losses}{ties ? '–' + ties : ''}</strong> Record</span>
        {view === 'comparison' && <span><strong>{display(value(filtered), isRate)}</strong> {metrics.find(([key]) => key === metric)?.[1]}{isRate || aggregate === 'total' ? '' : ' / game'}</span>}
      </div>
      {rows.length ? <>
        {view === 'timeline' ? <MetricsTimeline games={chronological} series={series}/> : <div className="stats-chart" aria-label="Stat comparison">
          {rows.map(row => <div className="stats-chart-row" key={row.games[0].id}>
            {group === 'game' ? <button type="button" aria-pressed={selected === row.games[0].id} onClick={() => setSelected(row.games[0].id)}>{row.label}</button> : <span>{row.label} · {row.games.length} {row.games.length === 1 ? 'game' : 'games'}</span>}
            <div className="stats-track" aria-hidden="true"><div style={{ width: (row.value ?? 0) / max * 100 + '%' }} /></div>
            <strong>{display(row.value, isRate)}</strong>
          </div>)}
        </div>}
        <label className="game-drilldown">Game details<select value={game?.id ?? ''} onChange={e => setSelected(e.target.value)}><option value="">Choose a game</option>{filtered.map(item => <option key={item.id} value={item.id}>{item.opponent} · {item.date}</option>)}</select></label>
        {game && <section className="stat-detail" aria-label="Game box score">
          <h3>{game.opponent} · {game.us}–{game.them}</h3>
          <p>{game.date} · {game.grade ? 'Grade ' + game.grade : 'Unspecified grade'} · {game.venue || 'Unspecified venue'}</p>
          <dl>{metrics.map(([key, label]) => {
            const percentage = shooting.some(([item]) => item === key)
            const result = percentage ? rate([game], key) : null
            let shown: string | number = '—'
            if (result?.attempts) shown = display(100 * result.made / result.attempts, true) + ' (' + result.made + '/' + result.attempts + ')'
            if (!result && available(game, key)) shown = sums([game], key)
            return <div key={key}><dt>{label}</dt><dd>{shown}</dd></div>
          })}</dl>
        </section>}
      </> : <p className="empty">No games match these filters.</p>}
    </div>
  </section>
}
