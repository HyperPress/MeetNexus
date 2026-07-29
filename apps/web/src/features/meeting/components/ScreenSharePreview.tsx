import { useEffect, useRef } from 'react'
import type { ScreenShareInfo } from '../../../lib/media/localMedia'

interface ScreenSharePreviewProps {
  info: ScreenShareInfo | null
  stream: MediaStream | null
}

function formatResolution(info: ScreenShareInfo): string {
  if (info.width === null || info.height === null) {
    return '浏览器未提供'
  }

  return `${info.width} × ${info.height}`
}

function formatFrameRate(info: ScreenShareInfo): string {
  if (info.frameRate === null) {
    return '浏览器未提供'
  }

  return `${Math.round(info.frameRate)} 帧/秒`
}

export function ScreenSharePreview({
  info,
  stream,
}: ScreenSharePreviewProps) {
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
  }, [stream])

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(16rem,1fr)]">
      <div className="aspect-video overflow-hidden rounded-box bg-neutral">
        {stream === null ? (
          <div className="flex h-full items-center justify-center px-6 text-center text-neutral-content">
            <div>
              <div aria-hidden="true" className="mb-3 text-4xl">
                🖥️
              </div>
              <p className="font-semibold">尚未开始屏幕分享</p>
              <p className="mt-2 text-sm text-neutral-content/70">
                启动后可以在这里预览所选屏幕或窗口。
              </p>
            </div>
          </div>
        ) : (
          <video
            ref={videoRef}
            aria-label="屏幕分享预览"
            autoPlay
            className="h-full w-full object-contain"
            muted
            playsInline
          />
        )}
      </div>

      <div>
        <h3 className="font-semibold">捕获信息</h3>

        {info === null ? (
          <p className="mt-3 text-sm text-base-content/60">
            选择共享内容后，这里会显示浏览器返回的屏幕信息。
          </p>
        ) : (
          <dl className="mt-3 space-y-3 text-sm">
            <div>
              <dt className="text-base-content/60">共享来源</dt>
              <dd className="font-medium">{info.displaySurface}</dd>
            </div>

            <div>
              <dt className="text-base-content/60">分辨率</dt>
              <dd className="font-medium">{formatResolution(info)}</dd>
            </div>

            <div>
              <dt className="text-base-content/60">帧率</dt>
              <dd className="font-medium">{formatFrameRate(info)}</dd>
            </div>

            <div>
              <dt className="text-base-content/60">轨道名称</dt>
              <dd className="break-all font-medium">{info.label}</dd>
            </div>
          </dl>
        )}
      </div>
    </div>
  )
}
