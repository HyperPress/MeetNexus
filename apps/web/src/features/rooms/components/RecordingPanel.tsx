import { useCallback, useEffect, useState } from 'react'
import { getApiErrorMessage } from '../../../lib/api/httpClient'
import type { Recording, RoomMember } from '../../../schemas/room'
import {
  listRoomRecordings,
  startRoomMemberRecording,
  stopRoomRecording,
} from '../api/roomApi'
import { RecordingPlayer } from './RecordingPlayer'

interface RecordingPanelProps {
  canManage: boolean
  members: RoomMember[]
  roomId: string
  sessionToken: string | null
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

export function RecordingPanel({
  canManage,
  members,
  roomId,
  sessionToken,
}: RecordingPanelProps) {
  const [recordings, setRecordings] = useState<Recording[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [pendingMemberId, setPendingMemberId] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const loadRecordings = useCallback(async () => {
    if (sessionToken === null) {
      setRecordings([])
      return
    }

    setIsLoading(true)
    setErrorMessage(null)
    try {
      const response = await listRoomRecordings(roomId, sessionToken)
      setRecordings(response.data)
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error))
    } finally {
      setIsLoading(false)
    }
  }, [roomId, sessionToken])

  useEffect(() => {
    void loadRecordings()
  }, [loadRecordings])

  async function startRecording(memberId: string) {
    if (sessionToken === null || pendingMemberId !== null) {
      return
    }

    setPendingMemberId(memberId)
    setErrorMessage(null)
    try {
      await startRoomMemberRecording(roomId, memberId, sessionToken)
      await loadRecordings()
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error))
    } finally {
      setPendingMemberId(null)
    }
  }

  async function stopRecording(recording: Recording) {
    if (sessionToken === null || pendingMemberId !== null) {
      return
    }

    setPendingMemberId(recording.member_id)
    setErrorMessage(null)
    try {
      await stopRoomRecording(roomId, recording.id, sessionToken)
      await loadRecordings()
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error))
    } finally {
      setPendingMemberId(null)
    }
  }

  if (sessionToken === null) {
    return null
  }

  return (
    <section className="mt-6 border-t border-base-300 pt-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-semibold">录制</h2>
        <button
          className="btn btn-ghost btn-xs"
          disabled={isLoading || pendingMemberId !== null}
          onClick={() => {
            void loadRecordings()
          }}
          type="button"
        >
          {isLoading ? '正在刷新…' : '刷新录制'}
        </button>
      </div>

      {!canManage && (
        <p className="mt-2 text-xs text-base-content/60">
          仅主持人可以开始或停止录制。
        </p>
      )}

      {errorMessage !== null && (
        <div className="alert alert-error mt-3 py-2 text-sm" role="alert">
          <span>{errorMessage}</span>
        </div>
      )}

      {canManage && (
        <ul className="mt-3 space-y-2" aria-label="录制控制">
          {members.map((member) => {
            const activeRecording = recordings.find(
              (recording) =>
                recording.member_id === member.id &&
                recording.state === 'recording',
            )
            const isPending = pendingMemberId === member.id

            return (
              <li
                className="flex items-center justify-between gap-2 text-sm"
                key={member.id}
              >
                <span className="truncate">{member.display_name}</span>
                {activeRecording === undefined ? (
                  <button
                    className="btn btn-outline btn-xs"
                    disabled={pendingMemberId !== null}
                    onClick={() => {
                      void startRecording(member.id)
                    }}
                    type="button"
                  >
                    {isPending ? '处理中…' : '开始录制'}
                  </button>
                ) : (
                  <button
                    className="btn btn-warning btn-xs"
                    disabled={pendingMemberId !== null}
                    onClick={() => {
                      void stopRecording(activeRecording)
                    }}
                    type="button"
                  >
                    {isPending ? '处理中…' : '停止录制'}
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      )}

      <div aria-live="polite" className="mt-3 space-y-2">
        {recordings.length === 0 ? (
          <p className="text-xs text-base-content/60">暂无录制。</p>
        ) : (
          recordings.map((recording) => {
            const member = members.find(
              (item) => item.id === recording.member_id,
            )
            return (
              <div
                className="rounded-box bg-base-200 p-2 text-xs"
                key={recording.id}
              >
                <p className="font-medium">
                  {member?.display_name ?? '已离开的成员'}
                </p>
                <p className="mt-1 text-base-content/60">
                  {recording.state === 'recording'
                    ? '录制中'
                    : `已停止：${formatDateTime(recording.stopped_at ?? recording.started_at)}`}
                </p>
                {recording.state === 'stopped' && (
                  <RecordingPlayer
                    recording={recording}
                    roomId={roomId}
                    sessionToken={sessionToken}
                  />
                )}
              </div>
            )
          })
        )}
      </div>
    </section>
  )
}
