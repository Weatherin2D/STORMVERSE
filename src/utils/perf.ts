export function detectLowPower(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent.toLowerCase()
  const mem = (navigator as any).deviceMemory
  if (mem && mem <= 4) return true
  if (ua.includes('mobile') || ua.includes('tablet')) return true
  const canvas = document.createElement('canvas')
  const gl = canvas.getContext('webgl2') || canvas.getContext('webgl')
  if (!gl) return true
  try {
    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info')
    if (debugInfo) {
      const renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL).toLowerCase()
      if (renderer.includes('intel') && !renderer.includes('arc')) return true
      if (renderer.includes('adreno') && renderer.includes('6')) return true
    }
  } catch {
    // ignore
  }
  return false
}

