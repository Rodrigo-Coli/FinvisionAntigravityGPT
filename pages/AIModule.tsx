import React, { useState, useRef, useEffect } from 'react';
import { Sparkles, BarChart3, Store } from 'lucide-react';

import { AIReconcileService } from '../services/aiReconcile.service';
import { ReconcileItem } from '../types';
import { GeminiLiveService, TranscriptionEntry } from '../services/geminiLive.service';

// Modular Components
import { OCRScanner } from '../components/ai/OCRScanner';
import { VoiceAssistant } from '../components/ai/VoiceAssistant';
import { AIInsights } from '../components/ai/AIInsights';

const AIModule: React.FC = () => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [activeTab, setActiveTab] = useState<'upload' | 'voice' | 'history' | 'comparative'>('upload');
  const [extractedData, setExtractedData] = useState<ReconcileItem[]>([]);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'done'>('idle');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  // Voice Assistant states
  const [isVoiceActive, setIsVoiceActive] = useState(false);
  const [voiceHistory, setVoiceHistory] = useState<TranscriptionEntry[]>([]);
  const liveServiceRef = useRef<GeminiLiveService | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [voiceHistory]);

  const formatCurrency = (val: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSelectedFile(file);
    setIsProcessing(true);
    setExtractedData([]);

    try {
      const data = await AIReconcileService.processFinancialDocument(file);
      setExtractedData(data);
    } catch (err: any) {
      console.error(err);
      alert(err?.message || 'Erro ao processar o documento.');
    } finally {
      setIsProcessing(false);
    }
  };

  const toggleVoiceAssistant = async () => {
    if (isVoiceActive) {
      liveServiceRef.current?.disconnect();
      setIsVoiceActive(false);
    } else {
      setIsVoiceActive(true);
      const service = new GeminiLiveService((history) => {
        setVoiceHistory(history);
      });
      await service.connect();
      liveServiceRef.current = service;
    }
  };

  const saveToQueue = async () => {
    if (extractedData.length === 0) return;
    setSaveStatus('saving');
    try {
      try {
        await AIReconcileService.saveToAiLabs(extractedData, {
          documentName: selectedFile?.name ?? `ai-import-${new Date().toISOString()}`,
          source: 'manual_upload',
          merchantName: null, merchantId: null,
          documentDate: new Date().toISOString().slice(0, 10),
        });
      } catch (e) {
        console.error('AI Labs save failed, continuing to queue:', e);
      }
      await AIReconcileService.saveToReconcileQueue(extractedData, 'manual_upload', 'AI Lab Import');
      setSaveStatus('done');
      setTimeout(() => setSaveStatus('idle'), 3000);
    } catch (err: any) {
      alert(err?.message || 'Erro ao salvar dados.');
      setSaveStatus('idle');
    }
  };

  return (
    <div className="max-w-7xl mx-auto py-10 px-4 sm:px-6 lg:px-8 space-y-10">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <h1 className="text-4xl font-display font-black text-slate-900 tracking-tight">AI & <span className="text-brand-600 italic">Labs</span></h1>
            <div className="px-3 py-1 bg-brand-50 text-brand-600 rounded-full text-[10px] font-black uppercase tracking-widest border border-brand-100">Experimental</div>
          </div>
          <p className="text-slate-500 font-medium text-lg">Inteligência artificial aplicada à sua gestão financeira de alta performance</p>
        </div>
      </header>

      <div className="flex gap-10 mb-2 border-b border-slate-200/50 overflow-x-auto scrollbar-hide">
        {[
          { id: 'upload', label: 'Extração OCR' },
          { id: 'voice', label: 'Assistente de Voz' },
          { id: 'history', label: 'Análise de Histórico' },
          { id: 'comparative', label: 'Lojas & Preços' }
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`pb-4 px-1 text-[10px] font-black uppercase tracking-[0.2em] transition-all border-b-2 whitespace-nowrap active:scale-95 ${activeTab === tab.id
                ? 'border-brand-600 text-brand-600'
                : 'border-transparent text-slate-400 hover:text-slate-600'
              }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-10 pt-4">
        {activeTab === 'upload' && (
          <>
            <OCRScanner
              isProcessing={isProcessing}
              fileInputRef={fileInputRef}
              handleFileChange={handleFileChange}
              extractedData={extractedData}
              saveToQueue={saveToQueue}
              saveStatus={saveStatus}
              formatCurrency={formatCurrency}
            />
            <AIInsights />
          </>
        )}

        {activeTab === 'voice' && (
          <VoiceAssistant
            isVoiceActive={isVoiceActive}
            toggleVoiceAssistant={toggleVoiceAssistant}
            voiceHistory={voiceHistory}
            scrollRef={scrollRef}
          />
        )}

        {(activeTab === 'history' || activeTab === 'comparative') && (
          <div className="lg:col-span-3">
            <div className="bg-white rounded-[48px] border border-slate-200/50 shadow-sm p-24 text-center flex flex-col items-center gap-8 animate-in zoom-in-95 duration-500">
              <div className="w-24 h-24 bg-slate-50 text-slate-200 rounded-[32px] flex items-center justify-center shadow-inner">
                {activeTab === 'history' ? <BarChart3 size={48} /> : <Store size={48} />}
              </div>
              <div className="space-y-3">
                <h3 className="text-3xl font-black text-slate-900 uppercase tracking-tight">
                  {activeTab === 'history' ? 'Laboratório de Variação' : 'Comparador de Mercado'}
                </h3>
                <p className="text-slate-500 font-medium max-w-lg mx-auto text-lg leading-relaxed">
                  {activeTab === 'history'
                    ? 'Em breve: Visualize a inflação pessoal através da flutuação de preços dos mesmos itens ao longo dos meses.'
                    : 'Em breve: Compare preços de itens extraídos em diferentes supermercados da sua região usando dados coletados.'}
                </p>
              </div>
              <button className="px-10 py-5 bg-brand-50 text-brand-600 rounded-[20px] font-black text-xs uppercase tracking-[0.2em] hover:bg-brand-100 transition-all active:scale-95">
                Ser Notificado
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AIModule;
