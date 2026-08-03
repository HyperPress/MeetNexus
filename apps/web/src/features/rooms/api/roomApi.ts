import {
  requestJson,
  requestNoContent,
} from '../../../lib/api/httpClient'
import {
  RoomDetailsResponseSchema,
  CreateRoomResponseSchema,
  JoinRoomResponseSchema,
  type CreateRoomRequest,
  type JoinRoomRequest,
  type CreateRoomResponse,
  type JoinRoomResponse,
  type RoomDetailsResponse,
} from '../../../schemas/room'

function roomPath(roomId: string): string {
  return `/rooms/${encodeURIComponent(roomId)}`
}

function memberPath(roomId: string, memberId: string): string {
  return `${roomPath(roomId)}/members/${encodeURIComponent(memberId)}`
}

export function createRoom(
  request: CreateRoomRequest,
): Promise<CreateRoomResponse> {
  return requestJson('/rooms', CreateRoomResponseSchema, {
    method: 'POST',
    body: JSON.stringify(request),
  })
}

export function getRoom(
  roomId: string,
): Promise<RoomDetailsResponse> {
  return requestJson(roomPath(roomId), RoomDetailsResponseSchema)
}

export function joinRoom(
  roomId: string,
  request: JoinRoomRequest,
): Promise<JoinRoomResponse> {
  return requestJson(
    `${roomPath(roomId)}/members`,
    JoinRoomResponseSchema,
    {
      method: 'POST',
      body: JSON.stringify(request),
    },
  )
}

export function leaveRoom(
  roomId: string,
  memberId: string,
  sessionToken: string,
): Promise<void> {
  return requestNoContent(memberPath(roomId, memberId), {
    headers: { Authorization: `Bearer ${sessionToken}` },
    method: 'DELETE',
  })
}

export function refreshRoomMemberPresence(
  roomId: string,
  memberId: string,
  sessionToken: string,
): Promise<void> {
  return requestNoContent(
    `${memberPath(roomId, memberId)}/heartbeat`,
    {
      headers: { Authorization: `Bearer ${sessionToken}` },
      method: 'POST',
    },
  )
}
