// Each tool is rendered as a physical object inside the 3D toolbox. `model`
// picks which prop represents it; tools without a dedicated prop fall back
// to a generic wrench so a newly added tool still shows up.
export type ToolModel = 'marker' | 'microphone' | 'compass' | 'wrench';

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
];
