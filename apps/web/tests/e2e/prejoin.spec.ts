import { expect, test } from '@playwright/test'

test.describe('会前设备检测', () => {
  test('能够启动和停止本地设备预览', async ({ page }) => {
    await page.goto('/#/preview')

    await expect(
      page.getByRole('heading', {
        level: 1,
        name: '会前设备检测',
      }),
    ).toBeVisible()

    await page.getByRole('button', { name: '开始设备检测' }).click()

    await expect(page.getByRole('status')).toContainText('设备已准备好')
    await expect(page.getByLabel('本地摄像头预览')).toBeVisible()
    await expect(
      page.getByRole('button', { name: '关闭摄像头' }),
    ).toBeEnabled()
    await expect(
      page.getByRole('button', { name: '关闭麦克风' }),
    ).toBeEnabled()

    await page.getByRole('button', { name: '停止预览' }).click()

    await expect(page.getByRole('status')).toHaveText('设备预览已停止。')
    await expect(page.getByText('尚未启动设备检测')).toBeVisible()
  })

  test('能够分别关闭摄像头和麦克风', async ({ page }) => {
    await page.goto('/#/preview')
    await page.getByRole('button', { name: '开始设备检测' }).click()

    await page.getByRole('button', { name: '关闭摄像头' }).click()
    await expect(
      page.getByRole('button', { name: '打开摄像头' }),
    ).toBeVisible()
    await expect(page.getByText('摄像头已关闭')).toBeVisible()

    await page.getByRole('button', { name: '关闭麦克风' }).click()
    await expect(
      page.getByRole('button', { name: '打开麦克风' }),
    ).toBeVisible()
  })

  test('能够切换本地摄像头镜像', async ({ page }) => {
    await page.goto('/#/preview')
    await page.getByRole('button', { name: '开始设备检测' }).click()

    const preview = page.getByLabel('本地摄像头预览')

    await expect(preview).toHaveClass(/-scale-x-100/)
    await page.getByRole('button', { name: '关闭镜像' }).click()
    await expect(preview).not.toHaveClass(/-scale-x-100/)
    await expect(
      page.getByRole('button', { name: '开启镜像' }),
    ).toBeVisible()
  })

  test('能够获取并停止屏幕分享测试流', async ({ page }) => {
    // 仅在本测试中隔离系统屏幕选择器，产品代码仍调用真实 getDisplayMedia。
    await page.addInitScript(() => {
      Object.defineProperty(navigator.mediaDevices, 'getDisplayMedia', {
        configurable: true,
        value: async () => {
          const canvas = document.createElement('canvas')
          canvas.width = 1280
          canvas.height = 720

          const context = canvas.getContext('2d')
          context?.fillRect(0, 0, canvas.width, canvas.height)

          const testWindow = globalThis as typeof globalThis & {
            __meetNexusScreenTestCanvas?: HTMLCanvasElement
          }
          testWindow.__meetNexusScreenTestCanvas = canvas

          return canvas.captureStream(30)
        },
      })
    })

    await page.goto('/#/preview')
    await page
      .getByRole('button', { name: '开始屏幕分享测试' })
      .click()

    await expect(
      page.getByRole('status', { name: '屏幕分享状态' }),
    ).toContainText('已获取屏幕分享信息')
    await expect(page.getByLabel('屏幕分享预览')).toBeVisible()
    await expect(page.getByText('1280 × 720')).toBeVisible()

    await page.getByRole('button', { name: '停止屏幕分享' }).click()

    await expect(
      page.getByRole('status', { name: '屏幕分享状态' }),
    ).toHaveText('屏幕分享预览已停止。')
    await expect(page.getByText('尚未开始屏幕分享')).toBeVisible()
  })
})
