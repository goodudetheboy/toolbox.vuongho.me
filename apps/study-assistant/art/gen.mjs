// Calls a Gemini image model with reference images; writes the first image part.
// usage: node gen.mjs <out.png> <prompt> [refImage...]
import fs from 'node:fs';
const [out, prompt, ...refs] = process.argv.slice(2);
const model = process.env.MODEL || 'gemini-3-pro-image';
const parts = refs.map(f => ({ inlineData: { mimeType: f.endsWith('.png') ? 'image/png' : 'image/jpeg', data: fs.readFileSync(f).toString('base64') } }));
parts.push({ text: prompt });
const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
  method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
  body: JSON.stringify({ contents: [{ parts }], generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: '1:1' } } }),
});
const j = await r.json();
const img = j.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
if (!img) { console.error(JSON.stringify(j).slice(0, 800)); process.exit(1); }
fs.writeFileSync(out, Buffer.from(img.inlineData.data, 'base64'));
console.log('wrote', out);
