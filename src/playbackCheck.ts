import { allowedVideoLink } from './oneDrive'
import { supabase } from './store'

async function setup() {
  const status = document.querySelector<HTMLParagraphElement>('#status')!
  if (!supabase) {
    status.textContent = 'The playback check requires a configured Courtside site.'
    return
  }
  const { data, error } = await supabase.from('published_highlights')
    .select('id,title,embed_url').order('created_at', { ascending: false })
  if (error) {
    status.textContent = 'Could not load the clips. Refresh and try again.'
    return
  }

  const choices = new Map<string, string>()
  const picker = document.querySelector<HTMLSelectElement>('#clip')!
  for (const clip of data ?? []) {
    const link = allowedVideoLink(clip.embed_url)
    if (!link) continue
    choices.set(clip.id, link)
    picker.add(new Option(clip.title, clip.id))
  }
  if (!choices.size) {
    status.textContent = 'There are no published OneDrive clips to test.'
    return
  }

  const frame = document.querySelector<HTMLDivElement>('#frame')!
  const outside = document.querySelector<HTMLAnchorElement>('#outside')!
  const selected = () => choices.get(picker.value)!
  const update = () => {
    frame.replaceChildren()
    outside.href = selected()
  }
  picker.addEventListener('change', update)
  document.getElementById('inside')!.addEventListener('click', () => {
    const player = document.createElement('iframe')
    player.src = selected()
    player.title = 'Embedded OneDrive test player'
    player.allow = 'autoplay; fullscreen; picture-in-picture'
    player.allowFullscreen = true
    player.referrerPolicy = 'no-referrer'
    frame.replaceChildren(player)
  })
  update()
  status.hidden = true
  document.getElementById('tests')!.hidden = false
}

void setup()
