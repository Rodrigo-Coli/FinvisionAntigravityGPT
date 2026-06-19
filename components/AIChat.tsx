import React, { useState, useRef, useEffect } from 'react';
import { Send, Sparkles, Loader2, Bot, User, Trash2 } from 'lucide-react';

interface ChatMessage {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
}

const AIChat: React.FC<{ userId: string, startDate?: string, endDate?: string }> = ({ userId, startDate, endDate }) => {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const chatContainerRef = useRef<HTMLDivElement>(null);

    // Initial greeting
    useEffect(() => {
        if (messages.length === 0) {
            setMessages([{
                id: 'init',
                role: 'assistant',
                content: 'Olá! Sou o seu Assistente FinVision. Como posso ajudar a analisar suas finanças hoje?',
                timestamp: new Date()
            }]);
        }
    }, [messages.length]);

    // Scroll only the chat container, NOT the whole page
    const scrollToBottom = () => {
        if (chatContainerRef.current) {
            chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
        }
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    const handleSend = async (text: string) => {
        const query = text.trim();
        if (!query || isLoading || !userId) return;

        const userMsg: ChatMessage = {
            id: Date.now().toString(),
            role: 'user',
            content: query,
            timestamp: new Date()
        };

        setMessages(prev => [...prev, userMsg]);
        setInput('');
        setIsLoading(true);

        try {
            const response = await fetch('/api/finvision-chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId,
                    message: query,
                    startDate,
                    endDate,
                    history: messages.map(m => ({ role: m.role, content: m.content }))
                })
            });

            let data;
            const textRes = await response.text();
            try {
                data = JSON.parse(textRes);
            } catch (e) {
                // Se não for JSON, pegamos o início do texto da resposta (que pode conter o erro do Vercel)
                const errorSnippet = textRes.substring(0, 100);
                throw new Error(`Serviço indisponível. Detalhes: ${errorSnippet}...`);
            }

            if (!response.ok) throw new Error(data.error || 'Erro de comunicação com AI');

            const assistantMsg: ChatMessage = {
                id: (Date.now() + 1).toString(),
                role: 'assistant',
                content: data.reply,
                timestamp: new Date()
            };

            setMessages(prev => [...prev, assistantMsg]);
        } catch (error: any) {
            const errorMsg: ChatMessage = {
                id: (Date.now() + 1).toString(),
                role: 'assistant',
                content: `Desculpe, ocorreu um erro: ${error.message}`,
                timestamp: new Date()
            };
            setMessages(prev => [...prev, errorMsg]);
        } finally {
            setIsLoading(false);
        }
    };

    const quickPrompts = [
        "Resumo dos meus gastos este mês",
        "Quanto gastei de Mercado?",
        "Quais contas vencem essa semana?",
        "Dicas para economizar"
    ];

    return (
        <div className="bg-white border border-slate-100 rounded-[24px] sm:rounded-[32px] shadow-sm overflow-hidden flex flex-col h-full min-w-0">
            {/* Header */}
            <div className="p-4 sm:p-6 border-b border-slate-50 flex items-center justify-between bg-brand-900 text-white">
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 sm:w-10 sm:h-10 bg-white/10 rounded-xl flex items-center justify-center">
                        <Sparkles size={18} className="text-brand-400" />
                    </div>
                    <div>
                        <h3 className="font-bold text-xs sm:text-sm tracking-tight">FinVision AI</h3>
                        <p className="text-[8px] sm:text-[9px] font-bold text-white/50 uppercase tracking-widest">Seu private banker</p>
                    </div>
                </div>
                <button
                    onClick={() => setMessages([messages[0]])}
                    className="p-2 bg-white/5 hover:bg-white/10 rounded-lg transition-colors text-white/50 hover:text-white"
                    title="Limpar Conversa"
                >
                    <Trash2 size={16} />
                </button>
            </div>

            {/* Chat Area */}
            <div ref={chatContainerRef} className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 sm:space-y-6 bg-slate-50/30">
                {messages.map((msg) => (
                    <div key={msg.id} className={`flex gap-2 sm:gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        {msg.role === 'assistant' && (
                            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-brand-50 flex items-center justify-center shrink-0 border border-brand-100 mt-1">
                                <Bot size={12} className="text-brand-600" />
                            </div>
                        )}
                        <div className={`min-w-0 max-w-[80%] rounded-[20px] p-3 sm:p-4 ${msg.role === 'user'
                            ? 'bg-brand-600 text-white rounded-br-none shadow-brand-500/20 shadow-lg'
                            : 'bg-white border border-slate-100 text-slate-700 shadow-sm rounded-bl-none'
                            }`}>
                            <div className="text-xs sm:text-sm leading-relaxed break-words overflow-wrap-anywhere">
                                {msg.content.split('\n').map((line, i) => (
                                    <p key={i} className="mb-1 last:mb-0" dangerouslySetInnerHTML={{ __html: line.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') }} />
                                ))}
                            </div>
                            <span className={`text-[7px] sm:text-[8px] font-bold uppercase tracking-widest mt-2 block opacity-50 ${msg.role === 'user' ? 'text-right' : 'text-left'}`}>
                                {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                        </div>
                    </div>
                ))}
                {isLoading && (
                    <div className="flex gap-2 sm:gap-3">
                        <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-brand-50 flex items-center justify-center shrink-0 border border-brand-100">
                            <Bot size={12} className="text-brand-600" />
                        </div>
                        <div className="bg-white border border-slate-100 p-3 sm:p-4 rounded-[20px] rounded-bl-none shadow-sm flex items-center gap-2 text-brand-600">
                            <Loader2 size={14} className="animate-spin" />
                            <span className="text-[9px] sm:text-[10px] font-bold uppercase tracking-widest">Analisando seus dados...</span>
                        </div>
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>

            {/* Quick Prompts */}
            {messages.length <= 1 && (
                <div className="px-3 sm:px-6 pb-2 pt-2 bg-slate-50/30 flex flex-wrap gap-2">
                    {quickPrompts.map((prompt, i) => (
                        <button
                            key={i}
                            onClick={() => handleSend(prompt)}
                            className="px-3 py-2 bg-white border border-slate-200 hover:border-brand-300 rounded-full text-[10px] font-bold text-slate-600 transition-colors shadow-sm"
                        >
                            {prompt}
                        </button>
                    ))}
                </div>
            )}

            {/* Input Area */}
            <div className="p-4 border-t border-slate-50 bg-white">
                <form
                    onSubmit={(e) => { e.preventDefault(); handleSend(input); }}
                    className="flex items-center gap-2 bg-slate-50 p-2 pl-4 rounded-[20px] border border-slate-100 focus-within:border-brand-300 focus-within:ring-2 focus-within:ring-brand-500/10 transition-all"
                >
                    <input
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        placeholder="Pergunte sobre suas financas..."
                        className="flex-1 bg-transparent border-none text-sm font-medium text-slate-900 focus:outline-none placeholder:text-slate-400"
                        disabled={isLoading}
                    />
                    <button
                        type="submit"
                        disabled={!input.trim() || isLoading}
                        className="w-10 h-10 rounded-xl bg-brand-600 text-white flex items-center justify-center disabled:opacity-50 disabled:bg-slate-300 transition-colors hover:bg-brand-700"
                        aria-label="Enviar mensagem"
                    >
                        <Send size={16} className={input.trim() ? "translate-x-0.5 -translate-y-0.5" : ""} />
                    </button>
                </form>
            </div>
        </div>
    );
};

export default AIChat;
