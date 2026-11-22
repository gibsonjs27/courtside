import type { Metric } from './StatsExplorer'
import type { PublicGame } from './model'

const colors = ['#b24570','#347eaf','#33845f','#b16a1e','#8165bb','#a55534','#3e8290','#ad527d']
const dashPatterns = ['', '8 3', '3 3', '10 3 2 3']
const day = (date: string) => Date.parse(date)
type Series = { key: Metric; label: string; values: (number | null)[]; percent: boolean }

export default function MetricsTimeline({ games, series }: { games: PublicGame[]; series: Series[] }) {
  if (!series.length) return <p className="empty">Select at least one metric to plot.</p>
  const start = day(games[0].date)
  const span = day(games[games.length - 1].date) - start
  const x = (i: number) => span ? 42 + 638 * (day(games[i].date) - start) / span : 361
  const ticks = span ? [...new Set([games[0].date, games[games.length - 1].date])] : [games[0].date]
  return <section className="timeline" aria-label="Metrics over time">
    <div className="timeline-legend">{series.map((item, i) => <span key={item.key}><i style={{ background: colors[i % colors.length] }} aria-hidden="true" />{item.label}</span>)}</div>
    {[false, true].map(percent => {
      const plots = series.map((item, index) => ({ ...item, index })).filter(item => item.percent === percent)
      if (!plots.length) return null
      if (percent && plots.every(item => item.values.every(value => value === null))) {
        return <div key="shooting"><h3>Shooting percentage</h3><p className="stats-coverage">No shot attempts are available for the selected shooting metrics and games.</p></div>
      }
      const max = percent ? 100 : Math.max(4, Math.ceil(Math.max(0, ...plots.flatMap(item => item.values.map(value => value ?? 0))) / 4) * 4)
      const y = (v: number) => 166 - 148 * v / max
      return <div key={String(percent)}>
        <h3>{percent ? 'Shooting percentage' : 'Per-game counts'}</h3>
        <svg className="timeline-svg" viewBox="0 0 704 194" role="img" aria-label={percent ? 'Shooting percentages by game date' : 'Stat counts by game date'}>
          {[0, 1, 2, 3, 4].map(step => <g key={step}>
            <line x1="42" x2="680" y1={y(max * step / 4)} y2={y(max * step / 4)} className="timeline-grid" />
            <text x="37" y={y(max * step / 4) + 4} textAnchor="end">{max * step / 4}{percent ? '%' : ''}</text>
          </g>)}
          {ticks.map((date, i) => <text key={date} x={ticks.length === 1 ? 361 : i ? 680 : 42} y="188" textAnchor={ticks.length === 1 ? 'middle' : i ? 'end' : 'start'}>{date}</text>)}
          {plots.map(({ key, label, values, index }) => <g key={key} style={{ color: colors[index % colors.length] }}>
            <path d={values.map((v, i) => v === null ? '' : (i > 0 && values[i - 1] !== null ? 'L' : 'M') + x(i) + ' ' + y(v)).join(' ')} fill="none" stroke="currentColor" strokeWidth="2.5" strokeDasharray={dashPatterns[Math.floor(index / colors.length) % dashPatterns.length]} />
            {values.map((v, i) => v === null ? null : <circle key={games[i].id} cx={x(i)} cy={y(v)} r="4" fill="currentColor"><title>{games[i].date} · {games[i].opponent} · {label} {Number(v.toFixed(1))}{percent ? '%' : ''}</title></circle>)}
          </g>)}
        </svg>
      </div>
    })}
    <details><summary>Chart data</summary><div className="table-scroll" tabIndex={0} role="region" aria-label="Metrics by game">
      <table className="game-table timeline-table">
        <thead><tr><th scope="col">Date</th><th scope="col">Opponent</th>{series.map(item => <th key={item.key} scope="col">{item.label}</th>)}</tr></thead>
        <tbody>{games.map((game, i) => <tr key={game.id}><td>{game.date}</td><th scope="row">{game.opponent}</th>{series.map(item => {
          const value = item.values[i]
          return <td key={item.key}>{value === null ? '—' : Number(value.toFixed(1)) + (item.percent ? '%' : '')}</td>
        })}</tr>)}</tbody>
      </table>
    </div></details>
  </section>
}
