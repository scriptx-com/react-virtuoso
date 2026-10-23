import { expect, test } from '@playwright/test'

import { navigateToExample } from './utils.ts'

test.describe('list with a long last item', () => {
  test.beforeEach(async ({ baseURL, page }) => {
    await navigateToExample(page, baseURL, 'long-last-item')
    await page.waitForTimeout(300)
  })

  test('starts from the last item', async ({ page }) => {
    const position = await page.evaluate(() => {
      const scroller = document.querySelector('[data-testid=virtuoso-scroller]')!
      const last = document.querySelector('[data-item-index="9"]')!
      return { scrollTop: scroller.scrollTop, gap: last.getBoundingClientRect().top - scroller.getBoundingClientRect().top }
    })
    expect(position.scrollTop).toBe(7200)
    expect(Math.abs(position.gap)).toBeLessThanOrEqual(1)
  })

  test('compensates on upwards scrolling correctly', async ({ page }) => {
    await page.evaluate(() => {
      const scroller = document.querySelector('[data-testid=virtuoso-scroller]')!
      scroller.scrollBy({ top: -2 })
    })

    await page.waitForTimeout(200)

    const scrollTop = await page.evaluate(() => {
      return document.querySelector('[data-testid=virtuoso-scroller]')!.scrollTop
    })

    // items are 800 and 100px tall.
    // scrolling up by 2px reveals an unexpectedly short item, so it should compensate
    expect(scrollTop).toBe(7200 - 2 - (800 - 100))
  })
})
