export type NominatimSuggestion = {
  place_id: string | number;
  display_name: string;
  lat: string;
  lon: string;
};

export type LatLng = {
  lat: number;
  lng: number;
};

export type SavedLocation = {
  formattedAddress: string;
  lat: number;
  lon: number;
  placeId?: string;
};

type NominatimResponseItem = {
  place_id: string | number;
  display_name: string;
  lat: string;
  lon: string;
};

export type Suggestion = NominatimSuggestion & {
  distanceKm?: number;
};

/**
 * Calculate distance between two coordinates using Haversine formula
 */
export function haversineKm(coord1: LatLng, coord2: LatLng): number {
  const R = 6371; // Earth's radius in km
  const dLat = toRadians(coord2.lat - coord1.lat);
  const dLon = toRadians(coord2.lng - coord1.lng);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(coord1.lat)) * Math.cos(toRadians(coord2.lat)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRadians(degrees: number): number {
  return degrees * (Math.PI / 180);
}

/**
 * Add distance to suggestions based on user location
 */
export function addDistance(suggestions: Suggestion[], userLocation?: LatLng): Suggestion[] {
  if (!userLocation) return suggestions;
  return suggestions.map(s => {
    if (!s.lat || !s.lon) return { ...s, distanceKm: Infinity };
    return {
      ...s,
      distanceKm: haversineKm(userLocation, { lat: parseFloat(s.lat), lng: parseFloat(s.lon) })
    };
  });
}

/**
 * Sort suggestions by distance first
 */
export function sortByDistanceFirst(suggestions: Suggestion[]): Suggestion[] {
  return [...suggestions].sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity));
}

/**
 * Two-step Nominatim search: local bounded first, then global if no results
 */
export async function fetchLocationSuggestions(
  query: string,
  userLocation?: LatLng,
  options?: {
    limit?: number;
    includeCurrentLocation?: boolean;
    currentLocationAddress?: string;
    defaultLocation?: SavedLocation | null;
  }
): Promise<{
  suggestions: Suggestion[];
  hasLocalResults: boolean;
  showWorldwideLink: boolean;
}> {
  const { limit = 8, includeCurrentLocation = false, currentLocationAddress, defaultLocation } = options || {};

  // If query too short, only return current location if available
  if (query.length < 3) {
    let suggestions: Suggestion[] = [];
    if (includeCurrentLocation && currentLocationAddress && userLocation) {
      suggestions = [{
        place_id: 'current',
        display_name: `Use my current location: ${currentLocationAddress}`,
        lat: userLocation.lat.toString(),
        lon: userLocation.lng.toString(),
        distanceKm: 0,
      }];
    }
    return { suggestions, hasLocalResults: false, showWorldwideLink: false };
  }

  let biasLocation = userLocation;
  if (!biasLocation && defaultLocation) {
    biasLocation = { lat: defaultLocation.lat, lng: defaultLocation.lon };
  }

  let localResults: NominatimSuggestion[] = [];
  let hasLocalResults = false;

  // Step 1: Local bounded search if we have bias location
  if (biasLocation) {
    const { lat, lng } = biasLocation;
    const delta = 5; // ~550km box for broader state-level coverage
    const urlLocal = `https://nominatim.openstreetmap.org/search?${new URLSearchParams({
      q: query,
      format: 'json',
      addressdetails: '1',
      limit: limit.toString(),
      viewbox: `${lng - delta},${lat + delta},${lng + delta},${lat - delta}`,
      bounded: '1',
      countrycodes: 'us',
    })}`;

    try {
      const response = await fetch(urlLocal);
      const data = await response.json();
      localResults = data.map((item: NominatimResponseItem) => ({
        place_id: item.place_id,
        display_name: item.display_name,
        lat: item.lat,
        lon: item.lon,
      }));
      hasLocalResults = localResults.length > 0;
    } catch (error) {
      console.error("Failed to fetch local suggestions:", error);
    }
  }

  let suggestions: Suggestion[] = [];

  if (hasLocalResults) {
    // Use local results with distance sorting
    suggestions = addDistance(localResults, biasLocation);
    suggestions = sortByDistanceFirst(suggestions);
  } else {
    // Step 2: Global search if no local results
    const urlGlobal = `https://nominatim.openstreetmap.org/search?${new URLSearchParams({
      q: query,
      format: 'json',
      addressdetails: '1',
      limit: limit.toString(),
      countrycodes: 'us',
    })}`;

    try {
      const response = await fetch(urlGlobal);
      const data = await response.json();
      const globalResults = data.map((item: NominatimResponseItem) => ({
        place_id: item.place_id,
        display_name: item.display_name,
        lat: item.lat,
        lon: item.lon,
      }));
      suggestions = addDistance(globalResults, biasLocation);
      suggestions = sortByDistanceFirst(suggestions);
    } catch (error) {
      console.error("Failed to fetch global suggestions:", error);
    }
  }

  // Add current location at the top if requested
  if (includeCurrentLocation && currentLocationAddress && userLocation) {
    const currentSuggestion: Suggestion = {
      place_id: 'current',
      display_name: `Use my current location: ${currentLocationAddress}`,
      lat: userLocation.lat.toString(),
      lon: userLocation.lng.toString(),
      distanceKm: 0,
    };
    suggestions = [currentSuggestion, ...suggestions];
  }

  // Add default location after current location if available and not the same as current location
  if (defaultLocation && (!userLocation || 
      Math.abs(defaultLocation.lat - userLocation.lat) > 0.001 || 
      Math.abs(defaultLocation.lon - userLocation.lng) > 0.001)) {
    const defaultSuggestion: Suggestion = {
      place_id: 'default',
      display_name: `Use default address: ${defaultLocation.formattedAddress}`,
      lat: defaultLocation.lat.toString(),
      lon: defaultLocation.lon.toString(),
      distanceKm: biasLocation ? haversineKm(biasLocation, { lat: defaultLocation.lat, lng: defaultLocation.lon }) : undefined,
    };
    suggestions = [defaultSuggestion, ...suggestions];
  }

  return {
    suggestions,
    hasLocalResults,
    showWorldwideLink: hasLocalResults, // Show link if we have local results (user can expand to global)
  };
}

/**
 * Fetch global suggestions (for "Search worldwide" functionality)
 */
export async function fetchGlobalLocationSuggestions(
  query: string,
  userLocation?: LatLng,
  options?: {
    limit?: number;
    includeCurrentLocation?: boolean;
    currentLocationAddress?: string;
    defaultLocation?: SavedLocation | null;
  }
): Promise<Suggestion[]> {
  const { limit = 8, includeCurrentLocation = false, currentLocationAddress, defaultLocation } = options || {};

  let biasLocation = userLocation;
  if (!biasLocation && defaultLocation) {
    biasLocation = { lat: defaultLocation.lat, lng: defaultLocation.lon };
  }

  const urlGlobal = `https://nominatim.openstreetmap.org/search?${new URLSearchParams({
    q: query,
    format: 'json',
    addressdetails: '1',
    limit: limit.toString(),
    countrycodes: 'us',
  })}`;

  try {
    const response = await fetch(urlGlobal);
    const data = await response.json();
    let suggestions: Suggestion[] = data.map((item: NominatimResponseItem) => ({
      place_id: item.place_id,
      display_name: item.display_name,
      lat: item.lat,
      lon: item.lon,
    }));

    suggestions = addDistance(suggestions, biasLocation);
    suggestions = sortByDistanceFirst(suggestions);

    // Add current location at the top if requested
    if (includeCurrentLocation && currentLocationAddress && userLocation) {
      const currentSuggestion: Suggestion = {
        place_id: 'current',
        display_name: `Use my current location: ${currentLocationAddress}`,
        lat: userLocation.lat.toString(),
        lon: userLocation.lng.toString(),
        distanceKm: 0,
      };
      suggestions = [currentSuggestion, ...suggestions];
    }

    // Add default location after current location if available and not the same as current location
    if (defaultLocation && (!userLocation || 
        Math.abs(defaultLocation.lat - userLocation.lat) > 0.001 || 
        Math.abs(defaultLocation.lon - userLocation.lng) > 0.001)) {
      const defaultSuggestion: Suggestion = {
        place_id: 'default',
        display_name: `Use default address: ${defaultLocation.formattedAddress}`,
        lat: defaultLocation.lat.toString(),
        lon: defaultLocation.lon.toString(),
        distanceKm: biasLocation ? haversineKm(biasLocation, { lat: defaultLocation.lat, lng: defaultLocation.lon }) : undefined,
      };
      suggestions = [defaultSuggestion, ...suggestions];
    }

    return suggestions;
  } catch (error) {
    console.error("Failed to fetch global suggestions:", error);
    return [];
  }
}