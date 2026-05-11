// Open-Meteo WMO weather interpretation codes (subset actually emitted)
function getWeatherCondition(code: number): string {
  if (code === 0)  return 'Clear skies';
  if (code <= 3)   return 'Partly cloudy';
  if (code <= 48)  return 'Foggy conditions';   // 45, 48
  if (code <= 55)  return 'Light drizzle';       // 51, 53, 55
  if (code <= 65)  return 'Rain';                // 61, 63, 65
  if (code <= 75)  return 'Snow';                // 71, 73, 75
  if (code === 77) return 'Snow grains';
  if (code <= 82)  return 'Rain showers';        // 80, 81, 82
  if (code <= 86)  return 'Snow showers';        // 85, 86
  if (code <= 99)  return 'Thunderstorms';       // 95, 96, 99
  return 'Severe weather';
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const lat = searchParams.get('lat');
  const lon = searchParams.get('lon');

  if (!lat || !lon) {
    return Response.json({ error: 'Missing coordinates' }, { status: 400 });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const res = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weathercode&temperature_unit=fahrenheit&timezone=auto`,
      { signal: controller.signal, next: { revalidate: 900 } }
    );
    const data = await res.json();
    const code: number = data.current.weathercode;
    const temp: number = Math.round(data.current.temperature_2m);
    return Response.json({ condition: getWeatherCondition(code), temperature: `${temp}°F` });
  } catch {
    return Response.json({ condition: 'Unknown', temperature: 'N/A' });
  } finally {
    clearTimeout(timeout);
  }
}
