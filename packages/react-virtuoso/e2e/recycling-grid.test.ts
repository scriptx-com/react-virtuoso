import { expect, test } from '@playwright/test'

for (const [reverse, cssGrid] of [
  [false, false],
  [true, false],
  [false, true],
  [true, true],
] as const) {
  test(`grid reuses cells and preserves flow, resize and focus reverse=${reverse} cssGrid=${cssGrid}`, async ({ page, baseURL }) => {
    await page.goto(`${baseURL}/?story=recycling-grid--example&reverse=${Number(reverse)}&cssGrid=${Number(cssGrid)}`)
    await expect(page.locator('[data-grid-visible]')).toHaveCount(9)
    const scroll = async (top: number) => {
      await page.locator('[data-virtuoso-scroller]').evaluate((el, value) => {
        el.scrollTop = value
      }, top)
      await expect(page.locator(`[data-grid-visible][data-index="${Math.floor((top - 40) / 110) * 3}"]`)).toBeVisible()
    }
    await scroll(1140)
    await scroll(2240)
    const before = await page.evaluate(() => (window as any).gridMetrics.mounts)
    await scroll(3340)
    await scroll(1140)
    expect(await page.evaluate(() => (window as any).gridMetrics.mounts)).toBe(before)
    const rectangles = await page.locator('[data-grid-visible]').evaluateAll((els) =>
      els.map((el) => {
        const r = el.getBoundingClientRect()
        return { top: r.top, left: r.left, width: r.width, height: r.height }
      })
    )
    expect(rectangles[0]!.top).toBe(rectangles[1]!.top)
    expect(rectangles[1]!.left - rectangles[0]!.left).toBe(reverse ? -110 : 110)
    // Keep a DOM-focused item alive after it leaves the render window.
    await page.locator('[data-tile="30"]').focus()
    await scroll(2240)
    await expect(page.locator('[data-tile="30"]')).toBeFocused()
    await expect(page.locator('[data-index="30"]')).toHaveCSS('position', 'absolute')
    expect(await page.locator('[data-index="30"]').evaluate((el) => (el as HTMLElement).offsetLeft)).toBe(reverse ? 220 : 0)
    await page.getByRole('button', { name: 'Resize', exact: true }).click()
    await expect(page.locator('[data-virtuoso-scroller]')).toHaveCSS('width', '210px')
    await page.locator('[data-virtuoso-scroller]').evaluate((el) => {
      el.scrollTop = 0
    })
    await expect(page.locator('[data-grid-visible][data-index="0"]')).toBeVisible()
    const lefts = await page
      .locator('[data-grid-visible]')
      .evaluateAll((els) => [...new Set(els.map((el) => (el as HTMLElement).offsetLeft))])
    expect(lefts).toHaveLength(2)
    await page.getByRole('button', { name: 'Reverse data', exact: true }).click()
    await expect(page.locator('[data-grid-visible][data-index="0"] button')).toHaveText('299:0')
    await page.getByRole('button', { name: 'Toggle', exact: true }).click()
    await expect(page.locator('[data-recycling-slot]')).toHaveCount(0)
  })
}
