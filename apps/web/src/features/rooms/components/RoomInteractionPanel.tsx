import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from 'react'
import type { RoomChatMessage } from '../../../schemas/room'

interface RoomInteractionPanelProps {
  currentMemberId: string | null
  errorMessage: string | null
  isConnected: boolean
  isHandRaised: boolean
  messages: RoomChatMessage[]
  onSendMessage: (content: string) => boolean
  onSetHandRaised: (raised: boolean) => boolean
}

const CHAT_MESSAGE_MAX_CHARS = 500

function formatMessageTime(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

export function RoomInteractionPanel({
  currentMemberId,
  errorMessage,
  isConnected,
  isHandRaised,
  messages,
  onSendMessage,
  onSetHandRaised,
}: RoomInteractionPanelProps) {
  const [draft, setDraft] = useState('')
  const messageListRef = useRef<HTMLUListElement | null>(null)
  const canInteract = currentMemberId !== null && isConnected
  const normalizedDraft = draft.trim()

  useEffect(() => {
    const messageList = messageListRef.current
    if (messageList !== null) {
      messageList.scrollTop = messageList.scrollHeight
    }
  }, [messages])

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (
      !canInteract ||
      normalizedDraft.length === 0 ||
      normalizedDraft.length > CHAT_MESSAGE_MAX_CHARS
    ) {
      return
    }
    if (onSendMessage(normalizedDraft)) {
      setDraft('')
    }
  }

  return (
    <section className="mt-4 flex min-h-[30rem] flex-col border-t border-base-300 pt-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">互动</h2>
          <p className="text-xs text-base-content/60">
            文字聊天与举手状态仅在当前会议中保留。
          </p>
        </div>

        <button
          aria-pressed={isHandRaised}
          className={isHandRaised ? 'btn btn-warning btn-sm' : 'btn btn-outline btn-sm'}
          disabled={!canInteract}
          onClick={() => {
            onSetHandRaised(!isHandRaised)
          }}
          type="button"
        >
          {isHandRaised ? '放下手' : '举手'}
        </button>
      </div>

      {!isConnected && currentMemberId !== null && (
        <p className="mt-3 text-sm text-warning">
          实时连接恢复后即可发送消息和举手。
        </p>
      )}

      {errorMessage !== null && (
        <div className="alert alert-error mt-3 py-2 text-sm" role="alert">
          <span>{errorMessage}</span>
        </div>
      )}

      <ul
        ref={messageListRef}
        aria-label="会议聊天消息"
        className="mt-4 min-h-72 flex-1 space-y-3 overflow-y-auto rounded-box bg-base-200 p-3"
      >
        {messages.length === 0 ? (
          <li className="py-6 text-center text-sm text-base-content/60">
            暂无聊天消息
          </li>
        ) : (
          messages.map((message) => {
            const isOwnMessage = message.member_id === currentMemberId
            return (
              <li
                className={isOwnMessage ? 'text-right' : 'text-left'}
                key={message.id}
              >
                <p className="text-xs text-base-content/60">
                  {message.display_name}
                  {isOwnMessage ? '（你）' : ''} · {formatMessageTime(message.sent_at)}
                </p>
                <p className="mt-1 inline-block max-w-full whitespace-pre-wrap break-words rounded-box bg-base-100 px-3 py-2 text-left text-sm">
                  {message.content}
                </p>
              </li>
            )
          })
        )}
      </ul>

      <form className="mt-3 flex items-end gap-2" onSubmit={handleSubmit}>
        <label className="form-control flex-1" htmlFor="room-chat-message">
          <span className="sr-only">发送消息</span>
          <textarea
            id="room-chat-message"
            className="textarea textarea-bordered h-12 min-h-12 w-full resize-none py-3"
            disabled={!canInteract}
            maxLength={CHAT_MESSAGE_MAX_CHARS}
            onChange={(event) => {
              setDraft(event.target.value)
            }}
            placeholder={canInteract ? '输入会议聊天内容' : '加入会议后可以聊天'}
            rows={1}
            value={draft}
          />
        </label>

        <button
          className="btn btn-primary h-12"
          disabled={!canInteract || normalizedDraft.length === 0}
          type="submit"
        >
          发送
        </button>
      </form>
    </section>
  )
}
