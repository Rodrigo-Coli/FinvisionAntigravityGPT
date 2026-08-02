import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ImageOff, PlayCircle } from 'lucide-react';
import { trackEvent, withUtmParams } from '../../lib/analytics';
import { LandingService } from '../../services/landing.service';

interface Screen {
  slug: string;
  src: string;
  alt: string;
  title: string;
  benefit: string;
}

// Fallback estático — usado até o banco responder, e por slug sempre que o admin ainda
// não tiver cadastrado (ou tiver removido) aquele print em Admin > Landing > Imagens.
// Para trocar os prints padrão, suba os arquivos em /public/screenshots/ com estes nomes.
const DEFAULT_SCREENS: Screen[] = [
  { slug: 'dashboard', src: '/screenshots/dashboard.png', alt: 'Dashboard consolidado do Zyvion', title: 'Dashboard Consolidado', benefit: 'Saldo total, patrimônio líquido e alertas em uma única tela.' },
  { slug: 'dre', src: '/screenshots/dre.png', alt: 'DRE pessoal e empresarial no Zyvion', title: 'DRE Completo', benefit: 'Receitas x despesas por categoria, exportável em PDF e Excel.' },
  { slug: 'conciliacao', src: '/screenshots/conciliacao.png', alt: 'Conciliação bancária assistida por IA no Zyvion', title: 'Conciliação por IA', benefit: 'Importe o extrato e a IA classifica tudo automaticamente.' },
  { slug: 'patrimonio', src: '/screenshots/patrimonio.png', alt: 'Patrimônio físico e investimentos no Zyvion', title: 'Patrimônio Completo', benefit: 'Imóveis, veículos, investimentos e dívidas no mesmo lugar.' },
];

function ScreenshotCard({ screen, index }: { screen: Screen; index: number }) {
  const [failed, setFailed] = useState(false);

  return (
    <div className="bg-gradient-to-br from-slate-900/80 to-slate-950/80 border border-white/10 rounded-[32px] overflow-hidden group hover:border-brand-500/30 transition-colors">
      <div className="aspect-[16/10] bg-slate-950/60 relative flex items-center justify-center overflow-hidden">
        {!failed ? (
          <img
            src={screen.src}
            alt={screen.alt}
            loading={index === 0 ? 'eager' : 'lazy'}
            onError={() => setFailed(true)}
            className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-700"
          />
        ) : (
          <div className="flex flex-col items-center gap-3 text-slate-600 p-8 text-center">
            <ImageOff size={32} />
            <span className="text-[10px] font-bold uppercase tracking-widest">Print em breve — {screen.src}</span>
          </div>
        )}
      </div>
      <div className="p-6">
        <h3 className="text-lg font-black tracking-tight text-white mb-1">{screen.title}</h3>
        <p className="text-slate-400 text-sm leading-relaxed">{screen.benefit}</p>
      </div>
    </div>
  );
}

function ShowcaseSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-10" aria-hidden="true">
      {DEFAULT_SCREENS.map((s) => (
        <div key={s.slug} className="bg-slate-900/60 border border-white/10 rounded-[32px] overflow-hidden animate-pulse">
          <div className="aspect-[16/10] bg-white/5" />
          <div className="p-6 space-y-2">
            <div className="h-4 bg-white/10 rounded-md w-1/2" />
            <div className="h-3 bg-white/5 rounded-md w-3/4" />
          </div>
        </div>
      ))}
    </div>
  );
}

function isVideoFile(url: string): boolean {
  return /\.(mp4|webm|mov)$/i.test(url);
}

export default function ProductShowcase() {
  const [loading, setLoading] = useState(true);
  const [screens, setScreens] = useState<Screen[]>(DEFAULT_SCREENS);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    Promise.all([LandingService.getActiveScreenshots(), LandingService.getSettings()]).then(([dbScreens, settings]) => {
      if (!mounted) return;
      if (dbScreens.length > 0) {
        const merged = DEFAULT_SCREENS.map((fallback) => {
          const dbRow = dbScreens.find((s) => s.slug === fallback.slug);
          if (!dbRow) return fallback;
          return {
            slug: fallback.slug,
            src: dbRow.image_url || fallback.src,
            alt: fallback.alt,
            title: dbRow.title || fallback.title,
            benefit: dbRow.benefit || fallback.benefit,
          };
        });
        setScreens(merged);
      }
      setVideoUrl(settings?.video_url || null);
      setLoading(false);
    });
    return () => { mounted = false; };
  }, []);

  return (
    <section id="produto" className="py-24 md:py-32 relative z-10 bg-slate-950/50 border-y border-white/5">
      <div className="max-w-[1400px] mx-auto px-6 lg:px-12">
        <div className="text-center mb-16">
          <span className="text-[10px] font-black text-brand-400 uppercase tracking-[0.3em] mb-4 block">O produto de verdade</span>
          <h2 className="text-3xl md:text-5xl font-black tracking-tight mb-4 text-white">Veja a ferramenta funcionando, não uma promessa.</h2>
          <p className="text-slate-400 font-medium text-lg max-w-2xl mx-auto">Quatro telas reais do Zyvion — sem enrolação, sem mockup genérico.</p>
        </div>

        {loading ? (
          <ShowcaseSkeleton />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-10">
            {screens.map((screen, i) => (
              <ScreenshotCard key={screen.slug} screen={screen} index={i} />
            ))}
          </div>
        )}

        {loading ? (
          <div className="rounded-[32px] border border-dashed border-white/15 bg-slate-950/40 h-52 mb-14 animate-pulse" aria-hidden="true" />
        ) : videoUrl ? (
          <div className="rounded-[32px] border border-white/10 bg-slate-950/40 overflow-hidden mb-14">
            {isVideoFile(videoUrl) ? (
              <video src={videoUrl} controls className="w-full max-h-[480px] bg-black" />
            ) : (
              <img src={videoUrl} alt="Demonstração da conciliação por IA" className="w-full max-h-[480px] object-cover" loading="lazy" />
            )}
          </div>
        ) : (
          <div className="rounded-[32px] border border-dashed border-white/15 bg-slate-950/40 p-10 md:p-14 flex flex-col items-center justify-center text-center mb-14">
            <div className="w-16 h-16 rounded-2xl bg-brand-500/10 border border-brand-500/30 text-brand-400 flex items-center justify-center mb-5">
              <PlayCircle size={32} />
            </div>
            <h3 className="text-xl font-black tracking-tight text-white mb-2">Vídeo: conciliação por IA em ação</h3>
            <p className="text-slate-500 text-sm max-w-md">Espaço reservado para o vídeo/GIF mostrando um extrato sendo importado e classificado automaticamente. Suba o arquivo em Admin &gt; Landing &gt; Imagens.</p>
          </div>
        )}

        <div className="text-center">
          <Link
            to={withUtmParams('/demo')}
            onClick={() => trackEvent('demo_click', { location: 'product_showcase' })}
            className="inline-flex items-center gap-3 px-10 py-5 bg-white text-slate-900 rounded-2xl font-black text-xs uppercase tracking-[0.2em] hover:bg-slate-100 hover:scale-105 transition-all min-h-[44px]"
          >
            Explorar a demo já preenchida com dados <ArrowRight size={18} />
          </Link>
          <p className="mt-4 text-slate-500 text-xs font-bold uppercase tracking-widest">Sem cadastro. Você entra e já explora contas, cartões e patrimônio de exemplo.</p>
        </div>
      </div>
    </section>
  );
}
