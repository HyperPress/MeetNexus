import {
  RoomEventSchema,
  type RoomEvent,
} from '../../../schemas/room'

interface RoomEventConnectionOptions {
  onClose: () => void
  onEvent: (event: RoomEvent) => void
  roomId: string
  sessionToken: string
}

function roomEventsUrl(roomId: string): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  const url = new URL(
    `/rooms/${encodeURIComponent(roomId)}/events`,
    `${protocol}//${window.location.host}`,
  )

  return url.toString()
}

export function connectRoomEvents({
  onClose,
  onEvent,
  roomId,
  sessionToken,
}: RoomEventConnectionOptions): () => void {
  const socket = new WebSocket(
    roomEventsUrl(roomId),
    `meetnexus.${sessionToken}`,
  )

  socket.addEventListener('message', (message) => {
    if (typeof message.data !== 'string') {
      return
    }

    try {
      const payload: unknown = JSON.parse(message.data)
      const result = RoomEventSchema.safeParse(payload)

      if (result.success) {
        onEvent(result.data)
      }
    } catch {
      // 忽略不符合房间事件契约的服务端消息，保持连接等待后续有效事件。
    }
  })

  socket.addEventListener('close', onClose, { once: true })

  return () => {
    socket.removeEventListener('close', onClose)
    socket.close()
  }
}
