import { useEffect, useRef, useState } from 'react'
import { getApiErrorMessage } from '../../../lib/api/httpClient'
import { loadDashRecording } from '../../../lib/media/dashPlayback'
import type { Recording } from '../../../schemas/room'
import { getRoomRecordingPlaybackFile } from '../api/roomApi'

interface RecordingPlayerProps {
  recording: Recording
  roomId: string
  sessionToken: string
}

export function RecordingPlayer({
  recording,
  roomId,
  sessionToken,
}: RecordingPlayerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const cleanupRef = useRef<(() => void) | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isLoaded, setIsLoaded] = useState(false)

  useEffect(() => {
    return () => {
      cleanupRef.current?.()
      cleanupRef.current = null
    }
  }, [])

  async function loadRecording() {
    const video = videoRef.current
    if (video === null || isLoading) {
      return
    }

    cleanupRef.current?.()
    cleanupRef.current = null
    setErrorMessage(null)
    setIsLoaded(false)
    setIsLoading(true)
    try {
      cleanupRef.current = await loadDashRecording(
        video,
        async (fileName) => {
          const response = await getRoomRecordingPlaybackFile(
            roomId,
            recording.id,
            fileName,
            sessionToken,
          )
          return response.body
        },
      )
      setIsLoaded(true)
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error))
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="mt-3">
      <button
        className="btn btn-outline btn-xs"
        disabled={isLoading}
        onClick={() => {
          void loadRecording()
        }}
        type="button"
      >
        {isLoading ? '正在加载回放…' : isLoaded ? '重新加载回放' : '播放回放'}
      </button>

      {errorMessage !== null && (
        <div className="alert alert-error mt-2 py-2 text-xs" role="alert">
          <span>{errorMessage}</span>
        </div>
      )}

      <video
        aria-label="录制回放画面"
        className={isLoaded ? 'mt-2 w-full rounded-box bg-neutral' : 'hidden'}
        controls
        playsInline
        ref={videoRef}
      />
      {isLoaded && (
        <p className="mt-1 text-xs text-base-content/60">
          回放已加载，点击播放器控件开始播放。
        </p>
      )}
    </div>
  )
}
