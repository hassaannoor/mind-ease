'use client';

import { useState, useRef, useEffect } from 'react';
import { Send, User, Bot, Sparkles, Zap, Mic, MicOff } from 'lucide-react';
import { useToast } from '@/context/ToastContext';
import { useVoiceInput } from '@/lib/useVoiceInput';

interface Message {
id: string;
text: string;
sender: 'user' | 'ai';
time: string;
}

export default function ChatPage() {
const [messages, setMessages] = useState<Message[]>([]);
const [input, setInput] = useState('');
const [loading, setLoading] = useState(false);
const [showStarters, setShowStarters] = useState(true);
const messagesEndRef = useRef<HTMLDivElement>(null);

const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
};

useEffect(() => {
    scrollToBottom();
}, [messages]);

const addMessage = (text: string, sender: 'user' | 'ai') => {
    const newMessage: Message = {
        id: Date.now().toString(),
        text,
        sender,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };
    setMessages((prev) => [...prev, newMessage]);
};

const { showToast } = useToast();

const { isListening, isSupported: voiceSupported, toggleListening } = useVoiceInput({
    onTranscript: (text) => setInput((prev) => prev ? `${prev} ${text}` : text),
});

// --- Updated handleSendMessage to call OpenAI ---
const handleSendMessage = async (text: string) => {
    if (!text.trim()) return;

    setShowStarters(false);
    addMessage(text, 'user');
    setInput('');
    setLoading(true);

    try {
        // Convert messages to OpenAI format and include conversation history
        const conversationHistory = messages.map(msg => ({
            role: msg.sender === 'user' ? 'user' : 'assistant',
            content: msg.text
        }));

        const res = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                message: text,
                history: conversationHistory 
            }),
        });

        const data = await res.json();
        if (data.reply) {
            addMessage(data.reply, 'ai'); // add AI reply
        } else {
            addMessage("Sorry, I didn't get a response.", 'ai');
        }
    } catch (error) {
        showToast("I'm having trouble connecting right now. Please try again.", 'error');
        addMessage("I'm having trouble connecting right now.", 'ai');
    } finally {
        setLoading(false);
    }
};

const startConversation = (type: string) => {
    const starters: Record<string, string> = {
        anxious: "I've been feeling really anxious lately.",
        down: "I'm feeling down and don't know why.",
        stressed: "I'm really stressed about work deadlines.",
        talk: "I just need someone to talk to right now"
    };
    handleSendMessage(starters[type]);
};

return (
    <div className="flex flex-col h-[calc(100vh-140px)]">
        <div className="flex-1 flex gap-6 h-full">
            {/* Main Chat Area */}
            <div className="flex-1 glass rounded-[2.5rem] shadow-xl flex flex-col overflow-hidden relative">
                {/* Decorative Background */}
                <div className="absolute top-0 left-0 w-full h-full overflow-hidden -z-10 opacity-30 pointer-events-none">
                    <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/10 rounded-full blur-3xl animate-float"></div>
                    <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-secondary/10 rounded-full blur-3xl animate-float" style={{ animationDelay: '2s' }}></div>
                </div>

                {/* Chat Header */}
                <div className="bg-white/40 backdrop-blur-md p-4 md:p-6 flex justify-between items-center border-b border-white/20">
                    <div className="flex items-center gap-3 md:gap-4">
                        <div className="w-12 h-12 md:w-14 md:h-14 bg-gradient-to-br from-secondary to-secondary-hover text-white rounded-2xl flex items-center justify-center text-2xl shadow-lg shadow-secondary/20">
                            <Bot size={24} className="md:w-7 md:h-7" />
                        </div>
                        <div>
                            <h3 className="font-heading font-bold text-lg md:text-xl text-secondary">MindEase AI</h3>
                            <div className="flex items-center gap-2 text-xs md:text-sm text-foreground/60">
                                <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse shadow-[0_0_8px_rgba(74,222,128,0.5)]"></span>
                                Online & Listening
                            </div>
                        </div>
                    </div>
                    {messages.length > 0 && (
                        <div className="flex gap-3">
                            <button
                                onClick={() => { setMessages([]); setShowStarters(true); }}
                                className="px-3 md:px-4 py-2 bg-white/50 hover:bg-white/80 rounded-xl text-xs md:text-sm font-medium transition-all text-secondary border"
                            >
                                New Chat
                            </button>
                        </div>
                    )}
                </div>                {/* Messages Area */}
                <div className="flex-1 overflow-y-auto p-4 md:p-8 scroll-smooth">
                    {showStarters ? (
                        <div className="h-full flex flex-col items-center justify-center text-center max-w-2xl mx-auto animate-fade-in px-4">
                            <div className="w-16 py-2 bg-primary/10 rounded-full flex items-center justify-center mb-4 md:mb-6 text-primary animate-scale-in">
                                <Sparkles size={6} className="md:w-4 md:h-4" />
                            </div>
                            <h2 className="font-heading text-xl md:text-2xl font-bold text-secondary mb-3 md:mb-4">How can I support you today?</h2>
                            <p className="text-foreground/60 mb-6 md:mb-10 text-base md:text-lg">Select a topic to start a conversation or type your own.</p>

                            <div className="grid grid-cols-2 gap-2 md:gap-3 w-full max-w-lg">
                                {[
                                    { id: 'anxious', icon: '😟', label: "I'm feeling anxious" },
                                    { id: 'down', icon: '😔', label: "I'm feeling down" },
                                    { id: 'stressed', icon: '😤', label: "Stressed about work" },
                                    { id: 'talk', icon: '💭', label: "Just need to talk" },
                                ].map((item, i) => (
                                    <button
                                        key={item.id}
                                        onClick={() => startConversation(item.id)}
                                        className="bg-white/60 backdrop-blur-sm p-2 rounded-xl border border-white/40 shadow-sm hover:shadow-md hover:-translate-y-1 transition-all text-left group animate-slide-up flex gap-2 justify-center items-center"
                                        style={{ animationDelay: `${i * 0.1}s` }}
                                    >
                                        <div className="text-lg group-hover:scale-110 transition-transform duration-300">{item.icon}</div>
                                        <div className="font-bold text-secondary text-xs md:text-sm">{item.label}</div>
                                    </button>
                                ))}
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-8">
                            {messages.map((msg) => (
                                <div key={msg.id} className={`flex gap-4 animate-slide-up ${msg.sender === 'user' ? 'flex-row-reverse' : ''}`}>
                                    <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 shadow-sm ${msg.sender === 'ai' ? 'bg-secondary text-white' : 'bg-primary text-white'}`}>
                                        {msg.sender === 'ai' ? <Bot size={20} /> : <User size={20} />}
                                    </div>
                                    <div className={`max-w-[75%] p-6 rounded-3xl shadow-sm leading-relaxed text-lg ${msg.sender === 'ai' ? 'bg-white/80 backdrop-blur-sm text-secondary rounded-tl-none border border-white/40' : 'bg-primary text-white rounded-tr-none shadow-primary/20'}`}>
                                        <p>{msg.text}</p>
                                        <span className={`text-xs mt-3 block opacity-60 font-medium`}>
                                            {msg.time}
                                        </span>
                                    </div>
                                </div>
                            ))}
                            {loading && (
                                <div className="flex gap-4 animate-fade-in">
                                    <div className="w-10 h-10 bg-secondary text-white rounded-full flex items-center justify-center flex-shrink-0 shadow-sm">
                                        <Bot size={20} />
                                    </div>
                                    <div className="bg-white/80 backdrop-blur-sm p-5 rounded-3xl rounded-tl-none shadow-sm flex items-center gap-2 border border-white/40">
                                        <span className="w-2 h-2 bg-secondary/40 rounded-full animate-bounce"></span>
                                        <span className="w-2 h-2 bg-secondary/40 rounded-full animate-bounce delay-100"></span>
                                        <span className="w-2 h-2 bg-secondary/40 rounded-full animate-bounce delay-200"></span>
                                    </div>
                                </div>
                            )}
                            <div ref={messagesEndRef} />
                        </div>
                    )}
                </div>

                {/* Input Area */}
                <div className="p-4 md:p-6 bg-white/40 backdrop-blur-md border-t border-white/20">
                    <div className="flex gap-2 md:gap-4 bg-white rounded-2xl p-2 shadow-sm border border-gray-100 focus-within:ring-2 focus-within:ring-primary/20 focus-within:border-primary transition-all">
                        <input
                            type="text"
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleSendMessage(input)}
                            placeholder={isListening ? 'Listening...' : 'Type your message here...'}
                            className="flex-1 bg-transparent px-3 md:px-4 py-2 md:py-3 focus:outline-none text-base md:text-lg placeholder:text-gray-400"
                        />
                        {voiceSupported && (
                            <button
                                onClick={toggleListening}
                                title={isListening ? 'Stop recording' : 'Start voice input'}
                                className={`p-2 md:p-3 rounded-xl transition-all flex items-center justify-center ${isListening ? 'bg-red-100 text-red-500 hover:bg-red-200 animate-pulse' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
                            >
                                {isListening ? <MicOff size={18} className="md:w-5 md:h-5" /> : <Mic size={18} className="md:w-5 md:h-5" />}
                            </button>
                        )}
                        <button
                            onClick={() => handleSendMessage(input)}
                            disabled={!input.trim() || loading}
                            className="bg-primary text-white px-4 md:px-6 py-2 md:py-3 rounded-xl font-bold hover:bg-primary-hover transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shadow-lg shadow-primary/20 text-sm md:text-base"
                        >
                            <span className="hidden md:inline">Send</span>
                            <Send size={16} className="md:w-[18px] md:h-[18px]" />
                        </button>
                    </div>
                    <p className="text-center text-xs text-gray-500 mt-4 flex items-center justify-center gap-1 font-medium">
                        <span className="text-primary">🔒</span> Private & Secure • Not a replacement for professional therapy
                    </p>
                </div>
            </div>

            {/* Right Sidebar */}
            <div className="w-80 hidden lg:flex flex-col gap-6">
                {/* Quick Tips */}
                <div className="glass-card p-6 rounded-3xl">
                    <h4 className="font-heading font-bold text-lg mb-4 flex items-center gap-2 text-secondary">
                        <Zap size={20} className="text-accent" /> Quick Tips
                    </h4>
                    <div className="space-y-3">
                        <div className="bg-white/50 p-4 rounded-2xl border border-white/40">
                            <strong className="block text-secondary mb-1 font-bold">Be Open & Honest</strong>
                            <p className="text-sm text-foreground/70">Share your true feelings. This is a judgment-free space.</p>
                        </div>
                        <div className="bg-white/50 p-4 rounded-2xl border border-white/40">
                            <strong className="block text-secondary mb-1 font-bold">Take Your Time</strong>
                            <p className="text-sm text-foreground/70">There's no rush. Respond when you're ready.</p>
                        </div>
                    </div>
                </div>

                {/* Crisis Resources */}
                <div className="bg-gradient-to-br from-secondary to-secondary-hover rounded-3xl p-6 text-white shadow-xl shadow-secondary/20 relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-2xl -translate-y-1/2 translate-x-1/2"></div>
                    <h4 className="font-heading font-bold text-lg mb-3 relative z-10 text-center"> Mental Health Crisis?</h4>
                    <div className="space-y-3 text-sm opacity-95 relative z-10">
                        <div>
                            <strong className="block mb-1.5 opacity-90 text-xs">Umang Pakistan Mental Health Helpline:</strong>
                            <div className="font-mono bg-white/10 py-2 px-3 rounded-xl border border-white/10 text-base tracking-wide">0800-00-444 (Toll-free)</div>
                        </div>
                        <div>
                            <strong className="block mb-1.5 opacity-90 text-xs">Emergency Services:</strong>
                            <div className="font-mono bg-white/10 py-2 px-3 rounded-xl border border-white/10 text-base tracking-wide">1122 (Medical Emergency)</div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
);


}
