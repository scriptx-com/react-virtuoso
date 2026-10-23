import { expect, test } from '@playwright/test'

import type { Page } from '@playwright/test'

async function go(page: Page, offset: number, horizontal: boolean, rtl: boolean) {
  await page.locator('[data-virtuoso-scroller]').evaluate(
    (element, { offset, horizontal, rtl }) => {
      if (horizontal) {
        element.scrollLeft = rtl ? -offset : offset
      } else {
        element.scrollTop = offset
      }
    },
    { offset, horizontal, rtl }
  )
  await expect(page.locator(`[data-item-index="${Math.floor((offset - 50) / 100)}"]`)).toBeVisible()
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      })
  )
}

for (const [horizontal, rtl] of [
  [false, false],
  [true, false],
  [true, true],
] as const) {
  test(`reuses cells with header geometry horizontal=${horizontal} rtl=${rtl}`, async ({ page, baseURL }) => {
    await page.goto(`${baseURL}/?story=recycling--example&horizontal=${Number(horizontal)}&rtl=${Number(rtl)}`)
    await page.waitForSelector('[data-storyloaded]')
    await expect(page.locator('[data-cell="0"]')).toBeVisible()
    const alignment = await page.evaluate(
      ({ horizontal, rtl }) => {
        const header = document.querySelector('[data-testid="header"]')!.getBoundingClientRect()
        const item = document.querySelector('[data-cell="0"]')!.getBoundingClientRect()
        return horizontal ? (rtl ? header.left - item.right : item.left - header.right) : item.top - header.bottom
      },
      { horizontal, rtl }
    )
    expect(Math.abs(alignment)).toBeLessThanOrEqual(1)
    await go(page, 1050, horizontal!, rtl!)
    await go(page, 2050, horizontal!, rtl!)
    const before = await page.evaluate(() => (window as unknown as { recyclingMetrics: { mounts: number } }).recyclingMetrics.mounts)
    await go(page, 3050, horizontal!, rtl!)
    await go(page, 1050, horizontal!, rtl!)
    const after = await page.evaluate(() => (window as unknown as { recyclingMetrics: { mounts: number } }).recyclingMetrics.mounts)
    expect(after).toBe(before)
    const coverage = await page
      .locator('[data-index]')
      .evaluateAll((elements) => elements.map((element) => Number(element.getAttribute('data-index'))))
    expect(coverage).toEqual([...coverage].sort((a, b) => a - b))
  })
}

test('measures an unknown absolute child after a late resize', async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/?story=recycling--example&unknown=1`)
  await page.waitForSelector('[data-storyloaded]')
  await page.locator('[data-cell="0"] button').click()
  await expect
    .poll(() => page.locator('[data-item-index="1"]').evaluate((element) => Number.parseFloat((element as HTMLElement).style.top)))
    .toBe(200)
  const gap = await page.evaluate(
    () =>
      document.querySelector('[data-cell="1"]')!.getBoundingClientRect().top -
      document.querySelector('[data-cell="0"]')!.getBoundingClientRect().bottom
  )
  expect(Math.abs(gap)).toBeLessThanOrEqual(1)
})

for (const recycling of [false, true]) {
  for (const [horizontal, rtl] of [
    [false, false],
    [true, false],
    [true, true],
  ] as const) {
    test(`preserves content insets recycling=${recycling} horizontal=${horizontal} rtl=${rtl}`, async ({ page, baseURL }) => {
      await page.goto(
        `${baseURL}/?story=recycling--example&insets=1&recycling=${Number(recycling)}&horizontal=${Number(horizontal)}&rtl=${Number(rtl)}`
      )
      await page.waitForSelector('[data-storyloaded]')
      await expect(page.locator('[data-cell="0"]')).toBeVisible()
      const measure = () =>
        page.evaluate(
          ({ horizontal, rtl }) => {
            const scroller = document.querySelector('[data-virtuoso-scroller]')!
            const header = document.querySelector('[data-testid="header"]')!.getBoundingClientRect()
            const first = document.querySelector('[data-cell="0"]')!.getBoundingClientRect()
            return {
              gap: horizontal ? (rtl ? header.left - first.right : first.left - header.right) : first.top - header.bottom,
              extent: horizontal ? scroller.scrollWidth : scroller.scrollHeight,
            }
          },
          { horizontal, rtl }
        )
      await expect.poll(async () => (await measure()).gap).toBe(40)
      await expect.poll(async () => (await measure()).extent).toBe(100200)
      await page.locator('[data-virtuoso-scroller]').evaluate(
        (node, { horizontal, rtl }) => {
          if (horizontal) {
            node.scrollLeft = rtl ? -node.scrollWidth : node.scrollWidth
          } else {
            node.scrollTop = node.scrollHeight
          }
        },
        { horizontal, rtl }
      )
      await expect(page.locator('[data-cell="999"]')).toBeVisible()
      const trailingGap = await page.evaluate(
        ({ horizontal, rtl }) => {
          const footer = document.querySelector('[data-testid="footer"]')!.getBoundingClientRect()
          const last = document.querySelector('[data-cell="999"]')!.getBoundingClientRect()
          return horizontal ? (rtl ? last.left - footer.right : footer.left - last.right) : footer.top - last.bottom
        },
        { horizontal, rtl }
      )
      expect(trailingGap).toBe(60)
    })
  }
}

test('preserves a nested rail offset when a parked preceding row returns', async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/?story=recycling--example&nested=1`)
  await page.waitForSelector('[data-storyloaded]')
  await go(page, 150, false, false)
  const rail = page.locator('[data-nested-scroll="2"]')
  await rail.evaluate((element) => {
    element.scrollLeft = 180
  })
  expect(await rail.evaluate((element) => element.scrollLeft)).toBe(180)
  await go(page, 50, false, false)
  expect(await rail.evaluate((element) => element.scrollLeft)).toBe(180)
})

for (const [horizontal, rtl, minimal] of [
  [false, false, false],
  [true, false, false],
  [true, true, false],
  [true, false, true],
] as const) {
  for (const recycling of [false, true]) {
    test(`fork window follows native scroll recycling=${recycling} horizontal=${horizontal} rtl=${rtl} minimal=${minimal}`, async ({
      page,
      baseURL,
    }) => {
      await page.goto(
        `${baseURL}/?story=recycling--example&distance=200&recycling=${Number(recycling)}&horizontal=${Number(horizontal)}&rtl=${Number(rtl)}&minimal=${Number(minimal)}`
      )
      await page.waitForSelector('[data-storyloaded]')
      await expect(page.locator('[data-cell="0"]')).toBeVisible()
      const checkOffset = async (offset: number) => {
        await go(page, offset, horizontal, rtl)
        await expect(page.locator(`[data-cell="${Math.floor((offset - 50) / 100)}"]`)).toBeVisible()
        await expect(page.locator(`[data-cell="${Math.floor((offset - 50) / 100) + 2}"]`)).toBeVisible()
      }
      await checkOffset(1050)
      await checkOffset(2050)
      await checkOffset(3050)
      await checkOffset(2050)
      await checkOffset(1050)
      expect(await page.locator('[data-index]').count()).toBeLessThan(40)
      expect(await page.locator('[data-recycling-slot]').count()).toBeLessThan(80)
    })
  }
}
