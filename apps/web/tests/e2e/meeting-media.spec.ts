import { expect, test, type Page, type Route } from '@playwright/test'

const roomId = 'a1e8bd65-631c-4c6e-bd79-b46d90ab4701'
const hostId = '2746fdb9-a0d7-4e32-9723-42a77ed9b018'
const participantId = 'ca5abed4-4635-4ab4-a23d-c2b9f1a8ad79'
const requestId = 'f3d40968-f0e0-44fc-8b68-89d7f44c9ce3'
const sessionToken = 'test-media-session-token'

async function installIsolatedPeerConnection(page: Page) {
  await page.addInitScript(() => {
    class IsolatedPeerConnection extends EventTarget {
      connectionState = 'connected'
      iceGatheringState = 'complete'
      localDescription: RTCSessionDescriptionInit | null = null
      private receivesRemoteMedia = false

      constructor() {
        super()
        const testWindow = window as typeof window & {
          __meetNexusPeerConnections?: IsolatedPeerConnection[]
        }
        testWindow.__meetNexusPeerConnections ??= []
        testWindow.__meetNexusPeerConnections.push(this)
      }

      addTrack() {}

      addTransceiver() {
        this.receivesRemoteMedia = true
      }

      close() {
        this.connectionState = 'closed'
        this.dispatchEvent(new Event('connectionstatechange'))
      }

      async createOffer() {
        return {
          type: 'offer' as RTCSdpType,
          sdp: 'v=0\r\no=- 1 1 IN IP4 127.0.0.1\r\ns=MeetNexus\r\nt=0 0\r\n',
        }
      }

      async setLocalDescription(description: RTCSessionDescriptionInit) {
        this.localDescription = description
      }

      async setRemoteDescription() {
        if (!this.receivesRemoteMedia) {
          return
        }
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: true,
        })
        const event = new Event('track')
        Object.defineProperty(event, 'streams', {
          value: [stream],
        })
        this.dispatchEvent(event)
      }
    }

    Object.defineProperty(window, 'RTCPeerConnection', {
      configurable: true,
      value: IsolatedPeerConnection,
    })
    class IsolatedWebSocket extends EventTarget {
      constructor() {
        super()
        queueMicrotask(() => {
          const event = new Event('message')
          Object.defineProperty(event, 'data', {
            value: JSON.stringify({
              event: 'media_started',
              member_id: 'ca5abed4-4635-4ab4-a23d-c2b9f1a8ad79',
            }),
          })
          this.dispatchEvent(event)
        })
      }

      close() {
        this.dispatchEvent(new Event('close'))
      }
    }
    Object.defineProperty(window, 'WebSocket', {
      configurable: true,
      value: IsolatedWebSocket,
    })
  })
}

async function fulfillApi(route: Route) {
  const request = route.request()
  const url = new URL(request.url())

  if (url.pathname === `/rooms/${roomId}` && request.method() === 'GET') {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      json: {
        data: {
          room: {
            id: roomId,
            title: '双人音视频测试会议',
            created_at: '2026-08-03T00:00:00Z',
          },
          members: [
            {
              id: hostId,
              display_name: '测试主持人',
              role: 'host',
              joined_at: '2026-08-03T00:00:00Z',
              online: true,
            },
            {
              id: participantId,
              display_name: '测试参会者',
              role: 'participant',
              joined_at: '2026-08-03T00:01:00Z',
              online: true,
            },
          ],
        },
        request_id: requestId,
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
    expect(request.headers().authorization).toBe(`Bearer ${sessionToken}`)
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      json: { data: [], request_id: requestId },
    })
    return
  }

  if (request.method() === 'DELETE' && url.pathname.startsWith('/media/')) {
    expect(request.headers().authorization).toBe(`Bearer ${sessionToken}`)
    await route.fulfill({ status: 204 })
    return
  }

  if (request.method() === 'POST' && url.pathname.startsWith('/media/')) {
    expect(request.headers().authorization).toBe(`Bearer ${sessionToken}`)
    await route.fulfill({
      status: 201,
      headers: {
        'Content-Type': 'application/sdp',
        Location: `/media/sessions/${roomId}/${hostId}/${hostId}/test-session`,
      },
      body: 'v=0\r\no=- 2 2 IN IP4 127.0.0.1\r\ns=MeetNexus\r\nt=0 0\r\n',
    })
    return
  }

  await route.fulfill({ status: 404 })
}

test.describe('MeetNexus 音视频媒体流程', () => {
  test('双人成员可发布、订阅、关闭设备并在断线后重新协商', async ({
    page,
  }) => {
    await installIsolatedPeerConnection(page)
    await page.addInitScript(
      ({ roomId: storedRoomId, memberId, token }) => {
        sessionStorage.setItem(
          'meetnexus.room-session',
          JSON.stringify({
            roomId: storedRoomId,
            memberId,
            displayName: '测试主持人',
            role: 'host',
            sessionToken: token,
          }),
        )
      },
      { roomId, memberId: hostId, token: sessionToken },
    )
    await page.route(
      /http:\/\/127\.0\.0\.1:4173\/(?:rooms|media)\/.*$/,
      fulfillApi,
    )
    await page.goto(`/#/rooms/${roomId}`)

    const firstPublish = page.waitForRequest(
      (request) =>
        request.method() === 'POST' &&
        new URL(request.url()).pathname.startsWith('/media/whip/'),
    )
    const firstSubscribe = page.waitForRequest(
      (request) =>
        request.method() === 'POST' &&
        new URL(request.url()).pathname.startsWith('/media/whep/'),
    )

    await page.getByRole('button', { name: '启动音视频设备' }).click()
    await firstPublish
    await firstSubscribe

    await expect(page.getByText('已连接', { exact: true })).toBeVisible()
    await expect(
      page.getByLabel('测试参会者的远端画面'),
    ).toBeVisible()

    const recoveredPublish = page.waitForRequest(
      (request) =>
        request.method() === 'POST' &&
        new URL(request.url()).pathname.startsWith('/media/whip/'),
    )
    await page.evaluate(() => {
      const instance = (
        window as typeof window & {
          __meetNexusPeerConnections: Array<
            EventTarget & { connectionState: string }
          >
        }
      ).__meetNexusPeerConnections[0]
      if (instance === undefined) {
        throw new Error('未找到待恢复的发布连接')
      }
      const connection = instance as EventTarget & {
        connectionState: string
      }
      connection.connectionState = 'failed'
      connection.dispatchEvent(new Event('connectionstatechange'))
    })
    await recoveredPublish

    const closeSession = page.waitForRequest(
      (request) =>
        request.method() === 'DELETE' &&
        new URL(request.url()).pathname.startsWith('/media/sessions/'),
    )
    await page.getByRole('button', { name: '释放音视频设备' }).click()
    await closeSession
    await expect(
      page.getByRole('button', { name: '启动音视频设备' }),
    ).toBeVisible()
  })
})
