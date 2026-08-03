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
  const connection = new RTCPeerConnection()
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
  const connection = new RTCPeerConnection()
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
