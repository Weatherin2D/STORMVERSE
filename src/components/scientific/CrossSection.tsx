import type { EnvironmentalProfile } from '../../weather/adapters/OpenMeteoAdapter'
import type { StormTrack } from '../../weather'

interface CrossSectionProps {
  environment: EnvironmentalProfile | null
  selectedTrack: StormTrack | null
  radarIntensityHint: number
}

/**
 * Schematic vertical cross-section for scientific exploration.
 * Geometry is a reconstruction aid informed by model CAPE / derived cell intensity —
 * not a measured radar RHI volume.
 */
export function CrossSection({
  environment,
  selectedTrack,
  radarIntensityHint,
}: CrossSectionProps) {
  const cape = environment?.capeJkg ?? 0
  const cin = Math.abs(environment?.cinJkg ?? 0)
  const trackConf = selectedTrack?.confidence ?? 0
  const intensity = Math.max(radarIntensityHint, trackConf)

  // Map env + intensity into schematic cloud geometry (0–1)
  const towerH = 0.35 + Math.min(0.5, cape / 2000) * 0.45 + intensity * 0.15
  const anvilW = 0.35 + Math.min(0.4, cape / 1800) * 0.35 + intensity * 0.2
  const baseH = 0.12 + Math.min(0.08, cin / 200)
  const precip = Math.min(1, (environment?.precipitationMm ?? 0) / 5 + intensity * 0.5)

  const topY = 180 - towerH * 140
  const anvilY = topY + 8
  const baseY = 180 - baseH * 90

  return (
    <div className="cross-section" aria-label="Schematic storm cross-section">
      <h3>Vertical structure (schematic)</h3>
      <svg viewBox="0 0 320 200" role="img" aria-hidden="false">
        <title>Schematic cumulonimbus cross-section</title>
        {/* Altitude guides */}
        {[0, 5, 10, 15].map((km) => {
          const y = 180 - (km / 16) * 150
          return (
            <g key={km}>
              <line x1="36" x2="300" y1={y} y2={y} className="guide" />
              <text x="8" y={y + 3} className="guide-label">
                {km} km
              </text>
            </g>
          )
        })}
        {/* Ground */}
        <rect x="36" y="180" width="264" height="8" className="ground" />
        {/* Rain shafts */}
        {precip > 0.15 && (
          <g className="precip">
            {Array.from({ length: Math.round(4 + precip * 6) }, (_, i) => {
              const x = 140 + i * 8 - precip * 20
              return <line key={i} x1={x} x2={x - 2} y1={baseY} y2="180" />
            })}
          </g>
        )}
        {/* Cloud body */}
        <ellipse
          cx="160"
          cy={(topY + baseY) / 2}
          rx={28 + intensity * 18}
          ry={(baseY - topY) / 2}
          className="cloud-core"
        />
        {/* Anvil */}
        <ellipse
          cx={160 + anvilW * 30}
          cy={anvilY}
          rx={40 + anvilW * 70}
          ry={12 + intensity * 8}
          className="cloud-anvil"
        />
        {/* Base */}
        <ellipse cx="155" cy={baseY} rx={36 + intensity * 20} ry={10} className="cloud-base" />
      </svg>
      <p className="provenance">
        <strong>Provenance:</strong> schematic reconstruction shaped by Open-Meteo CAPE/CIN
        {environment?.capeJkg != null ? ` (CAPE ${Math.round(environment.capeJkg)} J/kg)` : ''}
        {selectedTrack ? ` and derived cell confidence ${(trackConf * 100).toFixed(0)}%` : ''}.
        Not a radar RHI or measured updraft profile.
      </p>
    </div>
  )
}
