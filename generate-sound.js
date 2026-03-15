// Generate a dramatic "FAAAH" sound effect as a WAV file
// A descending, dramatic horn/choir-like tone

const fs = require('fs');
const path = require('path');

const SAMPLE_RATE = 44100;
const DURATION = 1.8; // seconds
const NUM_SAMPLES = Math.floor(SAMPLE_RATE * DURATION);
const NUM_CHANNELS = 1;
const BITS_PER_SAMPLE = 16;

function generateFaaah() {
  const samples = new Int16Array(NUM_SAMPLES);
  
  for (let i = 0; i < NUM_SAMPLES; i++) {
    const t = i / SAMPLE_RATE;
    const progress = t / DURATION;
    
    // Envelope: quick attack, sustain, then fade
    let envelope;
    if (t < 0.05) {
      envelope = t / 0.05; // 50ms attack
    } else if (t < 0.15) {
      envelope = 1.0; // sustain peak
    } else if (t < DURATION - 0.3) {
      envelope = 1.0 - 0.3 * ((t - 0.15) / (DURATION - 0.45)); // slow decay
    } else {
      envelope = Math.max(0, 0.7 * (1 - (t - (DURATION - 0.3)) / 0.3)); // fade out
    }
    
    // Base frequency: dramatic descending tone (F2 to D2 range)
    const baseFreq = 175 - 30 * progress;
    
    // Layer multiple harmonics for a rich, dramatic choir/horn tone
    let sample = 0;
    
    // Fundamental
    sample += 0.35 * Math.sin(2 * Math.PI * baseFreq * t);
    
    // Octave above - gives brightness
    sample += 0.25 * Math.sin(2 * Math.PI * baseFreq * 2 * t);
    
    // Fifth above fundamental - power chord feel
    sample += 0.15 * Math.sin(2 * Math.PI * baseFreq * 1.5 * t);
    
    // 3rd harmonic - adds richness
    sample += 0.12 * Math.sin(2 * Math.PI * baseFreq * 3 * t);
    
    // 4th harmonic - brass character
    sample += 0.08 * Math.sin(2 * Math.PI * baseFreq * 4 * t);
    
    // Sub-bass rumble
    sample += 0.15 * Math.sin(2 * Math.PI * baseFreq * 0.5 * t);
    
    // Add slight vibrato for dramatic effect
    const vibrato = 1 + 0.008 * Math.sin(2 * Math.PI * 5.5 * t);
    sample *= vibrato;
    
    // Add a percussive "hit" at the start
    if (t < 0.08) {
      const hitEnv = Math.exp(-t * 40);
      sample += 0.4 * hitEnv * Math.sin(2 * Math.PI * 100 * t);
      sample += 0.3 * hitEnv * Math.sin(2 * Math.PI * 200 * t);
      // Noise burst for impact
      sample += 0.25 * hitEnv * (Math.random() * 2 - 1);
    }
    
    // Apply soft clipping for warmth
    sample = Math.tanh(sample * 1.3);
    
    // Apply envelope
    sample *= envelope;
    
    // Convert to 16-bit
    samples[i] = Math.max(-32768, Math.min(32767, Math.floor(sample * 30000)));
  }
  
  return samples;
}

function writeWav(filename, samples) {
  const dataSize = samples.length * (BITS_PER_SAMPLE / 8);
  const buffer = Buffer.alloc(44 + dataSize);
  
  // RIFF header
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  
  // fmt chunk
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16); // chunk size
  buffer.writeUInt16LE(1, 20);  // PCM format
  buffer.writeUInt16LE(NUM_CHANNELS, 22);
  buffer.writeUInt32LE(SAMPLE_RATE, 24);
  buffer.writeUInt32LE(SAMPLE_RATE * NUM_CHANNELS * (BITS_PER_SAMPLE / 8), 28); // byte rate
  buffer.writeUInt16LE(NUM_CHANNELS * (BITS_PER_SAMPLE / 8), 32); // block align
  buffer.writeUInt16LE(BITS_PER_SAMPLE, 34);
  
  // data chunk
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);
  
  for (let i = 0; i < samples.length; i++) {
    buffer.writeInt16LE(samples[i], 44 + i * 2);
  }
  
  fs.writeFileSync(filename, buffer);
}

// Generate and save
const mediaDir = path.join(__dirname, 'media');
if (!fs.existsSync(mediaDir)) {
  fs.mkdirSync(mediaDir, { recursive: true });
}

const samples = generateFaaah();
const outPath = path.join(mediaDir, 'faaah.wav');
writeWav(outPath, samples);

console.log(`✅ Generated FAAAH sound: ${outPath}`);
console.log(`   Duration: ${DURATION}s, Sample Rate: ${SAMPLE_RATE}Hz, Samples: ${NUM_SAMPLES}`);
