import { useCallback, useEffect, useMemo, useState } from 'react'
import { DEFAULT_FOCUS } from '../config/app'
import { RAINVIEWER, TRUTH_CELLS_FEED } from '../config/weather'
import {
  australianWeatherProvider,
  createLightningProviderFromEnv,
  createTruthCellsProviderFromEnv,
  fetchCloudCoverGrid,
  fetchOpenMeteoEnvironment,
  matchTracksToTruth,
  sampleLightningUrl,
  sampleTruthCellsUrl,
  samplesToCloudFieldPoints,
  scoreTracks,
  summarizeTrackSkills,
  summarizeTrackTruth,
  truthCellsFromTracks,
  type CloudFieldPoint,
  type LightningObservation,
  type RadarObservation,
  type SatelliteObservation,
  type StormTrack,
  type TrackSkillScore,
  type TrackSkillSummary,
  type TrackTruthMatch,
  type TrackTruthSummary,
  type TruthCell,
  type WeatherObservationMeta,
} from '../weather'
import type { EnvironmentalProfile } from '../weather/adapters/OpenMeteoAdapter'
import { deriveTracksFromRadarFrames } from '../weather/reconstruction/deriveTracks'
import {
  fetchCaseStudyCatalog,
  fetchCaseStudyFromCatalog,
  findCatalogEntry,
  type CaseStudyCatalog,
  type CaseStudyCatalogEntry,
} from '../weather/caseStudy/catalog'
import {
  attachCaseStudyAttestation,
  parseCaseStudyPackFromText,
} from '../weather/caseStudy/parseCaseStudy'
import {
  deleteCaseStudyFromShelf,
  downloadCaseStudyShelfBackup,
  listCaseStudyShelf,
  loadCaseStudyFromShelf,
  restoreCaseStudyShelfBackup,
  saveCaseStudyToShelf,
  type CaseStudyShelfListItem,
} from '../weather/caseStudy/importShelf'
import type { CaseStudyPack } from '../weather/caseStudy/types'

export interface LiveWeatherState {
  loading: boolean
  tracksLoading: boolean
  error: string | null
  availability: WeatherObservationMeta[]
  radarFrames: RadarObservation[]
  satelliteFrames: SatelliteObservation[]
  environment: EnvironmentalProfile | null
  tracks: StormTrack[]
  trackSkills: TrackSkillScore[]
  trackSkillSummary: TrackSkillSummary
  lightningEvents: LightningObservation[]
  lightningConfigured: boolean
  lightningLoading: boolean
  lightningError: string | null
  lightningSourceLabel: string | null
  loadLightningSample: () => void
  clearLightningFeed: () => void
  truthCells: TruthCell[]
  truthConfigured: boolean
  truthLoading: boolean
  truthError: string | null
  truthSourceLabel: string | null
  trackTruthMatches: TrackTruthMatch[]
  trackTruthSummary: TrackTruthSummary
  loadTruthSample: () => void
  loadTruthFromTracks: () => void
  clearTruthCatalogue: () => void
  caseStudy: CaseStudyPack | null
  caseStudyLoading: boolean
  caseStudyError: string | null
  caseStudyCatalog: CaseStudyCatalog | null
  caseStudyCatalogLoading: boolean
  caseStudyCatalogError: string | null
  loadCaseStudyCatalog: () => void
  loadCaseStudyById: (id: string) => void
  /** @deprecated Prefer loadCaseStudyById — loads the first catalog entry / NSW pack. */
  loadCaseStudySample: () => void
  importCaseStudyText: (
    text: string,
    opts: { licenceNote: string; sourceFilename?: string },
  ) => { ok: boolean; message: string }
  caseStudyShelf: CaseStudyShelfListItem[]
  refreshCaseStudyShelf: () => void
  loadCaseStudyFromShelfId: (shelfId: string) => { ok: boolean; message: string }
  deleteCaseStudyShelfEntry: (shelfId: string) => { ok: boolean; message: string }
  backupCaseStudyShelf: () => { ok: boolean; message: string }
  restoreCaseStudyShelfText: (
    text: string,
    opts: { licenceNote: string; sourceFilename?: string; replace?: boolean },
  ) => { ok: boolean; message: string }
  cloudField: CloudFieldPoint[]
  cloudFieldLoading: boolean
  cloudFieldError: string | null
  clearCaseStudy: () => void
  refresh: () => void
}

export function useLiveWeather(enableTracks: boolean): LiveWeatherState {
  const lightningProvider = useMemo(() => createLightningProviderFromEnv(), [])
  const truthProvider = useMemo(() => createTruthCellsProviderFromEnv(), [])
  const [loading, setLoading] = useState(true)
  const [tracksLoading, setTracksLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [availability, setAvailability] = useState<WeatherObservationMeta[]>([])
  const [radarFrames, setRadarFrames] = useState<RadarObservation[]>([])
  const [satelliteFrames, setSatelliteFrames] = useState<SatelliteObservation[]>([])
  const [environment, setEnvironment] = useState<EnvironmentalProfile | null>(null)
  const [derivedTracks, setDerivedTracks] = useState<StormTrack[]>([])
  const [lightningEvents, setLightningEvents] = useState<LightningObservation[]>([])
  const [lightningLoading, setLightningLoading] = useState(false)
  const [lightningError, setLightningError] = useState<string | null>(null)
  const [lightningSourceLabel, setLightningSourceLabel] = useState<string | null>(() =>
    lightningProvider.getUrl(),
  )
  const [truthCells, setTruthCells] = useState<TruthCell[]>([])
  const [truthLoading, setTruthLoading] = useState(false)
  const [truthError, setTruthError] = useState<string | null>(null)
  const [truthSourceLabel, setTruthSourceLabel] = useState<string | null>(() =>
    truthProvider.getUrl(),
  )
  const [caseStudy, setCaseStudy] = useState<CaseStudyPack | null>(null)
  const [caseStudyLoading, setCaseStudyLoading] = useState(false)
  const [caseStudyError, setCaseStudyError] = useState<string | null>(null)
  const [caseStudyCatalog, setCaseStudyCatalog] = useState<CaseStudyCatalog | null>(null)
  const [caseStudyCatalogLoading, setCaseStudyCatalogLoading] = useState(false)
  const [caseStudyCatalogError, setCaseStudyCatalogError] = useState<string | null>(null)
  const [caseStudyShelf, setCaseStudyShelf] = useState<CaseStudyShelfListItem[]>(() =>
    listCaseStudyShelf(),
  )
  const [cloudField, setCloudField] = useState<CloudFieldPoint[]>([])
  const [cloudFieldLoading, setCloudFieldLoading] = useState(false)
  const [cloudFieldError, setCloudFieldError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)
  const [lightningTick, setLightningTick] = useState(0)
  const [truthTick, setTruthTick] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    let cancelled = false

    ;(async () => {
      setLoading(true)
      try {
        const focusLat = caseStudy?.focus.latitude ?? DEFAULT_FOCUS.envLatitude
        const focusLon = caseStudy?.focus.longitude ?? DEFAULT_FOCUS.envLongitude
        const [avail, radar, satellite, env, lghtMeta] = await Promise.all([
          australianWeatherProvider.getAvailability(),
          australianWeatherProvider.getRadar({}),
          australianWeatherProvider.getSatellite({}),
          fetchOpenMeteoEnvironment(focusLat, focusLon, controller.signal),
          lightningProvider.getAvailability(controller.signal),
        ])
        if (cancelled) return
        const radarOk = radar.filter((f) => f.available && f.tileUrlTemplate)
        setAvailability([...avail.filter((a) => a.productType !== 'lightning_event'), lghtMeta])
        setRadarFrames(radarOk)
        setSatelliteFrames(satellite.filter((f) => f.available && f.tileUrlTemplate))
        setEnvironment(env)
        setError(null)
      } catch (err) {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'Failed to load live weather')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [tick, lightningProvider, lightningTick, caseStudy?.focus.latitude, caseStudy?.focus.longitude])

  useEffect(() => {
    const controller = new AbortController()
    let cancelled = false
    setCloudFieldLoading(true)
    setCloudFieldError(null)
    fetchCloudCoverGrid(controller.signal)
      .then((samples) => {
        if (cancelled) return
        setCloudField(samplesToCloudFieldPoints(samples))
        setCloudFieldLoading(false)
      })
      .catch((err) => {
        if (cancelled) return
        setCloudField([])
        setCloudFieldError(err instanceof Error ? err.message : 'Cloud cover grid failed')
        setCloudFieldLoading(false)
      })
    return () => {
      cancelled = true
      controller.abort()
    }
  }, [tick])

  useEffect(() => {
    if (!enableTracks) {
      setDerivedTracks([])
      setTracksLoading(false)
      return
    }
    if (radarFrames.length < 2) return

    const controller = new AbortController()
    let cancelled = false
    setTracksLoading(true)

    deriveTracksFromRadarFrames(radarFrames, australianWeatherProvider.id, {
      frameLimit: 4,
      signal: controller.signal,
    })
      .then((derived) => {
        if (cancelled) return
        setDerivedTracks(derived)
        setAvailability((prev) => {
          const without = prev.filter((p) => p.id !== 'aus-storm-track')
          if (derived.length === 0) {
            return [
              ...without,
              {
                id: 'aus-storm-track',
                productType: 'storm_track',
                sourceId: australianWeatherProvider.id,
                observedAt: new Date().toISOString(),
                available: false,
                provenance: {
                  kind: 'derived',
                  summary:
                    'No multi-frame cell links found in the latest mosaics (or precip was too sparse).',
                  sourceId: australianWeatherProvider.id,
                },
              },
            ]
          }
          return [
            ...without,
            {
              id: 'aus-storm-track',
              productType: 'storm_track',
              sourceId: australianWeatherProvider.id,
              observedAt: derived[0].observedAt,
              available: true,
              provenance: {
                kind: 'derived',
                summary: `Derived ${derived.length} heuristic cell track(s) from RainViewer mosaics.`,
                sourceId: australianWeatherProvider.id,
              },
            },
          ]
        })
      })
      .catch((err) => {
        if (cancelled) return
        console.warn('Cell track derivation failed', err)
        setDerivedTracks([])
      })
      .finally(() => {
        if (!cancelled) setTracksLoading(false)
      })

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [enableTracks, radarFrames])

  useEffect(() => {
    const id = window.setInterval(() => setTick((n) => n + 1), RAINVIEWER.refreshMs)
    return () => window.clearInterval(id)
  }, [])

  useEffect(() => {
    // Case-study pack owns lightning/truth while active.
    if (caseStudy) return
    if (!lightningProvider.configured()) {
      setLightningEvents([])
      setLightningError(null)
      setLightningLoading(false)
      setLightningSourceLabel(null)
      return
    }
    const controller = new AbortController()
    let cancelled = false
    setLightningLoading(true)
    ;(async () => {
      try {
        const events = await lightningProvider.getLightning({}, controller.signal)
        if (cancelled) return
        setLightningEvents(events)
        setLightningError(null)
        setLightningSourceLabel(lightningProvider.getUrl())
      } catch (err) {
        if (cancelled) return
        setLightningEvents([])
        setLightningError(err instanceof Error ? err.message : 'Lightning feed failed')
      } finally {
        if (!cancelled) setLightningLoading(false)
      }
    })()
    return () => {
      cancelled = true
      controller.abort()
    }
  }, [lightningProvider, lightningTick, caseStudy])

  useEffect(() => {
    if (caseStudy) return
    if (!truthProvider.configured()) {
      setTruthCells([])
      setTruthError(null)
      setTruthLoading(false)
      setTruthSourceLabel(null)
      return
    }
    const controller = new AbortController()
    let cancelled = false
    setTruthLoading(true)
    ;(async () => {
      try {
        const cells = await truthProvider.getTruthCells(controller.signal)
        if (cancelled) return
        setTruthCells(cells)
        setTruthError(null)
        setTruthSourceLabel(truthProvider.getUrl())
      } catch (err) {
        if (cancelled) return
        setTruthCells([])
        setTruthError(err instanceof Error ? err.message : 'Truth catalogue failed')
      } finally {
        if (!cancelled) setTruthLoading(false)
      }
    })()
    return () => {
      cancelled = true
      controller.abort()
    }
  }, [truthProvider, truthTick, caseStudy])

  const clearCaseStudy = useCallback(() => {
    setCaseStudy(null)
    setCaseStudyError(null)
    setCaseStudyLoading(false)
    setLightningTick((n) => n + 1)
    setTruthTick((n) => n + 1)
  }, [])

  const applyCaseStudyPack = useCallback((pack: CaseStudyPack) => {
    setCaseStudy(pack)
    setLightningEvents(pack.lightning)
    setLightningError(null)
    setLightningSourceLabel(`case study · ${pack.id}`)
    setLightningLoading(false)
    setTruthCells(pack.truthCells)
    setTruthError(null)
    setTruthSourceLabel(`case study · ${pack.id}`)
    setTruthLoading(false)
    setCaseStudyLoading(false)
    setCaseStudyError(null)
  }, [])

  const loadCaseStudyCatalog = useCallback(() => {
    const controller = new AbortController()
    setCaseStudyCatalogLoading(true)
    setCaseStudyCatalogError(null)
    fetchCaseStudyCatalog(controller.signal)
      .then((catalog) => {
        setCaseStudyCatalog(catalog)
        setCaseStudyCatalogLoading(false)
      })
      .catch((err) => {
        setCaseStudyCatalog(null)
        setCaseStudyCatalogError(err instanceof Error ? err.message : 'Catalog failed')
        setCaseStudyCatalogLoading(false)
      })
  }, [])

  useEffect(() => {
    loadCaseStudyCatalog()
  }, [loadCaseStudyCatalog])

  const loadCaseStudyEntry = useCallback(
    (entry: CaseStudyCatalogEntry) => {
      setCaseStudyLoading(true)
      setCaseStudyError(null)
      // Detach URL feeds so case-study sensors are not overwritten.
      lightningProvider.setUrl(null)
      truthProvider.setUrl(null)
      fetchCaseStudyFromCatalog(entry)
        .then(applyCaseStudyPack)
        .catch((err) => {
          setCaseStudy(null)
          setCaseStudyError(err instanceof Error ? err.message : 'Case study failed')
          setCaseStudyLoading(false)
        })
    },
    [lightningProvider, truthProvider, applyCaseStudyPack],
  )

  const loadCaseStudyById = useCallback(
    (id: string) => {
      const run = async () => {
        let catalog = caseStudyCatalog
        if (!catalog) {
          setCaseStudyCatalogLoading(true)
          try {
            catalog = await fetchCaseStudyCatalog()
            setCaseStudyCatalog(catalog)
            setCaseStudyCatalogError(null)
          } catch (err) {
            setCaseStudyCatalogError(err instanceof Error ? err.message : 'Catalog failed')
            setCaseStudyError('Case study catalog unavailable')
            setCaseStudyCatalogLoading(false)
            return
          } finally {
            setCaseStudyCatalogLoading(false)
          }
        }
        const entry = findCatalogEntry(catalog, id)
        if (!entry) {
          setCaseStudyError(`Unknown case study id: ${id}`)
          return
        }
        loadCaseStudyEntry(entry)
      }
      void run()
    },
    [caseStudyCatalog, loadCaseStudyEntry],
  )

  const loadCaseStudySample = useCallback(() => {
    if (caseStudyCatalog?.entries[0]) {
      loadCaseStudyEntry(caseStudyCatalog.entries[0])
      return
    }
    loadCaseStudyById('nsw-corridor-example-01')
  }, [caseStudyCatalog, loadCaseStudyEntry, loadCaseStudyById])

  const refreshCaseStudyShelf = useCallback(() => {
    setCaseStudyShelf(listCaseStudyShelf())
  }, [])

  const importCaseStudyText = useCallback(
    (text: string, opts: { licenceNote: string; sourceFilename?: string }) => {
      try {
        const parsed = parseCaseStudyPackFromText(text, opts.sourceFilename)
        const attested = attachCaseStudyAttestation(parsed, opts)
        lightningProvider.setUrl(null)
        truthProvider.setUrl(null)
        applyCaseStudyPack(attested)
        const shelved = saveCaseStudyToShelf(attested)
        refreshCaseStudyShelf()
        return {
          ok: true,
          message: shelved.ok
            ? `Imported “${attested.title}” · ${shelved.message}`
            : `Imported “${attested.title}” with attestation (${shelved.message})`,
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Case study import failed'
        setCaseStudyError(message)
        return { ok: false, message }
      }
    },
    [lightningProvider, truthProvider, applyCaseStudyPack, refreshCaseStudyShelf],
  )

  const loadCaseStudyFromShelfId = useCallback(
    (shelfId: string) => {
      const pack = loadCaseStudyFromShelf(shelfId)
      if (!pack) {
        const message = 'Shelved case study not found or invalid'
        setCaseStudyError(message)
        refreshCaseStudyShelf()
        return { ok: false, message }
      }
      lightningProvider.setUrl(null)
      truthProvider.setUrl(null)
      applyCaseStudyPack(pack)
      return { ok: true, message: `Loaded shelved “${pack.title}”` }
    },
    [lightningProvider, truthProvider, applyCaseStudyPack, refreshCaseStudyShelf],
  )

  const deleteCaseStudyShelfEntry = useCallback(
    (shelfId: string) => {
      const entry = caseStudyShelf.find((e) => e.shelfId === shelfId)
      const removed = deleteCaseStudyFromShelf(shelfId)
      refreshCaseStudyShelf()
      if (!removed) return { ok: false, message: 'Shelf entry not found' }
      if (
        caseStudy &&
        entry &&
        caseStudy.id === entry.packId &&
        caseStudy.importAttestation
      ) {
        clearCaseStudy()
      }
      return { ok: true, message: 'Removed from local shelf' }
    },
    [caseStudyShelf, refreshCaseStudyShelf, caseStudy, clearCaseStudy],
  )

  const backupCaseStudyShelf = useCallback(() => {
    return downloadCaseStudyShelfBackup()
  }, [])

  const restoreCaseStudyShelfText = useCallback(
    (
      text: string,
      opts: { licenceNote: string; sourceFilename?: string; replace?: boolean },
    ) => {
      const result = restoreCaseStudyShelfBackup(text, opts)
      refreshCaseStudyShelf()
      return { ok: result.ok, message: result.message }
    },
    [refreshCaseStudyShelf],
  )

  const loadLightningSample = useCallback(() => {
    setCaseStudy(null)
    lightningProvider.setUrl(sampleLightningUrl())
    setLightningTick((n) => n + 1)
  }, [lightningProvider])

  const clearLightningFeed = useCallback(() => {
    if (caseStudy) {
      clearCaseStudy()
      return
    }
    lightningProvider.setUrl(null)
    setLightningEvents([])
    setLightningError(null)
    setLightningSourceLabel(null)
    setLightningTick((n) => n + 1)
  }, [lightningProvider, caseStudy, clearCaseStudy])

  const loadTruthSample = useCallback(() => {
    setCaseStudy(null)
    truthProvider.setUrl(sampleTruthCellsUrl())
    setTruthTick((n) => n + 1)
  }, [truthProvider])

  const tracks = caseStudy?.tracks ?? derivedTracks

  const loadTruthFromTracks = useCallback(() => {
    // Stand-in catalogue: detach from URL provider so export midpoints stay sticky
    // until cleared (even if radar tracks refresh).
    setCaseStudy(null)
    truthProvider.setUrl(null)
    const cells = truthCellsFromTracks(tracks)
    setTruthCells(cells)
    setTruthError(cells.length === 0 ? 'No derived tracks to use as stand-in truth' : null)
    setTruthSourceLabel(cells.length > 0 ? 'in-memory · derived-track export (stand-in)' : null)
    setTruthLoading(false)
  }, [truthProvider, tracks])

  const clearTruthCatalogue = useCallback(() => {
    if (caseStudy) {
      clearCaseStudy()
      return
    }
    truthProvider.setUrl(null)
    setTruthCells([])
    setTruthError(null)
    setTruthSourceLabel(null)
    setTruthTick((n) => n + 1)
  }, [truthProvider, caseStudy, clearCaseStudy])

  const trackSkills = useMemo(
    () => scoreTracks(tracks, radarFrames),
    [tracks, radarFrames],
  )
  const trackSkillSummary = useMemo(
    () => summarizeTrackSkills(trackSkills),
    [trackSkills],
  )

  const trackTruthMatches = useMemo(
    () =>
      matchTracksToTruth(tracks, truthCells, {
        maxDistanceKm: TRUTH_CELLS_FEED.maxDistanceKm,
        maxTimeDeltaSec: TRUTH_CELLS_FEED.maxTimeDeltaSec,
      }),
    [tracks, truthCells],
  )
  const trackTruthSummary = useMemo(
    () =>
      summarizeTrackTruth(
        trackTruthMatches,
        truthCells.length,
        Boolean(caseStudy) || truthProvider.configured() || truthCells.length > 0,
      ),
    [trackTruthMatches, truthCells.length, truthProvider, caseStudy],
  )

  return {
    loading,
    tracksLoading,
    error,
    availability,
    radarFrames,
    satelliteFrames,
    environment,
    tracks,
    trackSkills,
    trackSkillSummary,
    lightningEvents,
    lightningConfigured: Boolean(caseStudy) || lightningProvider.configured() || lightningEvents.length > 0,
    lightningLoading,
    lightningError,
    lightningSourceLabel,
    loadLightningSample,
    clearLightningFeed,
    truthCells,
    truthConfigured: Boolean(caseStudy) || truthProvider.configured() || truthCells.length > 0,
    truthLoading,
    truthError,
    truthSourceLabel,
    trackTruthMatches,
    trackTruthSummary,
    loadTruthSample,
    loadTruthFromTracks,
    clearTruthCatalogue,
    caseStudy,
    caseStudyLoading,
    caseStudyError,
    caseStudyCatalog,
    caseStudyCatalogLoading,
    caseStudyCatalogError,
    loadCaseStudyCatalog,
    loadCaseStudyById,
    loadCaseStudySample,
    importCaseStudyText,
    caseStudyShelf,
    refreshCaseStudyShelf,
    loadCaseStudyFromShelfId,
    deleteCaseStudyShelfEntry,
    backupCaseStudyShelf,
    restoreCaseStudyShelfText,
    cloudField,
    cloudFieldLoading,
    cloudFieldError,
    clearCaseStudy,
    refresh: () => setTick((n) => n + 1),
  }
}
