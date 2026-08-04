export interface DashTrack {
  initialization: string
  mediaSegments: string[]
  mimeType: string
}

const MAX_SEGMENTS_PER_TRACK = 10_000

function parseSegmentName(value: string): string {
  if (
    value.length === 0 ||
    value.includes('/') ||
    value.includes('\\') ||
    value === '.' ||
    value === '..'
  ) {
    throw new Error('DASH 清单包含不支持的文件路径。')
  }

  return value
}

function expandSegmentTemplate(
  template: Element,
): { initialization: string; mediaSegments: string[] } {
  const initialization = parseSegmentName(
    template.getAttribute('initialization') ?? '',
  )
  const media = template.getAttribute('media') ?? ''
  const startNumber = Number(template.getAttribute('startNumber') ?? '1')
  const timeline = template.getElementsByTagName('S')
  const mediaSegments: string[] = []
  let number = startNumber

  for (const segment of timeline) {
    const repeats = Number(segment.getAttribute('r') ?? '0')
    if (!Number.isInteger(repeats) || repeats < 0) {
      throw new Error('DASH 清单包含不支持的分片重复规则。')
    }
    for (let index = 0; index <= repeats; index += 1) {
      const fileName = media.replace(
        /\$Number(?:(%0)(\d+)d)?\$/,
        (_, zero: string | undefined, width: string | undefined) => {
          if (zero === undefined || width === undefined) {
            return String(number)
          }
          return String(number).padStart(Number(width), '0')
        },
      )
      mediaSegments.push(parseSegmentName(fileName))
      number += 1
      if (mediaSegments.length > MAX_SEGMENTS_PER_TRACK) {
        throw new Error('录制分片数量超过浏览器回放上限。')
      }
    }
  }

  if (mediaSegments.length === 0) {
    throw new Error('DASH 清单未包含可播放的媒体分片。')
  }

  return { initialization, mediaSegments }
}

export function parseDashManifest(manifest: string): DashTrack[] {
  const document = new DOMParser().parseFromString(manifest, 'application/xml')
  if (document.getElementsByTagName('parsererror').length > 0) {
    throw new Error('DASH 清单格式无效。')
  }

  const tracks: DashTrack[] = []
  for (const adaptationSet of document.getElementsByTagName('AdaptationSet')) {
    const representation = adaptationSet.getElementsByTagName('Representation')[0]
    if (representation === undefined) {
      continue
    }
    const template = representation.getElementsByTagName('SegmentTemplate')[0]
    if (template === undefined) {
      continue
    }
    const mimeType = representation.getAttribute('mimeType')
    const codecs = representation.getAttribute('codecs')
    if (mimeType === null || codecs === null) {
      throw new Error('DASH 清单缺少媒体编码信息。')
    }
    const segments = expandSegmentTemplate(template)
    tracks.push({
      ...segments,
      mimeType: `${mimeType}; codecs="${codecs}"`,
    })
  }

  if (tracks.length === 0) {
    throw new Error('DASH 清单未包含受支持的媒体轨道。')
  }

  return tracks
}

function appendBuffer(
  sourceBuffer: SourceBuffer,
  bytes: ArrayBuffer,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const complete = () => {
      sourceBuffer.removeEventListener('error', fail)
      resolve()
    }
    const fail = () => {
      sourceBuffer.removeEventListener('updateend', complete)
      reject(new Error('浏览器无法追加录制媒体分片。'))
    }
    sourceBuffer.addEventListener('updateend', complete, { once: true })
    sourceBuffer.addEventListener('error', fail, { once: true })
    try {
      sourceBuffer.appendBuffer(bytes)
    } catch (error) {
      sourceBuffer.removeEventListener('updateend', complete)
      sourceBuffer.removeEventListener('error', fail)
      reject(error)
    }
  })
}

function waitForSourceOpen(mediaSource: MediaSource): Promise<void> {
  if (mediaSource.readyState === 'open') {
    return Promise.resolve()
  }

  return new Promise((resolve, reject) => {
    mediaSource.addEventListener('sourceopen', () => resolve(), {
      once: true,
    })
    mediaSource.addEventListener(
      'sourceended',
      () => reject(new Error('浏览器未能打开媒体回放缓冲区。')),
      { once: true },
    )
  })
}

export async function loadDashRecording(
  video: HTMLVideoElement,
  fetchFile: (fileName: string) => Promise<ArrayBuffer>,
): Promise<() => void> {
  if (!('MediaSource' in window)) {
    throw new Error('当前浏览器不支持录制回放。')
  }

  const manifestBytes = await fetchFile('manifest.mpd')
  const manifest = new TextDecoder().decode(manifestBytes)
  const tracks = parseDashManifest(manifest)
  for (const track of tracks) {
    if (!MediaSource.isTypeSupported(track.mimeType)) {
      throw new Error(`当前浏览器不支持 ${track.mimeType} 录制轨道。`)
    }
  }

  const mediaSource = new MediaSource()
  const objectUrl = URL.createObjectURL(mediaSource)
  video.src = objectUrl
  try {
    await waitForSourceOpen(mediaSource)
    for (const track of tracks) {
      const sourceBuffer = mediaSource.addSourceBuffer(track.mimeType)
      await appendBuffer(sourceBuffer, await fetchFile(track.initialization))
      for (const fileName of track.mediaSegments) {
        await appendBuffer(sourceBuffer, await fetchFile(fileName))
      }
    }
    if (mediaSource.readyState === 'open') {
      mediaSource.endOfStream()
    }
  } catch (error) {
    URL.revokeObjectURL(objectUrl)
    video.removeAttribute('src')
    video.load()
    throw error
  }

  return () => {
    video.pause()
    video.removeAttribute('src')
    video.load()
    URL.revokeObjectURL(objectUrl)
  }
}
