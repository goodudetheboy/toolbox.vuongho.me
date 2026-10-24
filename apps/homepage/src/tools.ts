// Each tool is rendered as a physical object inside the 3D toolbox. `model`
// picks which prop represents it; tools without a dedicated prop fall back
// to a generic wrench so a newly added tool still shows up.
export type ToolModel = 'marker' | 'microphone' | 'compass' | 'duck' | 'coins' | 'bus' | 'wrench';

export interface Tool {
  name: string;
  description: string;
  href: string;
  model: ToolModel;
}

export const tools: Tool[] = [
  {
    name: 'PDF Redactor',
    description: 'Black out sensitive parts of a PDF, entirely in your browser.',
    href: '/pdf-redactor/',
    model: 'marker',
  },
  {
    name: 'Audio Transcriber',
    description: 'Transcribe audio and video files to timestamped text, entirely in your browser.',
    href: '/audio-transcriber/',
    model: 'microphone',
  },
  {
    name: 'Trip Planner',
    description: 'Keep a simple day-by-day itinerary for a trip, saved on this device.',
    href: '/trip-planner/',
    model: 'compass',
  },
  {
    name: 'Study Assistant',
    description: 'Split a study note into parts, then recite each one from memory with Biggu listening and hinting.',
    href: '/study-assistant/',
    // Rubber duck debugging: explain it out loud to someone who just listens.
    model: 'duck',
  },
  {
    name: 'Churn Machine',
    description: 'Browse bank account bonuses, plan which accounts to open with your paycheck, and track them.',
    href: '/churn-machine/',
    model: 'coins',
  },
  {
    name: 'NJ Transit Bus',
    description: 'When the next NJ Transit bus comes from your stop, live, with the Port Authority gate.',
    href: '/njtransit-bus/',
    model: 'bus',
  },
];
