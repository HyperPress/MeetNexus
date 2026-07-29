import { expect, test } from '@playwright/test'

test.describe('MeetNexus 房间入口页面', () => {
  test('首页显示中文内容并能进入创建会议页面', async ({ page }) => {
    await page.goto('/')

    await expect(
      page.getByRole('heading', {
        level: 1,
      }),
    ).toContainText('随时发起会议')

    await expect(
      page.getByText('MeetNexus 提供中文多人视频会议体验。'),
    ).toBeVisible()

    const mainContent = page.getByRole('main')

    await mainContent
      .getByRole('link', {
        name: '创建会议',
      })
      .click()

    await expect(page).toHaveURL(/#\/create$/)

    await expect(
      page.getByRole('heading', {
        level: 1,
        name: '创建会议',
      }),
    ).toBeVisible()
  })

  test('创建会议表单显示中文校验结果', async ({ page }) => {
    await page.goto('/#/create')

    await page
      .getByRole('button', {
        name: '创建会议',
      })
      .click()

    await expect(page.getByRole('alert')).toHaveText('请输入会议主题。')

    await page
      .getByLabel('会议主题')
      .fill('MeetNexus 项目例会')

    await page
      .getByRole('button', {
        name: '创建会议',
      })
      .click()

    await expect(page.getByRole('alert')).toHaveText(
      '请输入你的显示名称。',
    )

    await page
      .getByLabel('你的显示名称')
      .fill('测试主持人')

    await page
      .getByRole('button', {
        name: '创建会议',
      })
      .click()

    await expect(page.getByRole('status')).toHaveText(
      '表单已通过本地校验。房间接口尚未接入，因此当前不会真正创建会议。',
    )
  })

  test('加入会议表单显示中文校验结果', async ({ page }) => {
    await page.goto('/#/join')

    await page
      .getByRole('button', {
        name: '加入会议',
      })
      .click()

    await expect(page.getByRole('alert')).toHaveText('请输入会议号。')

    await page
      .getByLabel('会议号')
      .fill('ROOM-2026')

    await page
      .getByRole('button', {
        name: '加入会议',
      })
      .click()

    await expect(page.getByRole('alert')).toHaveText(
      '请输入你的显示名称。',
    )

    await page
      .getByLabel('你的显示名称')
      .fill('测试参会者')

    await page
      .getByRole('button', {
        name: '加入会议',
      })
      .click()

    await expect(page.getByRole('status')).toHaveText(
      '表单已通过本地校验。房间接口尚未接入，因此当前不会真正加入会议。',
    )
  })

  test('刷新后仍然保留当前页面', async ({ page }) => {
    await page.goto('/#/join')

    await expect(
      page.getByRole('heading', {
        level: 1,
        name: '加入会议',
      }),
    ).toBeVisible()

    await page.reload()

    await expect(page).toHaveURL(/#\/join$/)

    await expect(
      page.getByRole('heading', {
        level: 1,
        name: '加入会议',
      }),
    ).toBeVisible()
  })
})