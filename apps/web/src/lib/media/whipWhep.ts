export class MeetingMediaError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MeetingMediaError'
  }
}

interface NegotiationOptions {
  memberId: string
  roomId: string
  sessionToken: string
  streamKind?: 'camera' | 'screen'
  streamMemberId: string
}

interface IceServerResponse {
  data?: {
    ice_servers?: unknown
  }
}

// TURN 凭据由后端签发，有效期约 1 小时。缓存 50 分钟后必须重新获取，
// 否则长时间会议中新建的 PeerConnection 会复用已过期的 TURN 凭据。
const ICE_SERVER_CACHE_TTL_MS = 50 * 60 * 1_000

const iceServerRequests = new Map<
  string,
  { expiresAt: number; request: Promise<RTCIceServer[]> }
>()

function mediaPath(
  operation: 'whip' | 'whep',
  options: NegotiationOptions,
): string {
  const suffix = options.streamKind === 'screen' ? '/screen' : ''
  return `/media/${operation}/${options.roomId}/${options.streamMemberId}${suffix}`
}

export interface MediaSession {
  connection: RTCPeerConnection
  close: () => Promise<void>
}

export interface SubscriptionSession extends MediaSession {
  stream: MediaStream
}

function mediaHeaders(sessionToken: string): HeadersInit {
  return {
    Authorization: `Bearer ${sessionToken}`,
    'Content-Type': 'application/sdp',
  }
}

function parseIceServers(body: IceServerResponse): RTCIceServer[] {
  const servers = body.data?.ice_servers
  if (!Array.isArray(servers)) {
    return []
  }

  return servers.flatMap((server): RTCIceServer[] => {
    if (
      typeof server !== 'object' ||
      server === null ||
      !('urls' in server) ||
      !Array.isArray(server.urls) ||
      !server.urls.every((url: unknown) => typeof url === 'string') ||
      !('username' in server) ||
      typeof server.username !== 'string' ||
      !('credential' in server) ||
      typeof server.credential !== 'string'
    ) {
      return []
    }
    return [
      {
        urls: server.urls,
        username: server.username,
        credential: server.credential,
      },
    ]
  })
}

async function loadIceServers(options: NegotiationOptions): Promise<RTCIceServer[]> {
  try {
    const response = await fetch(`/media/ice-servers/${options.roomId}`, {
      headers: { Authorization: `Bearer ${options.sessionToken}` },
    })
    if (!response.ok) {
      return []
    }
    return parseIceServers((await response.json()) as IceServerResponse)
  } catch {
    // 在滚动发布期间或 TURN 尚未配置时，保留现有的直连协商能力。
    return []
  }
}

function createPeerConnection(options: NegotiationOptions): Promise<RTCPeerConnection> {
  const cacheKey = `${options.roomId}:${options.sessionToken}`
  const now = Date.now()
  const cached = iceServerRequests.get(cacheKey)
  if (cached !== undefined && cached.expiresAt > now) {
    return cached.request.then(
      (iceServers) => new RTCPeerConnection({ iceServers }),
    )
  }
  const request = loadIceServers(options)
  iceServerRequests.set(cacheKey, {
    expiresAt: now + ICE_SERVER_CACHE_TTL_MS,
    request,
  })
  void request.catch(() => iceServerRequests.delete(cacheKey))
  return request.then(
    (iceServers) => new RTCPeerConnection({ iceServers }),
  )
}

function waitForIceGathering(connection: RTCPeerConnection): Promise<void> {
  if (connection.iceGatheringState === 'complete') {
    return Promise.resolve()
  }

  return new Promise((resolve) => {
    const onStateChange = () => {
      if (connection.iceGatheringState === 'complete') {
        connection.removeEventListener('icegatheringstatechange', onStateChange)
        resolve()
      }
    }

    connection.addEventListener('icegatheringstatechange', onStateChange)
  })
}

async function getErrorMessage(response: Response): Promise<string> {
  try {
    const body: unknown = await response.json()
    if (
      typeof body === 'object' &&
      body !== null &&
      'error' in body &&
      typeof body.error === 'object' &&
      body.error !== null &&
      'message' in body.error &&
      typeof body.error.message === 'string'
    ) {
      return body.error.message
    }
  } catch {
    // 媒体服务可能返回非 JSON 错误内容，统一使用中文提示。
  }

  return '音视频连接失败，请检查媒体服务后重试。'
}

async function negotiate(
  connection: RTCPeerConnection,
  url: string,
  sessionToken: string,
): Promise<() => Promise<void>> {
  const offer = await connection.createOffer()
  await connection.setLocalDescription(offer)
  await waitForIceGathering(connection)

  const sdp = connection.localDescription?.sdp
  if (sdp === undefined || sdp === '') {
    throw new MeetingMediaError('浏览器未生成有效的音视频协商信息。')
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: mediaHeaders(sessionToken),
    body: sdp,
  })
  if (!response.ok) {
    throw new MeetingMediaError(await getErrorMessage(response))
  }

  const contentType = response.headers.get('Content-Type') ?? ''
  const location = response.headers.get('Location')
  if (!contentType.startsWith('application/sdp') || location === null) {
    throw new MeetingMediaError('媒体服务返回的协商响应无效。')
  }

  const answerSdp = await response.text()
  if (answerSdp === '') {
    throw new MeetingMediaError('媒体服务未返回音视频协商结果。')
  }
  await connection.setRemoteDescription({
    type: 'answer',
    sdp: answerSdp,
  })

  return async () => {
    connection.close()
    try {
      await fetch(location, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${sessionToken}`,
        },
      })
    } catch {
      // 浏览器关闭或网络断开时无法删除远端会话，由 Live777 负责回收。
    }
  }
}

export async function publishWhip(
  options: NegotiationOptions,
  stream: MediaStream,
): Promise<MediaSession> {
  const connection = await createPeerConnection(options)
  for (const track of stream.getTracks()) {
    connection.addTrack(track, stream)
  }

  try {
    const close = await negotiate(
      connection,
      mediaPath('whip', options),
      options.sessionToken,
    )
    return { connection, close }
  } catch (error) {
    connection.close()
    throw error
  }
}

export async function subscribeWhep(
  options: NegotiationOptions,
): Promise<SubscriptionSession> {
  const connection = await createPeerConnection(options)
  const stream = new MediaStream()
  connection.addTransceiver('audio', { direction: 'recvonly' })
  connection.addTransceiver('video', { direction: 'recvonly' })
  connection.addEventListener('track', (event) => {
    for (const track of event.streams[0]?.getTracks() ?? [event.track]) {
      if (!stream.getTracks().some((currentTrack) => currentTrack.id === track.id)) {
        stream.addTrack(track)
      }
    }
  })

  try {
    const close = await negotiate(
      connection,
      mediaPath('whep', options),
      options.sessionToken,
    )
    return { connection, close, stream }
  } catch (error) {
    connection.close()
    throw error
  }
}

export function getMeetingMediaErrorMessage(error: unknown): string {
  if (error instanceof MeetingMediaError) {
    return error.message
  }

  return '音视频连接失败，请检查网络和媒体服务后重试。'
}
