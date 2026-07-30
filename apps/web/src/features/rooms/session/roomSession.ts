import { z } from 'zod'
import {
  RoomRoleSchema,
  UuidSchema,
} from '../../../schemas/room'

const ROOM_SESSION_KEY = 'meetnexus.room-session'

const RoomSessionSchema = z.strictObject({
  roomId: UuidSchema,
  memberId: UuidSchema,
  displayName: z.string().min(1),
  role: RoomRoleSchema,
})

export type RoomSession = z.infer<typeof RoomSessionSchema>

export function saveRoomSession(session: RoomSession): void {
  const validatedSession = RoomSessionSchema.parse(session)

  sessionStorage.setItem(
    ROOM_SESSION_KEY,
    JSON.stringify(validatedSession),
  )
}

export function readRoomSession(): RoomSession | null {
  const storedValue = sessionStorage.getItem(ROOM_SESSION_KEY)

  if (storedValue === null) {
    return null
  }

  try {
    const parsedValue: unknown = JSON.parse(storedValue)
    const result = RoomSessionSchema.safeParse(parsedValue)

    if (!result.success) {
      sessionStorage.removeItem(ROOM_SESSION_KEY)
      return null
    }

    return result.data
  } catch {
    sessionStorage.removeItem(ROOM_SESSION_KEY)
    return null
  }
}

export function clearRoomSession(): void {
  sessionStorage.removeItem(ROOM_SESSION_KEY)
}
