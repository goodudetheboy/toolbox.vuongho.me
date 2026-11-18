// Tools without a dedicated icon fall back to a generic wrench.
export type ToolIconName = 'marker' | 'microphone' | 'compass' | 'duck' | 'coins' | 'bus' | 'terminal' | 'wrench';

export interface Tool {
  name: string;
  description: string;
  href: string;
  icon: ToolIconName;
}

export const tools: Tool[] = [
  {
    name: 'PDF Redactor',
    description: 'Black out sensitive parts of a PDF, entirely in your browser.',
    href: '/pdf-redactor/',
    icon: 'marker',
  },
  {
    name: 'Audio Transcriber',
    description: 'Transcribe audio and video files to timestamped text, entirely in your browser.',
    href: '/audio-transcriber/',
    icon: 'microphone',
  },
  {
    name: 'Trip Planner',
    description: 'Keep a simple day-by-day itinerary for a trip, saved on this device.',
    href: '/trip-planner/',
    icon: 'compass',
  },
  {
    name: 'Study Assistant',
    description: 'Split a study note into parts, then recite each one from memory with Biggu listening and hinting.',
    href: '/study-assistant/',
    // Rubber duck debugging: explain it out loud to someone who just listens.
    icon: 'duck',
  },
  {
    name: 'Churn Machine',
    description: 'Browse bank account bonuses, plan which accounts to open with your paycheck, and track them.',
    href: '/churn-machine/',
    icon: 'coins',
  },
  {
    name: 'NJ Transit Bus',
    description: 'When the next NJ Transit bus comes from your stop, live, with the Port Authority gate.',
    href: '/njtransit-bus/',
    icon: 'bus',
  },
  {
    // Not part of this site: the Claude Remote Control box on my homelab,
    // behind Cloudflare Access (goodudetheboy/claude-rc).
    name: 'Claude RC',
    description: "Renew the Claude login on my Remote Control box, and see which instances are running.",
    href: 'https://claude-rc.vuongho.me',
    icon: 'terminal',
  },
];
