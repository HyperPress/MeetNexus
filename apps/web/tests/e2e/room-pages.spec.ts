import {
  expect,
  test,
  type Page,
  type Route,
} from '@playwright/test'

const roomId = '11111111-1111-4111-8111-111111111111'
const hostId = '22222222-2222-4222-8222-222222222222'
const participantId = '33333333-3333-4333-8333-333333333333'
const requestId = '44444444-4444-4444-8444-444444444444'

const roomDetailsResponse = {
  data: {
    room: {
      id: roomId,
      title: 'MeetNexus 项目例会',
      created_at: '2026-07-30T00:00:00Z',
    },
    members: [
      {
        id: hostId,
        display_name: '测试主持人',
        role: 'host',
        joined_at: '2026-07-30T00:00:00Z',
        online: true,
      },
    ],
  },
  request_id: requestId,
}

async function fulfillRoomApi(route: Route) {
  const request = route.request()
  const url = new URL(request.url())
  const method = request.method()

  if (url.pathname === '/rooms' && method === 'POST') {
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      json: roomDetailsResponse,
    })
    return
  }

  if (
    url.pathname === `/rooms/${roomId}` &&
    method === 'GET'
  ) {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      json: roomDetailsResponse,
    })
    return
  }

  if (
    url.pathname === `/rooms/${roomId}/members` &&
    method === 'POST'
  ) {
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      json: {
        data: {
          id: participantId,
          display_name: '测试参会者',
          role: 'participant',
          joined_at: '2026-07-30T00:05:00Z',
          online: true,
        },
        request_id: requestId,
      },
    })
    return
  }

  if (
    url.pathname.endsWith('/heartbeat') &&
    method === 'POST'
  ) {
    await route.fulfill({
      status: 204,
    })
    return
  }

  if (method === 'DELETE') {
    await route.fulfill({
      status: 204,
    })
    return
  }

  await route.fulfill({
    status: 404,
    contentType: 'application/json',
    json: {
      error: {
        code: 'ROOM_NOT_FOUND',
        message: '会议不存在',
      },
      request_id: requestId,
    },
  })
}

async function mockRoomApi(page: Page) {
  await page.route(
    /^http:\/\/127\.0\.0\.1:4173\/rooms(?:\/.*)?$/,
    fulfillRoomApi,
  )
}

test.describe('MeetNexus 房间入口页面', () => {
  test('首页显示中文内容并能进入创建会议页面', async ({
    page,
  }) => {
    await page.goto('/')

    await expect(
      page.getByRole('heading', {
        level: 1,
      }),
    ).toContainText('先检查设备')

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

  test('创建会议表单显示中文本地校验', async ({ page }) => {
    await page.goto('/#/create')

    await page
      .getByRole('button', {
        name: '创建会议',
      })
      .click()

    await expect(page.getByRole('alert')).toHaveText(
      '请输入会议主题。',
    )

    await page.getByLabel('会议主题').fill('项目例会')

    await page
      .getByRole('button', {
        name: '创建会议',
      })
      .click()

    await expect(page.getByRole('alert')).toHaveText(
      '请输入你的显示名称。',
    )
  })

  test('创建会议成功后进入真实房间页面', async ({ page }) => {
    await mockRoomApi(page)
    await page.goto('/#/create')

    const heartbeatRequest = page.waitForRequest(
      (request) =>
        request.method() === 'POST' &&
        new URL(request.url()).pathname.endsWith('/heartbeat'),
    )

    await page
      .getByLabel('会议主题')
      .fill('MeetNexus 项目例会')
    await page
      .getByLabel('你的显示名称')
      .fill('测试主持人')

    await page
      .getByRole('button', {
        name: '创建会议',
      })
      .click()

    await expect(page).toHaveURL(
      new RegExp(`#\\/rooms\\/${roomId}$`),
    )
    await expect(
      page.getByRole('heading', {
        level: 1,
        name: 'MeetNexus 项目例会',
      }),
    ).toBeVisible()
    await expect(page.getByText('测试主持人（你）')).toBeVisible()

    const heartbeat = await heartbeatRequest
    expect(heartbeat.method()).toBe('POST')

    const leaveRequest = page.waitForRequest(
      (request) => request.method() === 'DELETE',
    )

    await page
      .getByRole('button', {
        name: '离开会议',
      })
      .click()

    const leave = await leaveRequest
    expect(leave.method()).toBe('DELETE')
    await expect(page).toHaveURL(/#\/$/)

    const storedSession = await page.evaluate(() =>
      sessionStorage.getItem('meetnexus.room-session'),
    )

    expect(storedSession).toBeNull()
  })

  test('创建接口响应不符合契约时显示中文错误', async ({
    page,
  }) => {
    await page.route(
      /^http:\/\/127\.0\.0\.1:4173\/rooms$/,
      async (route) => {
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          json: {
            data: {
              unexpected: true,
            },
            request_id: requestId,
          },
        })
      },
    )
    await page.goto('/#/create')

    await page.getByLabel('会议主题').fill('错误响应测试')
    await page
      .getByLabel('你的显示名称')
      .fill('测试主持人')
    await page
      .getByRole('button', {
        name: '创建会议',
      })
      .click()

    await expect(page.getByRole('alert')).toContainText(
      '服务器响应格式不符合 OpenAPI 契约。',
    )
  })

  test('加入会议时校验会议号格式', async ({ page }) => {
    await page.goto('/#/join')
    await page.getByLabel('会议号').fill('ROOM-2026')

    await page
      .getByRole('button', {
        name: '加入会议',
      })
      .click()

    await expect(page.getByRole('alert')).toHaveText(
      '请输入有效的会议号。',
    )
  })

  test('加入会议成功后保存成员身份并进入房间', async ({
    page,
  }) => {
    await mockRoomApi(page)
    await page.goto('/#/join')

    await page.getByLabel('会议号').fill(roomId)
    await page
      .getByLabel('你的显示名称')
      .fill('测试参会者')

    await page
      .getByRole('button', {
        name: '加入会议',
      })
      .click()

    await expect(page).toHaveURL(
      new RegExp(`#\\/rooms\\/${roomId}$`),
    )
    await expect(
      page.getByRole('heading', {
        level: 1,
        name: 'MeetNexus 项目例会',
      }),
    ).toBeVisible()
  })

  test('直接访问房间页面时加载真实成员列表', async ({
    page,
  }) => {
    await mockRoomApi(page)
    await page.goto(`/#/rooms/${roomId}`)

    await expect(
      page.getByRole('heading', {
        level: 1,
        name: 'MeetNexus 项目例会',
      }),
    ).toBeVisible()
    await expect(page.getByText('测试主持人')).toBeVisible()
    await expect(
      page.getByText('主持人', {
        exact: true,
      }),
    ).toBeVisible()
    await expect(
      page.getByText('在线', {
        exact: true,
      }),
    ).toBeVisible()
    await expect(
      page.getByText(/当前浏览器没有该房间的成员身份/),
    ).toBeVisible()
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
