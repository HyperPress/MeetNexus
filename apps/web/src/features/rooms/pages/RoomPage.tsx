import {
  useCallback,
  useEffect,
  useState,
} from 'react'
import { getApiErrorMessage } from '../../../lib/api/httpClient'
import type { RoomDetails } from '../../../schemas/room'
import { MeetingMediaStage } from '../../meeting/components/MeetingMediaStage'
import {
  getRoom,
  leaveRoom,
  refreshRoomMemberPresence,
} from '../api/roomApi'
import {
  clearRoomSession,
  readRoomSession,
} from '../session/roomSession'

interface RoomPageProps {
  roomId: string
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

export function RoomPage({ roomId }: RoomPageProps) {
  const [roomDetails, setRoomDetails] =
    useState<RoomDetails | null>(null)
  const [roomSession] = useState(readRoomSession)
  const [isLoading, setIsLoading] = useState(true)
  const [isLeaving, setIsLeaving] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(
    null,
  )
  const [heartbeatError, setHeartbeatError] = useState<
    string | null
  >(null)

  const currentSession =
    roomSession?.roomId === roomId ? roomSession : null

  const loadRoom = useCallback(async () => {
    setIsLoading(true)
    setErrorMessage(null)

    try {
      const response = await getRoom(roomId)
      setRoomDetails(response.data)
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error))
    } finally {
      setIsLoading(false)
    }
  }, [roomId])

  useEffect(() => {
    void loadRoom()
  }, [loadRoom])

  useEffect(() => {
    if (currentSession === null) {
      return
    }

    const activeSession = currentSession
    let active = true

    async function sendHeartbeat() {
      try {
        await refreshRoomMemberPresence(
          activeSession.roomId,
          activeSession.memberId,
        )

        if (active) {
          setHeartbeatError(null)
        }
      } catch (error) {
        if (active) {
          setHeartbeatError(getApiErrorMessage(error))
        }
      }
    }

    void sendHeartbeat()

    const intervalId = window.setInterval(() => {
      void sendHeartbeat()
    }, 30_000)

    return () => {
      active = false
      window.clearInterval(intervalId)
    }
  }, [currentSession])

  async function handleLeaveRoom() {
    if (currentSession === null || isLeaving) {
      return
    }

    setIsLeaving(true)
    setErrorMessage(null)

    try {
      await leaveRoom(
        currentSession.roomId,
        currentSession.memberId,
      )

      clearRoomSession()
      window.location.hash = '#/'
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error))
      setIsLeaving(false)
    }
  }

  if (isLoading && roomDetails === null) {
    return (
      <main className="flex flex-1 items-center justify-center p-6">
        <div
          aria-live="polite"
          className="flex items-center gap-3"
          role="status"
        >
          <span className="loading loading-spinner loading-md" />
          <span>正在加载会议信息……</span>
        </div>
      </main>
    )
  }

  if (roomDetails === null) {
    return (
      <main className="flex flex-1 items-center justify-center p-6">
        <section className="card w-full max-w-lg bg-base-100 shadow-xl">
          <div className="card-body">
            <h1 className="card-title">无法进入会议</h1>

            <div className="alert alert-error" role="alert">
              <span>{errorMessage ?? '没有找到会议信息。'}</span>
            </div>

            <div className="card-actions justify-end">
              <button
                className="btn btn-ghost"
                onClick={() => {
                  window.location.hash = '#/join'
                }}
                type="button"
              >
                返回加入页面
              </button>

              <button
                className="btn btn-primary"
                onClick={() => {
                  void loadRoom()
                }}
                type="button"
              >
                重新加载
              </button>
            </div>
          </div>
        </section>
      </main>
    )
  }

  return (
    <main className="flex flex-1 px-4 py-8 sm:px-8">
      <section className="mx-auto w-full max-w-6xl">
        <div className="flex flex-col justify-between gap-4 sm:flex-row">
          <div>
            <a className="link link-hover text-sm" href="#/">
              ← 返回首页
            </a>

            <h1 className="mt-3 text-3xl font-bold">
              {roomDetails.room.title}
            </h1>

            <p className="mt-2 break-all text-sm text-base-content/70">
              会议号：{roomDetails.room.id}
            </p>

            <p className="mt-1 text-sm text-base-content/60">
              创建时间：
              {formatDateTime(roomDetails.room.created_at)}
            </p>
          </div>

          <div className="flex items-start gap-3">
            <button
              className="btn btn-outline"
              disabled={isLoading}
              onClick={() => {
                void loadRoom()
              }}
              type="button"
            >
              {isLoading ? '正在刷新……' : '刷新成员'}
            </button>

            {currentSession !== null && (
              <button
                className="btn btn-error"
                disabled={isLeaving}
                onClick={() => {
                  void handleLeaveRoom()
                }}
                type="button"
              >
                {isLeaving ? '正在离开……' : '离开会议'}
              </button>
            )}
          </div>
        </div>

        {currentSession === null && (
          <div className="alert alert-warning mt-6" role="alert">
            <span>
              当前浏览器没有该房间的成员身份。你可以查看房间，但不会发送在线心跳；如需参会，请通过加入会议页面进入。
            </span>
          </div>
        )}

        {heartbeatError !== null && (
          <div className="alert alert-warning mt-6" role="alert">
            <span>在线状态刷新失败：{heartbeatError}</span>
          </div>
        )}

        {errorMessage !== null && roomDetails !== null && (
          <div className="alert alert-error mt-6" role="alert">
            <span>{errorMessage}</span>
          </div>
        )}

        <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <MeetingMediaStage
            canControlMedia={currentSession !== null}
            displayName={
              currentSession?.displayName ?? '未加入会议的访客'
            }
          />

          <aside className="card bg-base-100 shadow-xl">
            <div className="card-body">
              <div className="flex items-center justify-between">
                <h2 className="card-title">参会成员</h2>

                <span className="badge badge-neutral">
                  {roomDetails.members.length} 人
                </span>
              </div>

              {roomDetails.members.length === 0 ? (
                <p className="py-8 text-center text-base-content/60">
                  暂无成员
                </p>
              ) : (
                <ul className="mt-2 space-y-3">
                  {roomDetails.members.map((member) => {
                    const isCurrentMember =
                      currentSession?.memberId === member.id

                    return (
                      <li
                        className="rounded-box border border-base-300 p-3"
                        key={member.id}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate font-medium">
                              {member.display_name}
                              {isCurrentMember ? '（你）' : ''}
                            </p>

                            <p className="mt-1 text-xs text-base-content/60">
                              {member.role === 'host'
                                ? '主持人'
                                : '参会者'}
                            </p>
                          </div>

                          <span
                            className={
                              member.online
                                ? 'badge badge-success'
                                : 'badge badge-ghost'
                            }
                          >
                            {member.online ? '在线' : '离线'}
                          </span>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          </aside>
        </div>
      </section>
    </main>
  )
}
