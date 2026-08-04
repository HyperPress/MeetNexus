import { z } from 'zod'

export const UuidSchema = z.uuid()
const CanonicalMeetingCodeSchema = z
  .string()
  .regex(/^\d{3}-\d{3}-\d{3}$/, '请输入有效的会议号。')

export function normalizeMeetingCode(value: string): string {
  const trimmed = value.trim()
  const digits = trimmed.replaceAll('-', '')

  if (/^\d{9}$/.test(digits)) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`
  }

  return trimmed
}

export const MeetingCodeSchema = z
  .string()
  .transform(normalizeMeetingCode)
  .pipe(CanonicalMeetingCodeSchema)
export const DateTimeSchema = z.iso.datetime({
  offset: true,
})

export const CreateRoomRequestSchema = z.strictObject({
  title: z
    .string()
    .trim()
    .min(1, '请输入会议主题。')
    .max(80, '会议主题不能超过 80 个字符。'),
  display_name: z
    .string()
    .trim()
    .min(1, '请输入你的显示名称。')
    .max(40, '显示名称不能超过 40 个字符。'),
})

export const JoinRoomRequestSchema = z.strictObject({
  meeting_code: MeetingCodeSchema,
  display_name: z
    .string()
    .trim()
    .min(1, '请输入你的显示名称。')
    .max(40, '显示名称不能超过 40 个字符。'),
})

export const RoomRoleSchema = z.enum(['host', 'participant'])

export const RoomSchema = z.strictObject({
  id: UuidSchema,
  meeting_code: MeetingCodeSchema,
  title: z.string(),
  created_at: DateTimeSchema,
})

export const RoomMemberSchema = z.strictObject({
  id: UuidSchema,
  display_name: z.string(),
  role: RoomRoleSchema,
  joined_at: DateTimeSchema,
  online: z.boolean(),
})

export const RoomDetailsSchema = z.strictObject({
  room: RoomSchema,
  members: z.array(RoomMemberSchema),
})

export const RoomDetailsResponseSchema = z.strictObject({
  data: RoomDetailsSchema,
  request_id: UuidSchema,
})

export const SessionTokenSchema = z.string().min(1)

export const CreateRoomResponseSchema = z.strictObject({
  data: RoomDetailsSchema,
  request_id: UuidSchema,
  session_token: SessionTokenSchema,
})

export const JoinRoomResponseSchema = z.strictObject({
  data: RoomMemberSchema,
  room_id: UuidSchema,
  request_id: UuidSchema,
  session_token: SessionTokenSchema,
})

export const RoomEventSchema = z.discriminatedUnion('event', [
  z.strictObject({
    event: z.literal('member_joined'),
    member: RoomMemberSchema,
  }),
  z.strictObject({
    event: z.literal('member_left'),
    member_id: UuidSchema,
  }),
  z.strictObject({
    event: z.literal('media_started'),
    member_id: UuidSchema,
  }),
  z.strictObject({
    event: z.literal('media_stopped'),
    member_id: UuidSchema,
  }),
  z.strictObject({
    event: z.literal('screen_share_started'),
    member_id: UuidSchema,
  }),
  z.strictObject({
    event: z.literal('screen_share_stopped'),
    member_id: UuidSchema,
  }),
  z.strictObject({
    event: z.literal('resync_required'),
  }),
])

export const RecordingStateSchema = z.enum(['recording', 'stopped'])

export const RecordingSchema = z.strictObject({
  id: UuidSchema,
  room_id: UuidSchema,
  member_id: UuidSchema,
  started_by: UuidSchema,
  live777_record_id: z.string().nullable(),
  mpd_path: z.string().nullable(),
  state: RecordingStateSchema,
  started_at: DateTimeSchema,
  stopped_at: DateTimeSchema.nullable(),
})

export const RecordingResponseSchema = z.strictObject({
  data: RecordingSchema,
  request_id: UuidSchema,
})

export const RecordingListResponseSchema = z.strictObject({
  data: z.array(RecordingSchema),
  request_id: UuidSchema,
})

export const ErrorDetailSchema = z.strictObject({
  code: z.string(),
  message: z.string(),
})

export const ErrorResponseSchema = z.strictObject({
  error: ErrorDetailSchema,
  request_id: UuidSchema,
})

export type CreateRoomRequest = z.infer<
  typeof CreateRoomRequestSchema
>
export type JoinRoomRequest = z.infer<
  typeof JoinRoomRequestSchema
>
export type RoomRole = z.infer<typeof RoomRoleSchema>
export type Room = z.infer<typeof RoomSchema>
export type RoomMember = z.infer<typeof RoomMemberSchema>
export type RoomDetails = z.infer<typeof RoomDetailsSchema>
export type RoomDetailsResponse = z.infer<
  typeof RoomDetailsResponseSchema
>
export type CreateRoomResponse = z.infer<
  typeof CreateRoomResponseSchema
>
export type JoinRoomResponse = z.infer<
  typeof JoinRoomResponseSchema
>
export type RoomEvent = z.infer<typeof RoomEventSchema>
export type RecordingState = z.infer<typeof RecordingStateSchema>
export type Recording = z.infer<typeof RecordingSchema>
export type RecordingResponse = z.infer<typeof RecordingResponseSchema>
export type RecordingListResponse = z.infer<
  typeof RecordingListResponseSchema
>
