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
const sessionToken = 'test-room-session-token'
const meetingCode = '123-456-789'

const roomDetailsResponse = {
  data: {
    room: {
      id: roomId,
      meeting_code: meetingCode,
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
      json: {
        ...roomDetailsResponse,
        session_token: sessionToken,
      },
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
    url.pathname === '/rooms/join' &&
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
        room_id: roomId,
        request_id: requestId,
        session_token: sessionToken,
      },
    })
    return
  }

  if (
    url.pathname === `/rooms/${roomId}/recordings` &&
    method === 'GET'
  ) {
    expect(request.headers().authorization).toBe(
      `Bearer ${sessionToken}`,
    )
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      json: { data: [], request_id: requestId },
    })
    return
  }

  if (
    url.pathname.endsWith('/heartbeat') &&
    method === 'POST'
  ) {
    expect(request.headers().authorization).toBe(
      `Bearer ${sessionToken}`,
    )
    await route.fulfill({
      status: 204,
    })
    return
  }

  if (method === 'DELETE') {
    expect(request.headers().authorization).toBe(
      `Bearer ${sessionToken}`,
    )
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
  await page.addInitScript(() => {
    class IsolatedWebSocket extends EventTarget {
      close() {
        this.dispatchEvent(new Event('close'))
      }
    }

    Object.defineProperty(window, 'WebSocket', {
      configurable: true,
      value: IsolatedWebSocket,
    })
  })
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
    await expect(page.getByText(`会议号：${meetingCode}`)).toBeVisible()
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

  test('离开会议页面时自动退出并清理成员会话', async ({ page }) => {
    await mockRoomApi(page)
    await page.goto('/#/create')

    await page.getByLabel('会议主题').fill('自动退出测试')
    await page.getByLabel('你的显示名称').fill('测试主持人')
    await page.getByRole('button', { name: '创建会议' }).click()
    await expect(page).toHaveURL(new RegExp(`#\\/rooms\\/${roomId}$`))

    const leaveRequest = page.waitForRequest(
      (request) =>
        request.method() === 'DELETE' &&
        new URL(request.url()).pathname ===
          `/rooms/${roomId}/members/${hostId}`,
    )

    await page.getByRole('link', { name: '首页', exact: true }).click()

    const leave = await leaveRequest
    expect(leave.headers().authorization).toBe(`Bearer ${sessionToken}`)
    await expect(page).toHaveURL(/#\/$/)
    await expect
      .poll(() =>
        page.evaluate(() =>
          sessionStorage.getItem('meetnexus.room-session'),
        ),
      )
      .toBeNull()
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

    await page.getByLabel('会议号').fill(meetingCode)
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

  test('加入会议时自动补全九位会议号的横杠', async ({ page }) => {
    await mockRoomApi(page)
    await page.goto('/#/join')

    const joinRequest = page.waitForRequest((request) => {
      return (
        request.method() === 'POST' &&
        new URL(request.url()).pathname === '/rooms/join' &&
        request.postDataJSON().meeting_code === meetingCode
      )
    })

    await page.getByLabel('会议号').fill('123456789')
    await expect(page.getByLabel('会议号')).toHaveValue(meetingCode)
    await page.getByLabel('你的显示名称').fill('测试参会者')
    await page.getByRole('button', { name: '加入会议' }).click()

    await joinRequest
    await expect(page).toHaveURL(new RegExp(`#\\/rooms\\/${roomId}$`))
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
      page.getByText(
        '当前浏览器没有该房间的成员身份。你可以查看房间，但不会发送在线心跳；如需参会，请通过加入会议页面进入。',
      ),
    ).toBeVisible()
  })

  test('房间成员可以控制本地音视频设备', async ({
    page,
  }) => {
    await mockRoomApi(page)
    await page.goto('/#/create')

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

    await page
      .getByRole('button', {
        name: '启动音视频设备',
      })
      .click()

    await expect(
      page.getByLabel('本地摄像头预览'),
    ).toBeVisible()

    await expect(
      page.getByRole('button', {
        name: '关闭摄像头',
      }),
    ).toBeVisible()

    await expect(
      page.getByRole('button', {
        name: '关闭麦克风',
      }),
    ).toBeVisible()

    await page
      .getByRole('button', {
        name: '关闭摄像头',
      })
      .click()

    await expect(
      page.getByRole('button', {
        name: '打开摄像头',
      }),
    ).toBeVisible()

    await page
      .getByRole('button', {
        name: '释放音视频设备',
      })
      .click()

    await expect(
      page.getByRole('button', {
        name: '启动音视频设备',
      }),
    ).toBeVisible()

    await expect(page.getByRole('status')).toContainText(
      '摄像头和麦克风已释放',
    )
  })

  test('成员事件通过受保护的 WebSocket 实时刷新房间列表', async ({
    page,
  }) => {
    await page.addInitScript(
      ({ storedRoomId, storedMemberId, token }) => {
        class IsolatedWebSocket extends EventTarget {
          static instances: IsolatedWebSocket[] = []
          protocol: string
          readyState = 1
          url: string

          constructor(url: string, protocol: string) {
            super()
            this.url = url
            this.protocol = protocol
            IsolatedWebSocket.instances.push(this)
          }

          close() {
            this.readyState = 3
            this.dispatchEvent(new Event('close'))
          }
        }

        const testWindow = window as typeof window & {
          __meetNexusWebSockets?: IsolatedWebSocket[]
        }
        Object.defineProperty(window, 'WebSocket', {
          configurable: true,
          value: IsolatedWebSocket,
        })
        class TestSourceBuffer extends EventTarget {
          appendBuffer() {
            queueMicrotask(() => {
              this.dispatchEvent(new Event('updateend'))
            })
          }
        }
        class TestMediaSource extends EventTarget {
          static isTypeSupported() {
            return true
          }

          readyState = 'closed'

          constructor() {
            super()
            queueMicrotask(() => {
              this.readyState = 'open'
              this.dispatchEvent(new Event('sourceopen'))
            })
          }

          addSourceBuffer() {
            return new TestSourceBuffer()
          }

          endOfStream() {
            this.readyState = 'ended'
          }
        }
        Object.defineProperty(window, 'MediaSource', {
          configurable: true,
          value: TestMediaSource,
        })
        Object.defineProperty(URL, 'createObjectURL', {
          configurable: true,
          value: () => 'blob:meetnexus-recording',
        })
        Object.defineProperty(URL, 'revokeObjectURL', {
          configurable: true,
          value: () => {},
        })
        testWindow.__meetNexusWebSockets = IsolatedWebSocket.instances
        sessionStorage.setItem(
          'meetnexus.room-session',
          JSON.stringify({
            roomId: storedRoomId,
            memberId: storedMemberId,
            displayName: '测试主持人',
            role: 'host',
            sessionToken: token,
          }),
        )
      },
      {
        storedRoomId: roomId,
        storedMemberId: hostId,
        token: sessionToken,
      },
    )

    let roomReadCount = 0
    await page.route(
      /^http:\/\/127\.0\.0\.1:4173\/rooms(?:\/.*)?$/,
      async (route) => {
        const request = route.request()
        const url = new URL(request.url())
        if (url.pathname === `/rooms/${roomId}` && request.method() === 'GET') {
          roomReadCount += 1
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            json: {
              ...roomDetailsResponse,
              data: {
                ...roomDetailsResponse.data,
                members:
                  roomReadCount === 1
                    ? roomDetailsResponse.data.members
                    : [
                        ...roomDetailsResponse.data.members,
                        {
                          id: participantId,
                          display_name: '实时参会者',
                          role: 'participant',
                          joined_at: '2026-07-30T00:05:00Z',
                          online: true,
                        },
                      ],
              },
            },
          })
          return
        }
        if (url.pathname.endsWith('/heartbeat')) {
          await route.fulfill({ status: 204 })
          return
        }
        if (
          url.pathname === `/rooms/${roomId}/recordings` &&
          request.method() === 'GET'
        ) {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            json: { data: [], request_id: requestId },
          })
          return
        }
        await route.fulfill({ status: 404 })
      },
    )

    await page.goto(`/#/rooms/${roomId}`)
    const memberList = page.locator('aside > .card-body > ul')
    await expect(memberList).toHaveCount(1)
    await expect(
      memberList.getByText('测试主持人', { exact: false }),
    ).toBeVisible()

    const socket = await page.evaluate(() => {
      const testWindow = window as typeof window & {
        __meetNexusWebSockets?: Array<{
          protocol: string
          url: string
        }>
      }
      return testWindow.__meetNexusWebSockets?.find((socket) =>
        socket.protocol.startsWith('meetnexus.'),
      )
    })
    expect(socket?.protocol).toBe(`meetnexus.${sessionToken}`)
    expect(socket?.url).not.toContain(sessionToken)

    await page.evaluate(() => {
      const testWindow = window as typeof window & {
        __meetNexusWebSockets?: Array<EventTarget & { protocol: string }>
      }
      const event = new Event('message')
      Object.defineProperty(event, 'data', {
        value: JSON.stringify({
          event: 'member_joined',
          member: {
            id: '33333333-3333-4333-8333-333333333333',
            display_name: '实时参会者',
            role: 'participant',
            joined_at: '2026-07-30T00:05:00Z',
            online: true,
          },
        }),
      })
      testWindow.__meetNexusWebSockets
        ?.find((socket) => socket.protocol.startsWith('meetnexus.'))
        ?.dispatchEvent(event)
    })

    await expect(
      memberList.getByText('实时参会者', { exact: false }),
    ).toBeVisible()
  })

  test('主持人可以管理成员录制任务', async ({ page }) => {
    await page.addInitScript(
      ({ storedRoomId, storedMemberId, token }) => {
        class IsolatedWebSocket extends EventTarget {
          close() {
            this.dispatchEvent(new Event('close'))
          }
        }

        Object.defineProperty(window, 'WebSocket', {
          configurable: true,
          value: IsolatedWebSocket,
        })
        sessionStorage.setItem(
          'meetnexus.room-session',
          JSON.stringify({
            roomId: storedRoomId,
            memberId: storedMemberId,
            displayName: '测试主持人',
            role: 'host',
            sessionToken: token,
          }),
        )
      },
      {
        storedRoomId: roomId,
        storedMemberId: hostId,
        token: sessionToken,
      },
    )

    const recordingId = '55555555-5555-4555-8555-555555555555'
    let recordings: Array<Record<string, unknown>> = []
    await page.route(
      /^http:\/\/127\.0\.0\.1:4173\/rooms(?:\/.*)?$/,
      async (route) => {
        const request = route.request()
        const url = new URL(request.url())
        if (url.pathname === `/rooms/${roomId}` && request.method() === 'GET') {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            json: roomDetailsResponse,
          })
          return
        }
        if (url.pathname.endsWith('/heartbeat')) {
          await route.fulfill({ status: 204 })
          return
        }
        if (url.pathname === `/rooms/${roomId}/recordings` && request.method() === 'GET') {
          expect(request.headers().authorization).toBe(`Bearer ${sessionToken}`)
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            json: { data: recordings, request_id: requestId },
          })
          return
        }
        if (
          url.pathname === `/rooms/${roomId}/recordings/${hostId}` &&
          request.method() === 'POST'
        ) {
          expect(request.headers().authorization).toBe(`Bearer ${sessionToken}`)
          recordings = [
            {
              id: recordingId,
              room_id: roomId,
              member_id: hostId,
              started_by: hostId,
              live777_record_id: null,
              mpd_path: '/room-test/1/manifest.mpd',
              state: 'recording',
              started_at: '2026-08-03T00:00:00Z',
              stopped_at: null,
            },
          ]
          await route.fulfill({
            status: 201,
            contentType: 'application/json',
            json: { data: recordings[0], request_id: requestId },
          })
          return
        }
        if (
          url.pathname === `/rooms/${roomId}/recordings/${recordingId}/stop` &&
          request.method() === 'POST'
        ) {
          expect(request.headers().authorization).toBe(`Bearer ${sessionToken}`)
          recordings = recordings.map((recording) => ({
            ...recording,
            state: 'stopped',
            stopped_at: '2026-08-03T00:01:00Z',
          }))
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            json: { data: recordings[0], request_id: requestId },
          })
          return
        }
        if (
          url.pathname ===
          `/rooms/${roomId}/recordings/${recordingId}/playback/manifest.mpd`
        ) {
          expect(request.headers().authorization).toBe(`Bearer ${sessionToken}`)
          await route.fulfill({
            status: 200,
            contentType: 'application/dash+xml',
            body: `<?xml version="1.0"?><MPD><Period><AdaptationSet><Representation mimeType="audio/mp4" codecs="opus"><SegmentTemplate initialization="a_init.m4s" media="a_seg_$Number%04d$.m4s" startNumber="1"><SegmentTimeline><S t="0" d="96000" /></SegmentTimeline></SegmentTemplate></Representation></AdaptationSet></Period></MPD>`,
          })
          return
        }
        if (
          url.pathname ===
            `/rooms/${roomId}/recordings/${recordingId}/playback/a_init.m4s` ||
          url.pathname ===
            `/rooms/${roomId}/recordings/${recordingId}/playback/a_seg_0001.m4s`
        ) {
          expect(request.headers().authorization).toBe(`Bearer ${sessionToken}`)
          await route.fulfill({
            status: 200,
            contentType: 'video/iso.segment',
            body: Buffer.from([0, 1, 2]),
          })
          return
        }
        await route.fulfill({ status: 404 })
      },
    )

    await page.goto(`/#/rooms/${roomId}`)
    const startButton = page.getByRole('button', {
      name: '开始录制',
    })
    await expect(startButton).toBeVisible()
    await startButton.click()

    const stopButton = page.getByRole('button', {
      name: '停止录制',
    })
    await expect(stopButton).toBeVisible()
    await stopButton.click()
    await expect(page.getByText('已停止：', { exact: false })).toBeVisible()

    await page.getByRole('button', { name: '播放回放' }).click()
    await expect(page.getByLabel('录制回放画面')).toBeVisible()
  })

  test('没有房间成员身份时禁用媒体控制', async ({
    page,
  }) => {
    await mockRoomApi(page)
    await page.goto(`/#/rooms/${roomId}`)

    await expect(
      page.getByRole('button', {
        name: '启动音视频设备',
      }),
    ).toBeDisabled()

    await expect(
      page.getByRole('button', {
        name: '共享屏幕',
      }),
    ).toBeDisabled()

    await expect(
      page.getByText(
        '当前浏览器没有该房间的成员身份，不能使用会议媒体控制。',
      ),
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
