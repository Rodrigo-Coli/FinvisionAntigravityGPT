import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { X, ChevronRight, ChevronLeft } from 'lucide-react';

interface TourContextType {
    run: boolean;
    startTour: () => void;
    stopTour: () => void;
}

const TourContext = createContext<TourContextType | undefined>(undefined);

export const useTour = () => {
    const context = useContext(TourContext);
    if (!context) {
        throw new Error('useTour must be used within a TourProvider');
    }
    return context;
};

// --- Custom Joyride Replacement ---

interface Step {
    target: string;
    title?: string;
    content: string | ReactNode;
    disableBeacon?: boolean;
}

const TOUR_STEPS: Step[] = [
    {
        target: 'body',
        content: (
            <div>
                <h2 className="text-xl font-bold text-slate-900 mb-2">Bem-vindo ao FinVision Pro! 👋</h2>
                <p className="text-sm text-slate-600">
                    Este é o seu novo painel de controle executivo. Vamos dar um passeio rápido para você conhecer as principais funcionalidades e assumir o controle total do seu dinheiro.
                </p>
            </div>
        ),
        disableBeacon: true,
    },
    {
        target: '#tour-net-worth',
        title: 'Patrimônio Líquido',
        content: 'O número mais importante. Ele é a soma de todos os seus dinheiros e bens, menos todas as suas dívidas. Se este número cresce, você está enriquecendo!'
    },
    {
        target: '#tour-cash-flow',
        title: 'Projeção Inteligente',
        content: 'Nossa inteligência artificial analisa seus últimos 6 meses de gastos e suas dívidas futuras para projetar como estará o seu caixa nos próximos 12 meses.'
    },
    {
        target: '#tour-nav-accounts',
        title: 'Contas e Cartões',
        content: 'O primeiro passo é cadastrar suas contas bancárias, onde seu dinheiro fica, e seus cartões de crédito.'
    },
    {
        target: '#tour-nav-history',
        title: 'Histórico (O Dia a Dia)',
        content: 'É aqui que você vai registrar e acompanhar todas as despesas e receitas que acontecem durante o mês.'
    },
    {
        target: '#tour-nav-assets',
        title: 'Bens e Dívidas',
        content: 'Cadastre seus carros, imóveis e investimentos duradouros, bem como empréstimos ou financiamentos longos. Tudo isso reflete no seu Patrimônio.'
    },
    {
        target: '#tour-nav-goals',
        title: 'Metas e Orçamento',
        content: 'Use estas duas áreas para planejar o futuro: crie Metas para realizar sonhos e defina limites de Orçamento para controlar categorias.'
    }
];

export const TourProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [run, setRun] = useState(false);
    const [currentStep, setCurrentStep] = useState(0);
    const [targetRect, setTargetRect] = useState<DOMRect | null>(null);

    useEffect(() => {
        const hasCompletedTour = localStorage.getItem('finvision_tour_completed');
        if (!hasCompletedTour) {
            const timer = setTimeout(() => {
                setRun(true);
            }, 1500);
            return () => clearTimeout(timer);
        }
    }, []);

    const startTour = () => {
        setCurrentStep(0);
        setRun(true);
    };

    const stopTour = () => {
        setRun(false);
        localStorage.setItem('finvision_tour_completed', 'true');
    };

    const nextStep = () => {
        if (currentStep < TOUR_STEPS.length - 1) {
            setCurrentStep(s => s + 1);
        } else {
            stopTour();
        }
    };

    const prevStep = () => {
        if (currentStep > 0) {
            setCurrentStep(s => s - 1);
        }
    };

    useEffect(() => {
        if (!run) return;

        const step = TOUR_STEPS[currentStep];

        const updateRect = () => {
            if (step.target === 'body') {
                setTargetRect(null);
                return;
            }
            const el = document.querySelector(step.target);
            if (el) {
                setTargetRect(el.getBoundingClientRect());
                // Scroll to element smoothly
                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            } else {
                // Se o elemento não existe na tela atual
                setTargetRect(null);
            }
        };

        updateRect();
        window.addEventListener('resize', updateRect);
        return () => window.removeEventListener('resize', updateRect);
    }, [run, currentStep]);

    return (
        <TourContext.Provider value={{ run, startTour, stopTour }}>
            {children}

            {/* Custom Joyride Overlay Layer */}
            {run && (
                <div className="fixed inset-0 z-[9999] pointer-events-auto">
                    {/* Backdrop */}
                    <div className={`absolute inset-0 transition-opacity ${targetRect ? 'bg-transparent' : 'bg-slate-900/60 backdrop-blur-sm'}`} onClick={stopTour} />

                    {/* Highlight Hole */}
                    {targetRect && (
                        <div
                            className="absolute bg-transparent shadow-[0_0_0_9999px_rgba(15,23,42,0.6)] rounded-2xl transition-all duration-500 ease-in-out pointer-events-none"
                            style={{
                                top: targetRect.top - 8,
                                left: targetRect.left - 8,
                                width: targetRect.width + 16,
                                height: targetRect.height + 16,
                            }}
                        />
                    )}

                    {/* Dialog Box */}
                    <div
                        className={`absolute bg-white p-6 rounded-2xl shadow-2xl border border-slate-100 transition-all duration-500 w-[90%] max-w-[400px] ${targetRect ? '' : 'top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2'
                            }`}
                        style={targetRect ? {
                            // Posicionar de forma inteligente ao redor do alvo
                            top: targetRect.bottom + 24 > window.innerHeight - 200 ? targetRect.top - 200 : targetRect.bottom + 24,
                            left: Math.max(20, Math.min(targetRect.left, window.innerWidth - 420))
                        } : {}}
                    >
                        <button onClick={stopTour} className="absolute top-4 right-4 text-slate-400 hover:text-slate-900">
                            <X size={18} />
                        </button>

                        <div className="mb-6 mt-2">
                            {TOUR_STEPS[currentStep].title && (
                                <h3 className="text-lg font-bold text-slate-900 mb-2">{TOUR_STEPS[currentStep].title}</h3>
                            )}
                            {typeof TOUR_STEPS[currentStep].content === 'string' ? (
                                <p className="text-sm text-slate-600 leading-relaxed">{TOUR_STEPS[currentStep].content}</p>
                            ) : (
                                TOUR_STEPS[currentStep].content
                            )}
                        </div>

                        <div className="flex items-center justify-between border-t border-slate-100 pt-4">
                            <div>
                                <span className="text-xs font-bold text-slate-400">
                                    {currentStep + 1} DE {TOUR_STEPS.length}
                                </span>
                            </div>
                            <div className="flex items-center gap-2">
                                {currentStep > 0 && (
                                    <button onClick={prevStep} className="p-2 text-slate-400 hover:text-slate-900 rounded-lg transition-colors">
                                        <ChevronLeft size={20} />
                                    </button>
                                )}
                                <button
                                    onClick={nextStep}
                                    className="flex items-center gap-1 px-4 py-2 bg-brand-600 text-white rounded-xl text-xs font-bold uppercase tracking-widest hover:bg-brand-700 transition-colors shadow-lg shadow-brand-500/30"
                                >
                                    {currentStep === TOUR_STEPS.length - 1 ? 'Concluir' : 'Avançar'} <ChevronRight size={16} />
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </TourContext.Provider>
    );
};
