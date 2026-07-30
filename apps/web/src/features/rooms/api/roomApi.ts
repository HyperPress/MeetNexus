import {
  requestJson,
  requestNoContent,
} from '../../../lib/api/httpClient'
import {
  RoomDetailsResponseSchema,
  RoomMemberResponseSchema,
  type CreateRoomRequest,
  type JoinRoomRequest,
  type RoomDetailsResponse,
  type RoomMemberResponse,
} from '../../../schemas/room'

function roomPath(roomId: string): string {
  return `/rooms/${encodeURIComponent(roomId)}`
}

function memberPath(roomId: string, memberId: string): string {
  return `${roomPath(roomId)}/members/${encodeURIComponent(memberId)}`
}

export function createRoom(
  request: CreateRoomRequest,
): Promise<RoomDetailsResponse> {
  return requestJson('/rooms', RoomDetailsResponseSchema, {
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
): Promise<RoomMemberResponse> {
  return requestJson(
    `${roomPath(roomId)}/members`,
    RoomMemberResponseSchema,
    {
      method: 'POST',
      body: JSON.stringify(request),
    },
  )
}

export function leaveRoom(
  roomId: string,
  memberId: string,
): Promise<void> {
  return requestNoContent(memberPath(roomId, memberId), {
    method: 'DELETE',
  })
}

export function refreshRoomMemberPresence(
  roomId: string,
  memberId: string,
): Promise<void> {
  return requestNoContent(
    `${memberPath(roomId, memberId)}/heartbeat`,
    {
      method: 'POST',
    },
  )
}
