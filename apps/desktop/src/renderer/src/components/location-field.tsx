import { CaretDown, MagnifyingGlass, MapPin } from '@phosphor-icons/react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react'

import { Field, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import type { GeocodeResult } from '@/lib/backend'

const MAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty'
const DEFAULT_MAP_CENTER: [number, number] = [-0.186964, 5.603717] // Accra — sane fallback until a location is set

/** Accepts a plain signed decimal ("5.6037") or a cardinal-suffixed value
 *  ("5.6037 N", "0.187° W") — the sign is derived from the negative
 *  hemisphere letter when one is present. */
function parseCoordinate(raw: string, negativeHemisphere: 'S' | 'W'): number | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  const match = /^(-?\d+(?:\.\d+)?)\s*°?\s*([NSEW])?$/i.exec(trimmed)
  if (!match) return null
  const magnitude = Number(match[1])
  if (Number.isNaN(magnitude)) return null
  const hemisphere = match[2]?.toUpperCase()
  if (!hemisphere) return magnitude
  return hemisphere === negativeHemisphere ? -Math.abs(magnitude) : Math.abs(magnitude)
}

function formatCoordinate(value: number | null): string {
  return value === null || value === undefined ? '' : String(value)
}

/**
 * Event location field: a debounced place-name search (via OpenStreetMap
 * Nominatim, proxied through the Rust backend) that fills name/address/lat/
 * lng from a selected result, a manual latitude/longitude entry for when the
 * venue isn't in the search index (accepts either a plain signed decimal or
 * a cardinal-suffixed value like "5.6037 N", "0.187° W"), and an interactive
 * map (MapLibre GL, OpenFreeMap tiles) — click or drag the pin to set a
 * location directly, matching the admin dashboard's own location picker.
 */
export function LocationField({
  locationName,
  onLocationNameChange,
  address,
  onAddressChange,
  lat,
  lng,
  onCoordinatesChange,
  searchLocations,
  reverseGeocode
}: {
  locationName: string
  onLocationNameChange: (value: string) => void
  address: string
  onAddressChange: (value: string) => void
  lat: number | null
  lng: number | null
  onCoordinatesChange: (lat: number | null, lng: number | null) => void
  searchLocations: (query: string) => Promise<GeocodeResult[]>
  reverseGeocode: (lat: number, lng: number) => Promise<{ label: string }>
}): ReactElement {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<GeocodeResult[]>([])
  const [searching, setSearching] = useState(false)
  const [open, setOpen] = useState(false)
  const [manualOpen, setManualOpen] = useState(false)
  const [latText, setLatText] = useState(formatCoordinate(lat))
  const [lngText, setLngText] = useState(formatCoordinate(lng))
  const containerRef = useRef<HTMLDivElement>(null)

  const mapContainerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const markerRef = useRef<maplibregl.Marker | null>(null)
  const addressRef = useRef(address)
  const onAddressChangeRef = useRef(onAddressChange)
  const onCoordinatesChangeRef = useRef(onCoordinatesChange)
  const reverseGeocodeRef = useRef(reverseGeocode)

  useEffect(() => {
    addressRef.current = address
    onAddressChangeRef.current = onAddressChange
    onCoordinatesChangeRef.current = onCoordinatesChange
    reverseGeocodeRef.current = reverseGeocode
  }, [address, onAddressChange, onCoordinatesChange, reverseGeocode])

  useEffect(() => {
    setLatText(formatCoordinate(lat))
    setLngText(formatCoordinate(lng))
  }, [lat, lng])

  const moveMarkerTo = useCallback((nextLat: number, nextLng: number, zoom = 14) => {
    const map = mapRef.current
    const marker = markerRef.current
    if (!map || !marker) return
    marker.setLngLat([nextLng, nextLat]).addTo(map)
    map.flyTo({ center: [nextLng, nextLat], zoom: Math.max(map.getZoom(), zoom) })
  }, [])

  const applyMapCoordinates = useCallback(
    (nextLat: number, nextLng: number) => {
      onCoordinatesChangeRef.current(nextLat, nextLng)
      moveMarkerTo(nextLat, nextLng)
      if (!addressRef.current.trim()) {
        reverseGeocodeRef.current(nextLat, nextLng)
          .then((result) => {
            if (result.label) onAddressChangeRef.current(result.label)
          })
          .catch(() => {
            // Best-effort — leave the address blank if reverse geocoding fails.
          })
      }
    },
    [moveMarkerTo]
  )

  // Mount the map once; interactions call applyMapCoordinates via refs so
  // this effect never needs to re-run (avoids tearing the map down and
  // rebuilding it on every keystroke elsewhere in the form).
  useEffect(() => {
    if (!mapContainerRef.current) return
    const initialLng = lng ?? DEFAULT_MAP_CENTER[0]
    const initialLat = lat ?? DEFAULT_MAP_CENTER[1]

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: MAP_STYLE,
      center: [initialLng, initialLat],
      zoom: lat != null && lng != null ? 14 : 2
    })
    map.addControl(new maplibregl.NavigationControl(), 'top-right')
    mapRef.current = map

    const marker = new maplibregl.Marker({ draggable: true, color: '#05a9bd' })
    if (lat != null && lng != null) {
      marker.setLngLat([lng, lat]).addTo(map)
    }
    marker.on('dragend', () => {
      const { lat: nextLat, lng: nextLng } = marker.getLngLat()
      applyMapCoordinates(nextLat, nextLng)
    })
    markerRef.current = marker

    map.on('click', (event) => {
      applyMapCoordinates(event.lngLat.lat, event.lngLat.lng)
    })

    return () => {
      map.remove()
      mapRef.current = null
      markerRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Keep the pin in sync when coordinates change from outside the map itself
  // (picking a search result, editing the manual lat/lng fields).
  useEffect(() => {
    if (lat === null || lng === null) return
    moveMarkerTo(lat, lng)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lat, lng])

  useEffect(() => {
    const trimmed = query.trim()
    if (trimmed.length < 3) {
      setResults([])
      return
    }
    const timer = setTimeout(() => {
      setSearching(true)
      searchLocations(trimmed)
        .then((found) => {
          setResults(found)
          setOpen(true)
        })
        .catch(() => setResults([]))
        .finally(() => setSearching(false))
    }, 400)
    return () => clearTimeout(timer)
  }, [query, searchLocations])

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent): void => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const selectResult = (result: GeocodeResult): void => {
    onAddressChange(result.displayName)
    onCoordinatesChange(result.lat, result.lon)
    setQuery('')
    setResults([])
    setOpen(false)
  }

  return (
    <div className="flex flex-col gap-3">
      <Field>
        <FieldLabel htmlFor="event-location-name">Location name</FieldLabel>
        <Input
          id="event-location-name"
          placeholder="Main Auditorium"
          value={locationName}
          onChange={(event) => onLocationNameChange(event.target.value)}
        />
      </Field>

      <Field>
        <FieldLabel htmlFor="event-location-search">Address</FieldLabel>
        <div ref={containerRef} className="relative">
          <MagnifyingGlass className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="event-location-search"
            className="pl-8"
            placeholder="Search for a place…"
            value={query || address}
            onChange={(event) => {
              setQuery(event.target.value)
              onAddressChange(event.target.value)
            }}
            onFocus={() => results.length > 0 && setOpen(true)}
          />
          {open && (searching || results.length > 0) ? (
            <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-2xl border bg-popover shadow-lg">
              {searching ? (
                <p className="px-3 py-2 text-sm text-muted-foreground">Searching…</p>
              ) : (
                results.map((result) => (
                  <button
                    key={`${result.lat}-${result.lon}-${result.displayName}`}
                    className="flex w-full items-start gap-2 px-3 py-2 text-left text-sm hover:bg-accent"
                    type="button"
                    onClick={() => selectResult(result)}
                  >
                    <MapPin className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                    <span className="truncate">{result.displayName}</span>
                  </button>
                ))
              )}
            </div>
          ) : null}
        </div>
      </Field>

      <button
        className="flex items-center gap-1 self-start text-xs font-medium text-muted-foreground hover:text-foreground"
        type="button"
        onClick={() => setManualOpen((current) => !current)}
      >
        <CaretDown
          className={
            manualOpen ? 'size-3 rotate-180 transition-transform' : 'size-3 transition-transform'
          }
        />
        Enter coordinates manually
      </button>

      {manualOpen ? (
        <div className="grid grid-cols-2 gap-3">
          <Field>
            <FieldLabel htmlFor="event-lat">Latitude</FieldLabel>
            <Input
              id="event-lat"
              placeholder="5.6037 or 5.6037° N"
              value={latText}
              onChange={(event) => setLatText(event.target.value)}
              onBlur={() => onCoordinatesChange(parseCoordinate(latText, 'S'), lng)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="event-lng">Longitude</FieldLabel>
            <Input
              id="event-lng"
              placeholder="-0.1870 or 0.1870° W"
              value={lngText}
              onChange={(event) => setLngText(event.target.value)}
              onBlur={() => onCoordinatesChange(lat, parseCoordinate(lngText, 'W'))}
            />
          </Field>
        </div>
      ) : null}

      <div className="space-y-1.5">
        <div className="h-[280px] w-full overflow-hidden rounded-2xl border" ref={mapContainerRef} />
        <p className="text-xs text-muted-foreground">
          Click the map or drag the pin to set a location — the address fills in
          automatically if left blank.
        </p>
      </div>
    </div>
  )
}
