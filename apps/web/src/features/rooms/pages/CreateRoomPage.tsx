import { useState, type FormEvent } from 'react'

export function CreateRoomPage() {
  const [meetingTitle, setMeetingTitle] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [feedback, setFeedback] = useState<string | null>(null)
  const [hasError, setHasError] = useState(false)

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (meetingTitle.trim() === '') {
      setHasError(true)
      setFeedback('请输入会议主题。')
      return
    }

    if (displayName.trim() === '') {
      setHasError(true)
      setFeedback('请输入你的显示名称。')
      return
    }

    setHasError(false)
    setFeedback(
      '表单已通过本地校验。房间接口尚未接入，因此当前不会真正创建会议。',
    )
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
              填写会议信息，后续可邀请其他成员加入。
            </p>
          </div>

          <form className="space-y-5" noValidate onSubmit={handleSubmit}>
            <fieldset className="fieldset">
              <label className="fieldset-legend" htmlFor="meeting-title">
                会议主题
              </label>

              <input
                className="input w-full"
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

            {feedback !== null && (
              <div
                aria-live="polite"
                className={hasError ? 'alert alert-error' : 'alert alert-info'}
                role={hasError ? 'alert' : 'status'}
              >
                <span>{feedback}</span>
              </div>
            )}

            <button className="btn btn-primary w-full" type="submit">
              创建会议
            </button>
          </form>
        </div>
      </section>
    </main>
  )
}