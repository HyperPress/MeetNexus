import { expect, test, type Page, type Route } from '@playwright/test'

const roomId = 'a1e8bd65-631c-4c6e-bd79-b46d90ab4701'
const hostId = '2746fdb9-a0d7-4e32-9723-42a77ed9b018'
const participantId = 'ca5abed4-4635-4ab4-a23d-c2b9f1a8ad79'
const requestId = 'f3d40968-f0e0-44fc-8b68-89d7f44c9ce3'
const sessionToken = 'test-media-session-token'

async function installIsolatedPeerConnection(page: Page) {
  await page.addInitScript(() => {
    const testWindow = window as typeof window & {
      __meetNexusEmitMediaStarted?: () => void
      __meetNexusMediaConstraints?: MediaStreamConstraints[]
    }
    const originalGetUserMedia = navigator.mediaDevices.getUserMedia.bind(
      navigator.mediaDevices,
    )
    testWindow.__meetNexusMediaConstraints = []
    Object.defineProperty(navigator.mediaDevices, 'enumerateDevices', {
      configurable: true,
      value: async (): Promise<MediaDeviceInfo[]> =>
        [
          {
            deviceId: 'camera-front',
            groupId: 'camera-group',
            kind: 'videoinput',
            label: '前置摄像头',
            toJSON: () => ({}),
          },
          {
            deviceId: 'camera-rear',
            groupId: 'camera-group',
            kind: 'videoinput',
            label: '后置摄像头',
            toJSON: () => ({}),
          },
          {
            deviceId: 'microphone-built-in',
            groupId: 'microphone-group',
            kind: 'audioinput',
            label: '内置麦克风',
            toJSON: () => ({}),
          },
          {
            deviceId: 'microphone-usb',
            groupId: 'microphone-group',
            kind: 'audioinput',
            label: 'USB 麦克风',
            toJSON: () => ({}),
          },
        ] as MediaDeviceInfo[],
    })
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
      configurable: true,
      value: async (constraints: MediaStreamConstraints) => {
        testWindow.__meetNexusMediaConstraints?.push(constraints)
        return originalGetUserMedia({ audio: true, video: true })
      },
    })

    class IsolatedPeerConnection extends EventTarget {
      connectionState = 'connected'
      iceGatheringState = 'complete'
      localDescription: RTCSessionDescriptionInit | null = null
      private receivesRemoteMedia = false

      constructor() {
        super()
        const peerConnectionWindow = window as typeof window & {
          __meetNexusPeerConnections?: IsolatedPeerConnection[]
        }
        peerConnectionWindow.__meetNexusPeerConnections ??= []
        peerConnectionWindow.__meetNexusPeerConnections.push(this)
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
        await new Promise<void>((resolve) => {
          window.setTimeout(resolve, 200)
        })
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
        const emitMediaStarted = () => {
          const event = new Event('message')
          Object.defineProperty(event, 'data', {
            value: JSON.stringify({
              event: 'media_started',
              member_id: 'ca5abed4-4635-4ab4-a23d-c2b9f1a8ad79',
            }),
          })
          this.dispatchEvent(event)
        }
        testWindow.__meetNexusEmitMediaStarted = emitMediaStarted
        queueMicrotask(emitMediaStarted)
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
            meeting_code: '234-567-890',
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

    await expect(page.getByLabel('摄像头设备')).toBeEnabled()
    await expect(page.getByLabel('麦克风设备')).toBeEnabled()
    await page.getByRole('button', { name: '识别设备名称' }).click()
    await expect(page.getByRole('status')).toContainText(
      '设备名称已更新，请选择后再启动音视频设备。',
    )
    await page.getByLabel('摄像头设备').selectOption('camera-rear')
    await page.getByLabel('麦克风设备').selectOption('microphone-usb')

    const firstPublish = page.waitForRequest(
      (request) =>
        request.method() === 'POST' &&
        new URL(request.url()).pathname.startsWith('/media/whip/'),
    )
    let subscribeRequestCount = 0
    page.on('request', (request) => {
      if (
        request.method() === 'POST' &&
        new URL(request.url()).pathname.startsWith('/media/whep/')
      ) {
        subscribeRequestCount += 1
      }
    })
    const firstSubscribe = page.waitForRequest(
      (request) =>
        request.method() === 'POST' &&
        new URL(request.url()).pathname.startsWith('/media/whep/'),
    )

    await page.getByRole('button', { name: '启动音视频设备' }).click()
    await firstPublish
    await firstSubscribe
    await page.evaluate(() => {
      ;(
        window as typeof window & {
          __meetNexusEmitMediaStarted?: () => void
        }
      ).__meetNexusEmitMediaStarted?.()
    })
    await page.waitForTimeout(250)
    expect(subscribeRequestCount).toBe(1)

    const mediaConstraints = await page.evaluate(() => {
      const testWindow = window as typeof window & {
        __meetNexusMediaConstraints?: MediaStreamConstraints[]
      }
      return testWindow.__meetNexusMediaConstraints?.[1]
    })
    expect(mediaConstraints).toEqual({
      audio: { deviceId: { exact: 'microphone-usb' } },
      video: { deviceId: { exact: 'camera-rear' } },
    })

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
