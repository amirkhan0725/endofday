import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'EndOfDay – Construction Reports',
    short_name: 'EndOfDay',
    description: 'Turn field notes into professional daily construction reports in seconds.',
    start_url: '/report/new',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#f8fafc',
    theme_color: '#f59e0b',
    icons: [
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
    ],
  };
}
