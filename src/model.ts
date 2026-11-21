export const statLabels = {
  two: '2PT made', three: '3PT made', free: 'FT made',
  missTwo: '2PT missed', missThree: '3PT missed', missFree: 'FT missed',
  reb: 'Rebound', ast: 'Assist', stl: 'Steal', blk: 'Block', tov: 'Turnover', foul: 'Foul',
} as const
export type Stat = keyof typeof statLabels
export type Counts = Record<Stat, number>
export type Play = { id: string; stat: Stat; period: number; time: number }
export type Game = {
  id: string; rev: number; date: string; opponent: string; us: number; them: number;
  status: 'live' | 'final'; mode: 'live' | 'box'; period: number;
  counts: Counts; events: Play[]; notes: string; published: boolean;
}
export type PublicGame = Pick<Game, 'id' | 'date' | 'opponent' | 'us' | 'them'> & {
  pts: number; reb: number; ast: number; stl: number; blk: number;
}
export type Profile = { name: string; team: string; number: string; position: string; season: string }
export type Command = { id: string; kind: 'save' | 'publish' | 'unpublish'; game: Game }
export const stats = Object.keys(statLabels) as Stat[]
export const emptyCounts = () => Object.fromEntries(stats.map(stat => [stat, 0])) as Counts
export function totals(game: Game): Counts {
  if (game.mode === 'box') return game.counts
  const counts = emptyCounts()
  for (const event of game.events) counts[event.stat]++
  return counts
}
export const points = (counts: Counts) => 2 * counts.two + 3 * counts.three + counts.free
export function summary(game: Game): PublicGame {
  const { id, date, opponent, us, them } = game
  const counts = totals(game)
  return { id, date, opponent, us, them, pts: points(counts), reb: counts.reb, ast: counts.ast, stl: counts.stl, blk: counts.blk }
}
export const demoProfile: Profile = { name: 'Jordan Miller', team: 'Westfield Wolves', number: '24', position: 'Guard', season: '2025–26 Season' }
export const demoPublic: PublicGame[] = [
  ['2026-02-14', 'Brookside Bears', 58, 46, 22, 8, 5, 3, 1],
  ['2026-02-07', 'Northview Hawks', 51, 48, 18, 7, 4, 2, 0],
  ['2026-01-31', 'Lincoln Lions', 44, 52, 15, 6, 3, 1, 0],
  ['2026-01-24', 'Cedar Ridge Eagles', 60, 42, 24, 9, 6, 4, 1],
  ['2026-01-17', 'Eastside Falcons', 49, 41, 13, 6, 4, 2, 0],
].map(([date, opponent, us, them, pts, reb, ast, stl, blk], index) =>
  ({ id: 'demo-' + index, date: String(date), opponent: String(opponent), us: Number(us), them: Number(them), pts: Number(pts), reb: Number(reb), ast: Number(ast), stl: Number(stl), blk: Number(blk) }))
export function demoGames(): Game[] {
  return demoPublic.map(game => ({
    id: game.id, date: game.date, opponent: game.opponent, us: game.us, them: game.them,
    rev: 1, mode: 'box', status: 'final', period: 4, events: [], notes: '', published: true,
    counts: { ...emptyCounts(), two: Math.floor(game.pts / 2), free: game.pts % 2, reb: game.reb, ast: game.ast, stl: game.stl, blk: game.blk },
  }))
}
export function newGame(mode: Game['mode']): Game {
  const today = new Date()
  today.setMinutes(today.getMinutes() - today.getTimezoneOffset())
  return { id: crypto.randomUUID(), rev: 0, date: today.toISOString().slice(0, 10), opponent: '', us: 0, them: 0,
    status: mode === 'live' ? 'live' : 'final', mode, period: 1, counts: emptyCounts(), events: [], notes: '', published: false }
}
export const gameDate = (date: string) => new Date(date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
export const newest = <T extends { date: string; id: string }>(games: T[]) =>
  [...games].sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id))
