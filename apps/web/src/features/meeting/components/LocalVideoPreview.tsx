import { useEffect, useRef } from 'react'

interface LocalVideoPreviewProps {
  cameraEnabled: boolean
  mirrored: boolean
  stream: MediaStream | null
}

export function LocalVideoPreview({
  cameraEnabled,
  mirrored,
  stream,
}: LocalVideoPreviewProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null)

  useEffect(() => {
    const video = videoRef.current

    if (video === null) {
      return
    }

    video.srcObject = stream

    return () => {
      video.srcObject = null
    }
  }, [cameraEnabled, stream])

  return (
    <div className="relative aspect-video overflow-hidden rounded-box bg-neutral shadow-lg">
      {stream !== null && cameraEnabled ? (
        <video
          ref={videoRef}
          aria-label="本地摄像头预览"
          autoPlay
          className={
            mirrored
              ? 'h-full w-full -scale-x-100 object-cover'
              : 'h-full w-full object-cover'
          }
          muted
          playsInline
        />
      ) : (
        <div className="flex h-full items-center justify-center px-6 text-center text-neutral-content">
          <div>
            <div
              aria-hidden="true"
              className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-neutral-content/10 text-3xl"
            >
              📷
            </div>

            <p className="font-semibold">
              {stream === null ? '尚未启动设备检测' : '摄像头已关闭'}
            </p>

            <p className="mt-2 text-sm text-neutral-content/70">
              启动检测后，本地摄像头画面会显示在这里。
            </p>
          </div>
        </div>
      )}

      {stream !== null && (
        <div className="absolute bottom-3 left-3 rounded-full bg-black/60 px-3 py-1 text-sm text-white">
          本地预览
        </div>
      )}
    </div>
  )
}
