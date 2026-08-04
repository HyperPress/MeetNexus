import {
  requestBinary,
  requestJson,
  requestNoContent,
} from '../../../lib/api/httpClient'
import {
  RoomDetailsResponseSchema,
  CreateRoomResponseSchema,
  JoinRoomResponseSchema,
  RecordingListResponseSchema,
  RecordingResponseSchema,
  type CreateRoomRequest,
  type JoinRoomRequest,
  type CreateRoomResponse,
  type JoinRoomResponse,
  type RoomDetailsResponse,
  type RecordingListResponse,
  type RecordingResponse,
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

export function leaveRoomOnPageExit(
  roomId: string,
  memberId: string,
  sessionToken: string,
): void {
  void fetch(memberPath(roomId, memberId), {
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${sessionToken}`,
    },
    keepalive: true,
    method: 'DELETE',
  }).catch(() => {
    // 页面已经离开，失败时只能交给服务端心跳超时机制兜底。
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

function recordingPath(roomId: string): string {
  return `${roomPath(roomId)}/recordings`
}

export function listRoomRecordings(
  roomId: string,
  sessionToken: string,
): Promise<RecordingListResponse> {
  return requestJson(
    recordingPath(roomId),
    RecordingListResponseSchema,
    {
      headers: { Authorization: `Bearer ${sessionToken}` },
    },
  )
}

export function startRoomMemberRecording(
  roomId: string,
  memberId: string,
  sessionToken: string,
): Promise<RecordingResponse> {
  return requestJson(
    `${recordingPath(roomId)}/${encodeURIComponent(memberId)}`,
    RecordingResponseSchema,
    {
      headers: { Authorization: `Bearer ${sessionToken}` },
      method: 'POST',
    },
  )
}

export function stopRoomRecording(
  roomId: string,
  recordingId: string,
  sessionToken: string,
): Promise<RecordingResponse> {
  return requestJson(
    `${recordingPath(roomId)}/${encodeURIComponent(recordingId)}/stop`,
    RecordingResponseSchema,
    {
      headers: { Authorization: `Bearer ${sessionToken}` },
      method: 'POST',
    },
  )
}

export function getRoomRecordingPlaybackFile(
  roomId: string,
  recordingId: string,
  fileName: string,
  sessionToken: string,
) {
  return requestBinary(
    `${recordingPath(roomId)}/${encodeURIComponent(recordingId)}/playback/${encodeURIComponent(fileName)}`,
    {
      headers: {
        Accept: 'application/dash+xml, video/iso.segment',
        Authorization: `Bearer ${sessionToken}`,
      },
    },
  )
}
