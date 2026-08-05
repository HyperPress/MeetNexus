import {
  RoomEventSchema,
  type RoomEvent,
} from '../../../schemas/room'

interface RoomEventConnectionOptions {
  onClose: () => void
  onEvent: (event: RoomEvent) => void
  onOpen: () => void
  roomId: string
  sessionToken: string
}

type RoomCommand =
  | { command: 'send_chat_message'; content: string }
  | { command: 'set_hand_raised'; raised: boolean }

export interface RoomEventConnection {
  disconnect: () => void
  sendChatMessage: (content: string) => boolean
  setHandRaised: (raised: boolean) => boolean
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
  onOpen,
  roomId,
  sessionToken,
}: RoomEventConnectionOptions): RoomEventConnection {
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

  socket.addEventListener('open', onOpen, { once: true })
  socket.addEventListener('close', onClose, { once: true })

  function send(command: RoomCommand): boolean {
    if (socket.readyState !== 1) {
      return false
    }
    socket.send(JSON.stringify(command))
    return true
  }

  return {
    disconnect: () => {
      socket.removeEventListener('open', onOpen)
      socket.removeEventListener('close', onClose)
      socket.close()
    },
    sendChatMessage: (content) =>
      send({ command: 'send_chat_message', content }),
    setHandRaised: (raised) =>
      send({ command: 'set_hand_raised', raised }),
  }
}
