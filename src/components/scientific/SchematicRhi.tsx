import { useMemo } from 'react'
import type { EnvironmentalProfile } from '../../weather/adapters/OpenMeteoAdapter'
import type { LightningObservation, StormTrack } from '../../weather'
import { buildSchematicRhi } from '../../weather/reconstruction/schematicRhi'

interface SchematicRhiProps {
  track: StormTrack | null
  environment: EnvironmentalProfile | null
  lightning?: LightningObservation[]
}

function intensityColor(v: number): string {
  // Cool → warm schematic palette (not a real reflectivity scale)
  if (v >= 0.75) return 'rgba(232, 194, 122, 0.85)'
  if (v >= 0.55) return 'rgba(201, 164, 106, 0.7)'
  if (v >= 0.35) return 'rgba(154, 166, 188, 0.55)'
  return 'rgba(90, 110, 140, 0.4)'
}

export function SchematicRhi({ track, environment, lightning = [] }: SchematicRhiProps) {
  const slice = useMemo(
    () => (track ? buildSchematicRhi({ track, environment, lightning }) : null),
    [track, environment, lightning],
  )

  if (!track) {
    return (
      <div className="schematic-rhi" aria-label="Schematic RHI">
        <h3>Schematic RHI</h3>
        <p className="provenance">Select a derived or case-study track to build a range–height sketch.</p>
      </div>
    )
  }

  if (!slice) {
    return (
      <div className="schematic-rhi" aria-label="Schematic RHI">
        <h3>Schematic RHI</h3>
        <p className="provenance">
          Track <span className="mono">{track.stormId}</span> needs at least two points spanning ~0.5
          km to draw an RHI sketch.
        </p>
      </div>
    )
  }

  const W = 340
  const H = 200
  const padL = 40
  const padR = 16
  const padT = 16
  const padB = 28
  const plotW = W - padL - padR
  const plotH = H - padT - padB
  const maxH = slice.maxHeightKm
  const maxR = Math.max(slice.lengthKm, 1)

  const xOf = (rangeKm: number) => padL + (rangeKm / maxR) * plotW
  const yOf = (heightKm: number) => padT + plotH - (heightKm / maxH) * plotH

  const bandCount = Math.max(2, slice.columns.length - 1)

  return (
    <div className="schematic-rhi" aria-label="Schematic RHI along selected track">
      <h3>Schematic RHI</h3>
      <p className="provenance">
        Range–height sketch for <span className="mono">{slice.stormId}</span> · {slice.lengthKm.toFixed(0)}{' '}
        km path · peak schematic intensity {Math.round(slice.peakIntensity * 100)}%
      </p>
      <svg viewBox={`0 0 ${W} ${H}`} role="img">
        <title>Schematic range-height indicator along selected storm track</title>
        {/* Height guides */}
        {[0, 4, 8, 12].filter((km) => km <= maxH).map((km) => {
          const y = yOf(km)
          return (
            <g key={km}>
              <line x1={padL} x2={W - padR} y1={y} y2={y} className="guide" />
              <text x={8} y={y + 3} className="guide-label">
                {km} km
              </text>
            </g>
          )
        })}
        {/* Ground */}
        <rect
          x={padL}
          y={yOf(0)}
          width={plotW}
          height={H - padB - (yOf(0) - padT) + 2}
          className="ground"
        />
        {/* Schematic echo columns as trapezoid bands */}
        {slice.columns.slice(0, -1).map((c, i) => {
          const n = slice.columns[i + 1]
          const x0 = xOf(c.rangeKm)
          const x1 = xOf(n.rangeKm)
          const intensity = (c.intensity + n.intensity) / 2
          const points = [
            `${x0},${yOf(c.baseKm)}`,
            `${x0},${yOf(c.topKm)}`,
            `${x1},${yOf(n.topKm)}`,
            `${x1},${yOf(n.baseKm)}`,
          ].join(' ')
          return (
            <polygon
              key={`band-${i}`}
              points={points}
              fill={intensityColor(intensity)}
              stroke="rgba(245,248,255,0.12)"
              strokeWidth={1}
            />
          )
        })}
        {/* Track sample ticks */}
        {slice.columns.map((c) => (
          <circle
            key={`tick-${c.rangeKm}`}
            cx={xOf(c.rangeKm)}
            cy={yOf(0) + 4}
            r={2}
            className="rhi-tick"
          />
        ))}
        {/* Lightning marks projected into corridor */}
        {slice.lightningMarks.map((m) => (
          <g key={m.id}>
            <line
              x1={xOf(m.rangeKm)}
              x2={xOf(m.rangeKm)}
              y1={yOf(m.heightKm)}
              y2={yOf(0)}
              className="rhi-bolt"
            />
            <circle
              cx={xOf(m.rangeKm)}
              cy={yOf(m.heightKm)}
              r={m.classification === 'cloud_to_ground' ? 3.5 : 2.5}
              className={
                m.classification === 'cloud_to_ground' ? 'rhi-bolt-cg' : 'rhi-bolt-ic'
              }
            />
          </g>
        ))}
        {/* Axes labels */}
        <text x={padL + plotW / 2} y={H - 6} textAnchor="middle" className="guide-label">
          Along-track range (km) · {bandCount} segments
        </text>
      </svg>
      <p className="provenance">
        <strong>Provenance:</strong> {slice.provenance.summary}
        {slice.lightningMarks.length > 0
          ? ` ${slice.lightningMarks.length} lightning mark(s) projected within a ${25} km corridor.`
          : ''}
      </p>
    </div>
  )
}
