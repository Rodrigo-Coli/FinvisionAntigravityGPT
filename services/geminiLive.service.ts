
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';

export interface TranscriptionEntry {
  text: string;
  role: 'user' | 'model';
  timestamp: Date;
}

export class GeminiLiveService {
  private ai: GoogleGenAI | null = null;
  private session: any = null;
  private audioContext: AudioContext | null = null;
  private inputAudioContext: AudioContext | null = null;
  private nextStartTime = 0;
  private sources = new Set<AudioBufferSourceNode>();
  private onUpdate: (history: TranscriptionEntry[]) => void;
  private history: TranscriptionEntry[] = [];
  private currentInput = '';
  private currentOutput = '';

  constructor(onUpdate: (history: TranscriptionEntry[]) => void) {
    this.onUpdate = onUpdate;
  }

  async connect() {
    this.ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
    this.inputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

    const sessionPromise = this.ai.live.connect({
      model: 'gemini-2.5-flash-native-audio-preview-12-2025',
      callbacks: {
        onopen: () => {
          const source = this.inputAudioContext!.createMediaStreamSource(stream);
          const scriptProcessor = this.inputAudioContext!.createScriptProcessor(4096, 1, 1);
          scriptProcessor.onaudioprocess = (e) => {
            const inputData = e.inputBuffer.getChannelData(0);
            sessionPromise.then((session: any) => {
              session.sendRealtimeInput({ media: this.createBlob(inputData) });
            });
          };
          source.connect(scriptProcessor);
          scriptProcessor.connect(this.inputAudioContext!.destination);
        },
        onmessage: async (message: LiveServerMessage) => {
          if (message.serverContent?.outputTranscription) {
            this.currentOutput += message.serverContent.outputTranscription.text;
          } else if (message.serverContent?.inputTranscription) {
            this.currentInput += message.serverContent.inputTranscription.text;
          }

          if (message.serverContent?.turnComplete) {
            if (this.currentInput.trim()) {
              this.history.push({ text: this.currentInput, role: 'user', timestamp: new Date() });
            }
            if (this.currentOutput.trim()) {
              this.history.push({ text: this.currentOutput, role: 'model', timestamp: new Date() });
            }
            this.currentInput = '';
            this.currentOutput = '';
            this.onUpdate([...this.history]);
          }

          const base64Audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
          if (base64Audio) {
            this.nextStartTime = Math.max(this.nextStartTime, this.audioContext!.currentTime);
            const buffer = await this.decodeAudioData(this.decode(base64Audio), this.audioContext!, 24000, 1);
            const source = this.audioContext!.createBufferSource();
            source.buffer = buffer;
            source.connect(this.audioContext!.destination);
            source.start(this.nextStartTime);
            this.nextStartTime += buffer.duration;
            this.sources.add(source);
            source.onended = () => this.sources.delete(source);
          }

          if (message.serverContent?.interrupted) {
            for (const s of this.sources) {
              try { s.stop(); } catch(e) {}
            }
            this.sources.clear();
            this.nextStartTime = 0;
          }
        },
        onclose: () => console.log('Live session closed'),
        onerror: (e: any) => console.error('Live session error', e),
      },
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } } },
        inputAudioTranscription: {},
        outputAudioTranscription: {},
        systemInstruction: 'Você é o consultor financeiro inteligente da Zyvion. Ajude o usuário de forma natural com suas finanças, fornecendo insights baseados em dados reais de gestão financeira.',
      },
    });
    this.session = await sessionPromise;
  }

  private decode(base64: string) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  private encode(bytes: Uint8Array) {
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  }

  private async decodeAudioData(data: Uint8Array, ctx: AudioContext, sampleRate: number, numChannels: number): Promise<AudioBuffer> {
    const dataInt16 = new Int16Array(data.buffer);
    const frameCount = dataInt16.length / numChannels;
    const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);
    for (let channel = 0; channel < numChannels; channel++) {
      const channelData = buffer.getChannelData(channel);
      for (let i = 0; i < frameCount; i++) {
        channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
      }
    }
    return buffer;
  }

  private createBlob(data: Float32Array): any {
    const int16 = new Int16Array(data.length);
    for (let i = 0; i < data.length; i++) int16[i] = data[i] * 32768;
    return { data: this.encode(new Uint8Array(int16.buffer)), mimeType: 'audio/pcm;rate=16000' };
  }

  disconnect() {
    if (this.session) this.session.close();
    if (this.audioContext) this.audioContext.close();
    if (this.inputAudioContext) this.inputAudioContext.close();
    this.history = [];
    this.currentInput = '';
    this.currentOutput = '';
  }
}
