import { useEffect, useRef } from 'react'

interface RemoteVideoPreviewProps {
  displayName: string
  stream: MediaStream
}

export function RemoteVideoPreview({
  displayName,
  stream,
}: RemoteVideoPreviewProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null)

  useEffect(() => {
    if (videoRef.current !== null) {
      videoRef.current.srcObject = stream
    }
  }, [stream])

  return (
    <div className="overflow-hidden rounded-box bg-neutral text-neutral-content">
      <video
        aria-label={`${displayName}的远端画面`}
        autoPlay
        className="aspect-video w-full bg-black object-cover"
        playsInline
        ref={videoRef}
      />
      <p className="px-3 py-2 text-sm">{displayName}</p>
    </div>
  )
}
