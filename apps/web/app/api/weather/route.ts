import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

type WeatherArea = {
  name: string;
  label_location?: {
    latitude: number;
    longitude: number;
  };
};

type WeatherForecast = {
  area: string;
  forecast: string;
};

type DataGovWeatherResponse = {
  area_metadata?: WeatherArea[];
  items?: Array<{
    update_timestamp?: string;
    timestamp?: string;
    valid_period?: unknown;
    forecasts?: WeatherForecast[];
  }>;
};

function fallbackWeather() {
  return {
    condition: "Partly cloudy",
    icon: "⛅",
    area: "Singapore",
    detail: "Using safe weather fallback. Live weather is temporarily unavailable.",
    sourceName: "Fallback weather context",
    sourceUrl: "https://www.weather.gov.sg/",
    fallbackUsed: true
  };
}

function toIcon(condition: string): string {
  const value = condition.toLowerCase();
  if (/thundery|thunder|storm/.test(value)) return "⛈️";
  if (/rain|shower/.test(value)) return "🌧️";
  if (/cloud/.test(value)) return "⛅";
  if (/fair|sun|clear/.test(value)) return "☀️";
  if (/wind/.test(value)) return "🌬️";
  return "🌦️";
}

function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const radius = 6371;
  const toRad = (value: number) => (value * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return radius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function nearestAreaName(areaMetadata: WeatherArea[], lat?: number, lon?: number): string | undefined {
  if (lat === undefined || lon === undefined) return undefined;

  return areaMetadata
    .filter((area) => area.label_location)
    .map((area) => ({
      name: area.name,
      distance: distanceKm(lat, lon, area.label_location!.latitude, area.label_location!.longitude)
    }))
    .sort((a, b) => a.distance - b.distance)[0]?.name;
}

export async function GET(request: NextRequest) {
  const lat = Number(request.nextUrl.searchParams.get("lat"));
  const lon = Number(request.nextUrl.searchParams.get("lon"));
  const endpoint = process.env.WEATHER_API_URL ?? "https://api.data.gov.sg/v1/environment/2-hour-weather-forecast";

  try {
    const response = await fetch(endpoint, { next: { revalidate: 300 } });
    if (!response.ok) throw new Error(`Weather API failed with HTTP ${response.status}`);

    const data = (await response.json()) as DataGovWeatherResponse;
    const forecastItem = data.items?.[0];
    const forecasts = forecastItem?.forecasts ?? [];
    const areaName = nearestAreaName(data.area_metadata ?? [], Number.isFinite(lat) ? lat : undefined, Number.isFinite(lon) ? lon : undefined);
    const selected = forecasts.find((forecast) => forecast.area === areaName) ?? forecasts[0];

    if (!selected) {
      return NextResponse.json(fallbackWeather());
    }

    return NextResponse.json({
      condition: selected.forecast,
      icon: toIcon(selected.forecast),
      area: selected.area,
      detail: forecastItem?.update_timestamp ? `Updated ${new Date(forecastItem.update_timestamp).toLocaleTimeString()}` : "Live two-hour forecast",
      sourceName: "data.gov.sg 2-hour weather forecast",
      sourceUrl: "https://data.gov.sg/",
      fallbackUsed: false
    });
  } catch (error) {
    return NextResponse.json({
      ...fallbackWeather(),
      detail: error instanceof Error ? error.message : "Weather API unavailable"
    });
  }
}
