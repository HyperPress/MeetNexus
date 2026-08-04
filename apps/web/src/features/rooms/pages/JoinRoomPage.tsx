import { useState, type FormEvent } from 'react'
import { getApiErrorMessage } from '../../../lib/api/httpClient'
import {
  JoinRoomRequestSchema,
} from '../../../schemas/room'
import { joinRoom } from '../api/roomApi'
import { saveRoomSession } from '../session/roomSession'

export function JoinRoomPage() {
  const [roomId, setRoomId] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [errorMessage, setErrorMessage] = useState<string | null>(
    null,
  )
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault()

    if (isSubmitting) {
      return
    }

    const normalizedRoomId = roomId.trim()

    if (normalizedRoomId === '') {
      setErrorMessage('请输入会议号。')
      return
    }

    const requestResult = JoinRoomRequestSchema.safeParse({
      meeting_code: normalizedRoomId,
      display_name: displayName,
    })

    if (!requestResult.success) {
      setErrorMessage(
        requestResult.error.issues[0]?.message ??
          '请检查显示名称。',
      )
      return
    }

    setIsSubmitting(true)
    setErrorMessage(null)

    try {
      const response = await joinRoom(
        requestResult.data,
      )

      saveRoomSession({
        roomId: response.room_id,
        memberId: response.data.id,
        displayName: response.data.display_name,
        role: response.data.role,
        sessionToken: response.session_token,
      })

      window.location.hash = `#/rooms/${response.room_id}`
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-12">
      <section className="card w-full max-w-xl bg-base-100 shadow-xl">
        <div className="card-body gap-6">
          <div>
            <a className="link link-hover text-sm" href="#/">
              ← 返回首页
            </a>

            <h1 className="mt-4 text-3xl font-bold">加入会议</h1>

            <p className="mt-2 text-base-content/70">
              输入会议号和你的显示名称，加入已有会议。
            </p>
          </div>

          <form className="space-y-5" noValidate onSubmit={handleSubmit}>
            <fieldset className="fieldset">
              <label className="fieldset-legend" htmlFor="room-id">
                会议号
              </label>

              <input
                autoComplete="off"
                className="input w-full"
                disabled={isSubmitting}
                id="room-id"
                inputMode="numeric"
                maxLength={11}
                onChange={(event) => setRoomId(event.target.value)}
                placeholder="例如：123-456-789"
                type="text"
                value={roomId}
              />

              <p className="label">
                会议号由会议创建者提供，格式为 123-456-789。
              </p>
            </fieldset>

            <fieldset className="fieldset">
              <label className="fieldset-legend" htmlFor="participant-name">
                你的显示名称
              </label>

              <input
                className="input w-full"
                disabled={isSubmitting}
                id="participant-name"
                maxLength={40}
                onChange={(event) => setDisplayName(event.target.value)}
                placeholder="例如：小明"
                type="text"
                value={displayName}
              />

              <p className="label">
                该名称将在会议成员列表中显示。
              </p>
            </fieldset>

            {errorMessage !== null && (
              <div
                aria-live="polite"
                className="alert alert-error"
                role="alert"
              >
                <span>{errorMessage}</span>
              </div>
            )}

            <button
              className="btn btn-primary w-full"
              disabled={isSubmitting}
              type="submit"
            >
              {isSubmitting ? '正在加入会议……' : '加入会议'}
            </button>
          </form>
        </div>
      </section>
    </main>
  )
}
