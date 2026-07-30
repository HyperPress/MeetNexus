import { useState, type FormEvent } from 'react'
import { getApiErrorMessage } from '../../../lib/api/httpClient'
import { CreateRoomRequestSchema } from '../../../schemas/room'
import { createRoom } from '../api/roomApi'
import { saveRoomSession } from '../session/roomSession'

export function CreateRoomPage() {
  const [meetingTitle, setMeetingTitle] = useState('')
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

    const validationResult = CreateRoomRequestSchema.safeParse({
      title: meetingTitle,
      display_name: displayName,
    })

    if (!validationResult.success) {
      setErrorMessage(
        validationResult.error.issues[0]?.message ??
          '请检查会议信息。',
      )
      return
    }

    setIsSubmitting(true)
    setErrorMessage(null)

    try {
      const response = await createRoom(validationResult.data)
      const hostMember = response.data.members.find(
        (member) => member.role === 'host',
      )

      if (hostMember === undefined) {
        setErrorMessage(
          `服务器响应中缺少主持人成员。（请求编号：${response.request_id}）`,
        )
        return
      }

      saveRoomSession({
        roomId: response.data.room.id,
        memberId: hostMember.id,
        displayName: hostMember.display_name,
        role: hostMember.role,
      })

      window.location.hash = `#/rooms/${response.data.room.id}`
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

            <h1 className="mt-4 text-3xl font-bold">创建会议</h1>

            <p className="mt-2 text-base-content/70">
              填写会议信息，创建成功后你将自动成为主持人。
            </p>
          </div>

          <form className="space-y-5" noValidate onSubmit={handleSubmit}>
            <fieldset className="fieldset">
              <label className="fieldset-legend" htmlFor="meeting-title">
                会议主题
              </label>

              <input
                className="input w-full"
                disabled={isSubmitting}
                id="meeting-title"
                maxLength={80}
                onChange={(event) => setMeetingTitle(event.target.value)}
                placeholder="例如：项目每周例会"
                type="text"
                value={meetingTitle}
              />

              <p className="label">
                请使用简短、清晰的名称，最多输入 80 个字符。
              </p>
            </fieldset>

            <fieldset className="fieldset">
              <label className="fieldset-legend" htmlFor="creator-name">
                你的显示名称
              </label>

              <input
                className="input w-full"
                disabled={isSubmitting}
                id="creator-name"
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
              {isSubmitting ? '正在创建会议……' : '创建会议'}
            </button>
          </form>
        </div>
      </section>
    </main>
  )
}
