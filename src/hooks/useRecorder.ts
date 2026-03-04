import { useState, useRef, useCallback } from 'react'
import { toBlob } from 'html-to-image'

export interface RecorderControls {
  isRecording: boolean
  start: () => void
  stop: () => void
}

export function useRecorder(getTarget: () => HTMLElement | null, fps = 4): RecorderControls {
  const [isRecording, setIsRecording] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const captureFrame = useCallback(async () => {
    const target = getTarget()
    if (!target || !canvasRef.current) return

    try {
      const blob = await toBlob(target, {
        cacheBust: true,
        filter: (node: HTMLElement) => {
          // Skip Leaflet attribution to reduce noise
          if (node.classList?.contains('leaflet-control-attribution')) return false
          return true
        },
      })
      if (!blob) return

      const img = new Image()
      const url = URL.createObjectURL(blob)
      img.onload = () => {
        const canvas = canvasRef.current!
        const ctx = canvas.getContext('2d')!
        canvas.width = img.width
        canvas.height = img.height
        ctx.drawImage(img, 0, 0)
        URL.revokeObjectURL(url)
      }
      img.src = url
    } catch {
      // Ignore frame capture errors (CORS etc.)
    }
  }, [getTarget])

  const start = useCallback(() => {
    const target = getTarget()
    if (!target) return

    const canvas = document.createElement('canvas')
    canvas.width = target.offsetWidth
    canvas.height = target.offsetHeight
    canvasRef.current = canvas

    const stream = canvas.captureStream(0)
    const recorder = new MediaRecorder(stream, {
      mimeType: MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
        ? 'video/webm;codecs=vp9'
        : 'video/webm',
    })

    chunksRef.current = []
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data)
    }

    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: 'video/webm' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `strava-recording-${Date.now()}.webm`
      a.click()
      URL.revokeObjectURL(url)
      chunksRef.current = []
    }

    recorderRef.current = recorder
    recorder.start(100)
    setIsRecording(true)

    // Capture frames at interval
    const captureAndRequestFrame = async () => {
      await captureFrame()
      // Request a frame on the captureStream so the recorder gets data
      const videoTrack = stream.getVideoTracks()[0]
      if (videoTrack && 'requestFrame' in videoTrack) {
        ;(videoTrack as any).requestFrame()
      }
    }

    // Initial frame
    captureAndRequestFrame()
    intervalRef.current = setInterval(captureAndRequestFrame, 1000 / fps)
  }, [getTarget, captureFrame, fps])

  const stop = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop()
    }
    recorderRef.current = null
    canvasRef.current = null
    setIsRecording(false)
  }, [])

  return { isRecording, start, stop }
}
