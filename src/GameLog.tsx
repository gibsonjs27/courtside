import { useState } from 'react'
import type { PublicGame } from './model'

const columns = [
  ['date', 'Date'], ['opponent', 'Opponent'], ['venue', 'Venue'], ['result', 'Result'],
  ['pts', 'PTS'], ['reb', 'REB'], ['ast', 'AST'], ['stl', 'STL'], ['blk', 'BLK'],
] as const
type Column = typeof columns[number][0]
export const gameResult = (game: PublicGame) => game.us > game.them ? 'W' : game.us < game.them ? 'L' : 'T'

export default function GameLog({ games }: { games: PublicGame[] }) {
  const [sort, setSort] = useState<{ column: Column; ascending: boolean }>({ column: 'date', ascending: false })
  const rows = [...games].sort((a, b) => {
    const column = sort.column
    // Untagged games stay at the end in either venue sort direction.
    if (column === 'venue' && Boolean(a.venue) !== Boolean(b.venue)) return a.venue ? -1 : 1
    const left = column === 'result' ? gameResult(a) : a[column] ?? ''
    const right = column === 'result' ? gameResult(b) : b[column] ?? ''
    const order = typeof left === 'number' && typeof right === 'number' ? left - right : String(left).localeCompare(String(right))
    return (sort.ascending ? order : -order) || b.date.localeCompare(a.date) || a.id.localeCompare(b.id)
  })
  return <section className="panel game-log" aria-labelledby="log-title">
    <header className="panel-head"><div><h2 id="log-title">Game log</h2><p>Published game results · select a column to sort</p></div></header>
    {rows.length ? <div className="table-scroll" tabIndex={0} role="region" aria-label="Sortable game log">
      <table className="game-table sortable-log">
        <thead><tr>{columns.map(([column, label]) => <th key={column} scope="col" aria-sort={sort.column === column ? sort.ascending ? 'ascending' : 'descending' : undefined}>
          <button type="button" onClick={() => setSort({ column, ascending: sort.column === column ? !sort.ascending : ['date', 'pts', 'reb', 'ast', 'stl', 'blk'].includes(column) ? false : true })}>
            {label} <span aria-hidden="true">{sort.column === column ? sort.ascending ? '↑' : '↓' : '↕'}</span>
          </button>
        </th>)}</tr></thead>
        <tbody>{rows.map(game => <tr key={game.id}>
          <td><time dateTime={game.date}>{game.date}</time></td><th scope="row">{game.opponent}</th>
          <td>{game.venue || 'Unspecified'}</td>
          <td><span className={'result ' + gameResult(game)}>{gameResult(game)}</span> <span className="score">{game.us}–{game.them}</span></td>
          <td className="points">{game.pts}</td><td>{game.reb}</td><td>{game.ast}</td><td>{game.stl}</td><td>{game.blk}</td>
        </tr>)}</tbody>
      </table>
    </div> : <p className="empty">Published games will appear here.</p>}
  </section>
}
