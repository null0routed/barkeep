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
