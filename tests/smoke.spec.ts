import { test, expect } from '@playwright/test'

// The app auto-opens the instructions modal on first visit, and a fresh
// Playwright context is always a "first visit". Pre-seed the visited flag so
// tests land straight on the app shell.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('barkeep-visited', 'true'))
})

test('loads the Barkeep shell with the DM Chat panel (dark theme by default)', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Barkeep' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'DM Chat' })).toBeVisible()
  await expect(page.locator('html')).toHaveClass(/dark/)
})

test('Chat Settings lays out the compaction controls', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Chat settings' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('heading', { name: 'Chat Settings' })).toBeVisible()
  await expect(dialog.getByText('Auto-compact context')).toBeVisible()
  await expect(dialog.getByLabel('Context ceiling (tokens)')).toBeVisible()
  await expect(dialog.getByLabel('Compact to (tokens)')).toBeVisible()
  await expect(dialog.getByLabel('Keep recent messages')).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Compact now' })).toBeVisible()
})

test('turning auto-compact off reveals Max Previous Messages', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Chat settings' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.locator('button[role="switch"]').click()
  await expect(dialog.getByLabel('Max Previous Messages')).toBeVisible()
  await expect(dialog.getByLabel('Context ceiling (tokens)')).toHaveCount(0)
})

test('stat block expands: Speed in Combat Stats, Spell Attack + Save DC in Spell Slots (TODO.MD #14)', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Expand combat stats' }).click()
  await expect(page.getByLabel('Speed (ft)')).toBeVisible()
  await page.getByRole('button', { name: 'Expand spell slots' }).click()
  await expect(page.getByText('Spellcasting')).toBeVisible()
  await expect(page.getByLabel('Spell Attack:')).toBeVisible()
  await expect(page.getByLabel('Spell Save DC:')).toBeVisible()
})

// A deliberately PARTIAL save (name + inventory only) — the app's load path must
// merge it over the defaults (lib/character-sanitize.ts), which doubles as a UI
// regression for the TODO.MD #14 backfill.
test('inventory search matches rarity badges (TODO.MD #15)', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('dnd-character', JSON.stringify({
      name: 'Renna',
      inventory: [
        { name: 'Crown of the Fox', description: 'Gilded', quantity: 1, rarity: 'legendary' },
        { name: 'Copper Lantern', description: 'Lidded', quantity: 1, rarity: 'common' },
      ],
    }))
  })
  await page.goto('/')
  await page.getByRole('button', { name: 'Filter items' }).click()
  await page.getByLabel('Filter items').fill('legendary')
  await expect(page.getByText('Crown of the Fox')).toBeVisible()
  // Name and description both miss "legendary" — only the rarity badge matches.
  await expect(page.getByText('Copper Lantern')).toHaveCount(0)
  await expect(page.getByText('1 of 2')).toBeVisible()
})

test('spells search matches school (TODO.MD #15)', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('dnd-character', JSON.stringify({
      name: 'Renna',
      spells: [
        { id: 's1', name: 'Fireball', description: 'A ball of fire', level: 3, school: 'evocation', range: '150 feet', duration: 'Instantaneous', castingTime: '1 action', verbal: true, somatic: true, material: false, materialComponents: '', prepared: true },
        { id: 's2', name: 'Misty Step', description: 'You vanish', level: 2, school: 'conjuration', range: '30 feet', duration: 'Instantaneous', castingTime: '1 bonus action', verbal: true, somatic: false, material: false, materialComponents: '', prepared: false },
      ],
    }))
  })
  await page.goto('/')
  await page.getByRole('tab', { name: 'Spells' }).click()
  await page.getByRole('button', { name: 'Filter spells' }).click()
  await page.getByLabel('Filter spells').fill('evocation')
  // Name and description both miss "evocation" — only the school field matches.
  await expect(page.getByText('Fireball')).toBeVisible()
  await expect(page.getByText('Misty Step')).toHaveCount(0)
})

test('item descriptions render markdown in the tabs (TODO.MD #13)', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('dnd-character', JSON.stringify({
      name: 'Renna',
      inventory: [
        { name: 'Fox Blade', description: '**Bladesong** — *whispers* at dusk.', quantity: 1, rarity: 'rare' },
      ],
    }))
  })
  await page.goto('/')
  await expect(page.locator('strong').filter({ hasText: 'Bladesong' })).toBeVisible()
  await expect(page.locator('em').filter({ hasText: 'whispers' })).toBeVisible()
})

test('Add Trait/Feat dialogs offer Generate Details — Pull from chat removed (TODO.MD #20)', async ({ page }) => {
  await page.goto('/')

  // Trait dialog: Generate Details (disabled until a name), Source field, no toggle
  await page.getByRole('tab', { name: 'Traits' }).click()
  await page.getByRole('button', { name: 'Add Trait' }).click()
  let dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('button', { name: 'Generate Details' })).toBeDisabled()
  await dialog.getByLabel('Name').fill('Fox Cunning')
  await expect(dialog.getByRole('button', { name: 'Generate Details' })).toBeEnabled()
  await expect(dialog.getByLabel('Source')).toBeVisible()
  await expect(dialog.getByText('Pull from chat')).toHaveCount(0)
  await page.keyboard.press('Escape')

  // Feat dialog: Generate Details, no toggle
  await page.getByRole('tab', { name: 'Feats' }).click()
  await page.getByRole('button', { name: 'Add Feat' }).click()
  dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('button', { name: 'Generate Details' })).toBeDisabled()
  await expect(dialog.getByText('Pull from chat')).toHaveCount(0)
})

test('turn that saved a checkpoint in the background shows a shield badge + popover', async ({ page }) => {
  await page.addInitScript(() => {
    const checkpoint = {
      id: 'cp-1',
      createdAt: '2026-11-07T12:00:00.000Z',
      title: 'Lighthouse Approach',
      summary: 'The party reached the lighthouse at low tide.',
    }
    localStorage.setItem('dnd-campaign-checkpoints', JSON.stringify([checkpoint]))
    localStorage.setItem('dnd-chat', JSON.stringify([
      { id: 'm1', role: 'user', content: 'Save a checkpoint and wrap up the scene.' },
      {
        id: 'm2',
        role: 'assistant',
        content: 'The tide is coming in. What do you do?',
        checkpointsSaved: [{ id: 'cp-1', title: 'Lighthouse Approach', createdAt: '2026-11-07T12:00:00.000Z' }],
      },
    ]))
  })
  await page.goto('/')

  // The turn that saved gets the shield badge in its action bar
  const badge = page.getByRole('button', { name: 'View saved checkpoint' })
  await expect(badge).toBeVisible()

  // Clicking it opens the popover: what was saved, when, and its summary (resolved
  // from the live checkpoint store by id)
  await badge.click()
  const popover = page.getByRole('group', { name: 'Saved checkpoints' })
  await expect(popover.getByText('Checkpoint saved')).toBeVisible()
  await expect(popover.getByText('Lighthouse Approach')).toBeVisible()
  await expect(popover.getByText('The party reached the lighthouse at low tide.')).toBeVisible()

  // Outside click dismisses
  await page.keyboard.press('Escape')
  await expect(popover).toHaveCount(0)
})

test('traits reorder: arrows swap, edges disable, controls hide while a row is being edited (TODO.MD #17)', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('dnd-character', JSON.stringify({
      name: 'Renna',
      traits: [
        { id: 't1', name: 'Fox Cunning', description: '', source: 'Variant human' },
        { id: 't2', name: 'Lightfoot Stealth', description: '', source: 'Variant human' },
      ],
    }))
  })
  await page.goto('/')
  await page.getByRole('tab', { name: 'Traits' }).click()

  const rows = page.locator('[data-reorder-row]')
  await expect(rows).toHaveCount(2)
  await expect(rows.nth(0)).toContainText('Fox Cunning')
  await expect(rows.nth(1)).toContainText('Lightfoot Stealth')

  // Group edges: up disabled on the first row, down disabled on the last
  await expect(rows.nth(0).getByRole('button', { name: 'Move trait up' })).toBeDisabled()
  await expect(rows.nth(1).getByRole('button', { name: 'Move trait down' })).toBeDisabled()

  // Swap via the guaranteed arrow path
  await rows.nth(0).getByRole('button', { name: 'Move trait down' }).click()
  await expect(rows.nth(0)).toContainText('Lightfoot Stealth')
  await expect(rows.nth(1)).toContainText('Fox Cunning')

  // A row is now in inline edit -> every row's reorder controls hide (its edit
  // state is index-based, so rows may not move under or around an open editor)
  await rows.nth(0).getByRole('button', { name: 'Edit trait' }).click()
  await expect(page.getByRole('button', { name: 'Move trait up' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Move trait down' })).toHaveCount(0)
})

test('spells reorder stays within the level group (TODO.MD #17)', async ({ page }) => {
  await page.addInitScript(() => {
    const spell = (id: string, name: string, level: number, school: string) => ({
      id, name, description: '', level, school,
      range: '30 feet', duration: 'Instantaneous', castingTime: '1 action',
      verbal: true, somatic: false, material: false, materialComponents: '', prepared: false,
    })
    localStorage.setItem('dnd-character', JSON.stringify({
      name: 'Renna',
      spells: [
        spell('c1', 'Mage Hand', 0, 'conjuration'),
        spell('c2', 'Prestidigitation', 0, 'transmutation'),
        spell('s1', 'Fire Bolt', 1, 'evocation'),
      ],
    }))
  })
  await page.goto('/')
  await page.getByRole('tab', { name: 'Spells' }).click()

  const mageHand = page.locator('[data-reorder-row]', { hasText: 'Mage Hand' })
  const prestidigitation = page.locator('[data-reorder-row]', { hasText: 'Prestidigitation' })
  const fireBolt = page.locator('[data-reorder-row]', { hasText: 'Fire Bolt' })

  // Mage Hand: up disabled (top of the cantrip group), down targets the second
  // cantrip — never Fire Bolt
  await expect(mageHand.getByRole('button', { name: 'Move spell up' })).toBeDisabled()
  await expect(mageHand.getByRole('button', { name: 'Move spell down' })).toBeEnabled()

  // Prestidigitation is the LAST cantrip: its only neighbor is a different level -> down disabled
  await expect(prestidigitation.getByRole('button', { name: 'Move spell down' })).toBeDisabled()

  // Fire Bolt is alone at level 1: no same-level neighbor in either direction
  await expect(fireBolt.getByRole('button', { name: 'Move spell up' })).toBeDisabled()
  await expect(fireBolt.getByRole('button', { name: 'Move spell down' })).toBeDisabled()

  // Swap the cantrips; Fire Bolt does not move
  await mageHand.getByRole('button', { name: 'Move spell down' }).click()
  const rows = page.locator('[data-reorder-row]')
  await expect(rows.nth(0)).toContainText('Prestidigitation')
  await expect(rows.nth(1)).toContainText('Mage Hand')
  await expect(rows.nth(2)).toContainText('Fire Bolt')

  // Mage Hand is now the last cantrip: back via "Move spell up"
  await expect(mageHand.getByRole('button', { name: 'Move spell down' })).toBeDisabled()
  await mageHand.getByRole('button', { name: 'Move spell up' }).click()
  await expect(rows.nth(0)).toContainText('Mage Hand')
  await expect(rows.nth(1)).toContainText('Prestidigitation')
})

test('reordered trait order survives a reload (TODO.MD #17)', async ({ page }) => {
  await page.addInitScript(() => {
    // Seed ONLY on the first load: addInitScript re-runs on every navigation, and
    // re-seeding on the reload would overwrite the very autosave we are asserting.
    if (localStorage.getItem('dnd-character')) return
    localStorage.setItem('dnd-character', JSON.stringify({
      name: 'Renna',
      traits: [
        { id: 't1', name: 'Fox Cunning', description: '', source: 'Variant human' },
        { id: 't2', name: 'Lightfoot Stealth', description: '', source: 'Variant human' },
        { id: 't3', name: 'Keen Senses', description: '', source: 'Variant half-elf' },
      ],
    }))
  })
  await page.goto('/')
  await page.getByRole('tab', { name: 'Traits' }).click()

  // Move Keen Senses to the top with two up-swaps
  const keen = page.locator('[data-reorder-row]', { hasText: 'Keen Senses' })
  await keen.getByRole('button', { name: 'Move trait up' }).click()
  await keen.getByRole('button', { name: 'Move trait up' }).click()
  const rows = page.locator('[data-reorder-row]')
  await expect(rows.nth(0)).toContainText('Keen Senses')

  // Autosave persisted the new order — reload and confirm it held
  await page.reload()
  await page.getByRole('tab', { name: 'Traits' }).click()
  const reloaded = page.locator('[data-reorder-row]')
  await expect(reloaded.nth(0)).toContainText('Keen Senses')
  await expect(reloaded.nth(1)).toContainText('Fox Cunning')
  await expect(reloaded.nth(2)).toContainText('Lightfoot Stealth')
})
