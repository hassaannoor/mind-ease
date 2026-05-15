'use client';

import { useState, useEffect, useRef } from 'react';
import { Trash2, Save, Plus, Search, Sparkles, Calendar, X, Lock, Mic, MicOff } from 'lucide-react';
import { useToast } from '@/context/ToastContext';
import { encryptText, decryptText, hasEncryptionKey } from '@/lib/encryption';
import { useVoiceInput } from '@/lib/useVoiceInput';

interface JournalEntry {
    _id: string;
    title: string;
    content: string;
    mood: string;
    createdAt: string;
    sentiment?: string;
    moodManuallySet?: boolean;
}

export default function JournalPage() {
    const [entries, setEntries] = useState<JournalEntry[]>([]);
    const [selectedEntry, setSelectedEntry] = useState<JournalEntry | null>(null);
    const [formData, setFormData] = useState({
        title: '',
        content: '',
        mood: '😐',
    });    const [showAIAnalysis, setShowAIAnalysis] = useState(false);
    const [loading, setLoading] = useState(false);
    const [moodManuallySet, setMoodManuallySet] = useState(false);
    const [aiAnalysisResult, setAiAnalysisResult] = useState<string>('');
    const [analyzingAI, setAnalyzingAI] = useState(false);
    const [isEncrypted, setIsEncrypted] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
    const scrollContainerRef = useRef<HTMLDivElement>(null);

    const moods = ['😢', '😟', '😐', '😊', '😄'];    useEffect(() => {
        fetchEntries();
        setIsEncrypted(hasEncryptionKey());
    }, []);

    // Scroll handler for infinite loading
    useEffect(() => {
        const handleScroll = () => {
            if (!scrollContainerRef.current || !hasMore || loadingMore) return;

            const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
            // Load more when scrolled to 80% of the container
            if (scrollTop + clientHeight >= scrollHeight * 0.8) {
                loadMoreEntries();
            }
        };

        const container = scrollContainerRef.current;
        if (container) {
            container.addEventListener('scroll', handleScroll);
            return () => container.removeEventListener('scroll', handleScroll);
        }
    }, [hasMore, loadingMore, page]);    // Sentiment analysis effect with debounce
    useEffect(() => {
        // Clear existing timer
        if (debounceTimerRef.current) {
            clearTimeout(debounceTimerRef.current);
        }

        // Only analyze if mood hasn't been manually set and content exists
        if (!moodManuallySet && formData.content.trim().length > 10) {
            debounceTimerRef.current = setTimeout(async () => {
                try {
                    const response = await fetch('/api/sentiment', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ text: formData.content }),
                    });
                    
                    const data = await response.json();
                    if (data.mood) {
                        setFormData(prev => ({ ...prev, mood: data.mood }));
                    }
                } catch (error) {
                    console.error('Sentiment analysis failed:', error);
                }
            }, 100); // 100ms debounce
        }

        // Auto-close AI analysis if content becomes too short
        if (showAIAnalysis && formData.content.trim().length < 20) {
            setShowAIAnalysis(false);
            setAiAnalysisResult('');
        }

        return () => {
            if (debounceTimerRef.current) {
                clearTimeout(debounceTimerRef.current);
            }
        };
    }, [formData.content, moodManuallySet, showAIAnalysis]);

    const fetchEntries = async (pageNum = 1, append = false) => {
        try {
            if (!append) setLoading(true);
            const res = await fetch(`/api/journal?page=${pageNum}&limit=10`);
            const data = await res.json();
            if (data.journals) {
                // Decrypt all journal entries
                const decryptedJournals = await Promise.all(
                    data.journals.map(async (journal: JournalEntry) => {
                        try {
                            return {
                                ...journal,
                                title: await decryptText(journal.title),
                                content: await decryptText(journal.content),
                            };
                        } catch (error) {
                            console.error('Failed to decrypt journal entry:', error);
                            return {
                                ...journal,
                                title: '[Encrypted - Unable to decrypt]',
                                content: '[This entry cannot be decrypted. The encryption key may have changed.]',
                            };
                        }
                    })
                );
                
                if (append) {
                    setEntries(prev => [...prev, ...decryptedJournals]);
                } else {
                    setEntries(decryptedJournals);
                }
                
                setHasMore(data.pagination?.hasMore || false);
            }
        } catch (error) {
            console.error('Failed to fetch journals', error);
        } finally {
            setLoading(false);
            setLoadingMore(false);
        }
    };

    const loadMoreEntries = async () => {
        if (loadingMore || !hasMore) return;
        setLoadingMore(true);
        const nextPage = page + 1;
        setPage(nextPage);
        await fetchEntries(nextPage, true);
    };

    const { showToast } = useToast();

    const { isListening, isSupported: voiceSupported, toggleListening } = useVoiceInput({
        onTranscript: (text) => setFormData((prev) => ({
            ...prev,
            content: prev.content ? `${prev.content} ${text}` : text,
        })),
        continuous: true,
    });

    const handleSave = async () => {
        if (!formData.content) return;
        setLoading(true);

        try {
            // Encrypt title and content before saving
            const encryptedTitle = await encryptText(formData.title || 'Untitled Entry');
            const encryptedContent = await encryptText(formData.content);

            // Get final sentiment analysis (using unencrypted content for analysis)
            const sentimentRes = await fetch('/api/sentiment', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: formData.content }),
            });
            const sentimentData = await sentimentRes.json();

            // If editing existing entry, update it; otherwise create new
            if (selectedEntry) {
                // Update existing entry
                const res = await fetch(`/api/journal/${selectedEntry._id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        title: encryptedTitle,
                        content: encryptedContent,
                        mood: formData.mood,
                        sentiment: sentimentData.sentiment || 'Neutral',
                        moodManuallySet,
                    }),
                });

                if (res.ok) {
                    setPage(1);
                    setHasMore(true);
                    await fetchEntries(1, false);
                    showToast('Journal entry updated successfully!', 'success');
                    setSelectedEntry(null);
                    setFormData({ title: '', content: '', mood: '😐' });
                    setMoodManuallySet(false);
                }
            } else {
                // Create new entry
                const res = await fetch('/api/journal', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        title: encryptedTitle,
                        content: encryptedContent,
                        mood: formData.mood,
                        sentiment: sentimentData.sentiment || 'Neutral',
                        moodManuallySet,
                    }),
                });

                if (res.ok) {
                    setPage(1);
                    setHasMore(true);
                    await fetchEntries(1, false);
                    showToast('Journal entry saved successfully!', 'success');
                    setFormData({ title: '', content: '', mood: '😐' });
                    setMoodManuallySet(false);
                }
            }
        } catch (error) {
            console.error('Failed to save journal', error);
            showToast('Failed to save journal entry.', 'error');
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async () => {
        if (!selectedEntry) return;
        
        if (!confirm('Are you sure you want to delete this entry?')) return;

        try {
            const res = await fetch(`/api/journal/${selectedEntry._id}`, {
                method: 'DELETE',
            });

            if (res.ok) {
                setPage(1);
                setHasMore(true);
                await fetchEntries(1, false);
                showToast('Journal entry deleted successfully!', 'success');
                // Reset to new entry mode
                setSelectedEntry(null);
                setFormData({ title: '', content: '', mood: '😐' });
                setMoodManuallySet(false);
            }
        } catch (error) {
            console.error('Failed to delete journal', error);
            showToast('Failed to delete journal entry.', 'error');
        }
    };

    const handleSelectEntry = (entry: JournalEntry) => {
        setSelectedEntry(entry);
        setFormData({
            title: entry.title,
            content: entry.content,
            mood: entry.mood || '😐',
        });
        setMoodManuallySet(entry.moodManuallySet || false);
    };

    const handleNewEntry = () => {
        setSelectedEntry(null);
        setFormData({ title: '', content: '', mood: '😐' });
        setMoodManuallySet(false);
    };    const handleMoodChange = (mood: string) => {
        setFormData({ ...formData, mood });
        setMoodManuallySet(true);
    };    const handleToggleAIAnalysis = async () => {
        // Don't allow toggle if content is too short
        if (formData.content.trim().length < 20) {
            showToast('Please write at least 20 characters to enable AI analysis', 'info');
            return;
        }

        const newState = !showAIAnalysis;
        setShowAIAnalysis(newState);

        // If turning on and we have content, analyze it
        if (newState && formData.content.trim().length >= 20) {
            setAnalyzingAI(true);
            try {
                const response = await fetch('/api/analyze-journal', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ content: formData.content }),
                });

                const data = await response.json();
                if (data.analysis) {
                    setAiAnalysisResult(data.analysis);
                } else {
                    setAiAnalysisResult('Unable to generate analysis. Please try again.');
                }
            } catch (error) {
                console.error('AI Analysis failed:', error);
                setAiAnalysisResult('Failed to analyze entry. Please check your connection and try again.');
            } finally {
                setAnalyzingAI(false);
            }
        }
    };

    // Filter entries based on search query
    const filteredEntries = entries.filter((entry) => {
        if (!searchQuery.trim()) return true;
        const query = searchQuery.toLowerCase();
        return (
            entry.title.toLowerCase().includes(query) ||
            entry.content.toLowerCase().includes(query)
        );
    });

    return (
        <div className="flex flex-col">
            {/* Encryption Status Banner */}
            {isEncrypted && (
                <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-2xl flex items-center gap-3">
                    <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
                        <Lock size={16} className="text-green-600" />
                    </div>
                    <div className="flex-1">
                        <p className="text-sm font-medium text-green-900">
                            End-to-End Encryption Active
                        </p>
                        <p className="text-xs text-green-700">
                            Your journal entries are encrypted before being saved. Only you can read them.
                        </p>
                    </div>
                </div>
            )}

            <div className="flex-1 flex flex-col lg:flex-row gap-4 md:gap-8 h-full">

                {/* Editor Section */}
                <div className="flex-[1.5] glass rounded-3xl md:rounded-[2.5rem] shadow-xl flex flex-col overflow-hidden relative">
                    {/* Decorative Background */}
                    <div className="absolute top-0 right-0 w-96 h-96 bg-primary/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none"></div>                    <div className={`p-4 md:p-8 border-b border-gray-100 flex flex-col md:flex-row justify-between md:items-center gap-3 md:gap-0 bg-white/50 backdrop-blur-sm transition-all ${selectedEntry ? 'bg-amber-50/80 border-amber-200' : ''}`}>
                        <div>
                            <div className="flex items-center gap-2 md:gap-3 mb-1">
                                <h2 className="font-heading text-2xl md:text-3xl font-bold text-secondary">
                                    {selectedEntry ? 'Edit Entry' : 'Write Entry'}
                                </h2>
                                {selectedEntry && (
                                    <span className="px-3 py-1 bg-amber-500 text-white text-xs font-bold rounded-full uppercase tracking-wider">
                                        Editing
                                    </span>
                                )}
                            </div>
                            <p className="text-foreground/60 text-sm font-medium">
                                {selectedEntry ? 'Update your existing journal entry' : 'Express your thoughts freely'}
                            </p>
                        </div>
                        <div className="flex gap-2 absolute top-4 right-2 sm:relative flex-row-reverse">
                            <button
                                onClick={handleSave}
                                disabled={loading}
                                className="bg-primary text-white px-4 md:px-6 py-2 md:py-3 rounded-xl font-bold hover:bg-primary-hover transition-all flex items-center gap-2 disabled:opacity-70 shadow-lg shadow-primary/20 text-sm md:text-base"
                            >
                                <Save size={16} className="md:w-[18px] md:h-[18px]" /> {loading ? 'Saving...' : selectedEntry ? 'Update' : 'Save'}
                            </button>
                            {selectedEntry && (
                                <button 
                                    onClick={handleDelete}
                                    className="p-2 md:p-3 bg-white rounded-xl border border-gray-200 text-gray-400 hover:text-error hover:border-error hover:bg-error/5 transition-all"
                                >
                                    <Trash2 size={18} className="md:w-5 md:h-5" />
                                </button>
                            )}
                        </div>
                    </div>

                    <div className=" p-6 md:p-8 flex flex-col gap-6 relative">
                        {selectedEntry && (
                                <button
                                    onClick={handleNewEntry}
                                    className="p-3 bg-white rounded-full shadow-xl w-10 h-10 flex justify-center items-center absolute right-0 top-0 m-8 border border-gray-200 text-gray-400 hover:text-gray-600 hover:border-gray-300 hover:bg-gray-50 transition-all"
                                    title="Cancel Edit"
                                >
                                    <X size={20} />
                                </button>
                        )}
                        <input
                            type="text"
                            placeholder="Untitled Entry"
                            className="text-3xl md:text-4xl font-heading font-bold bg-transparent border-none p-0 focus:outline-none placeholder:text-gray-300 text-secondary"
                            value={formData.title}
                            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                        />

                        <div className="flex flex-wrap gap-4 items-center">
                            <div className="bg-white/60 border border-white/40 px-4 py-2 rounded-xl flex items-center gap-2 text-sm font-bold text-secondary shadow-sm">
                                <Calendar size={16} className="text-primary" />
                                <span>{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}</span>
                            </div>                            <div className="bg-white/60 border border-white/40 px-4 py-2 rounded-xl flex items-center gap-3 text-sm font-bold text-secondary shadow-sm">
                                <span>Mood:</span>
                                <div className="flex gap-1">
                                    {moods.map((m) => (
                                        <button
                                            key={m}
                                            onClick={() => handleMoodChange(m)}
                                            className={`w-8 h-8 flex items-center justify-center rounded-lg hover:scale-125 transition-transform ${formData.mood === m ? 'bg-white shadow-md scale-110' : 'opacity-50 hover:opacity-100'
                                                }`}
                                        >
                                            {m}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <div className="relative">
                            <textarea
                                placeholder={isListening ? 'Listening... speak your thoughts' : 'Start writing your thoughts here...'}
                                className="flex-1 w-full resize-none bg-transparent border-none p-0 focus:outline-none text-lg leading-loose text-foreground/80 placeholder:text-gray-300 min-h-[200px]"
                                value={formData.content}
                                onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                            ></textarea>
                            {voiceSupported && (
                                <button
                                    onClick={toggleListening}
                                    title={isListening ? 'Stop recording' : 'Start voice input'}
                                    className={`absolute bottom-2 right-2 p-2 rounded-xl transition-all flex items-center gap-2 text-sm font-medium ${isListening ? 'bg-red-100 text-red-500 hover:bg-red-200 animate-pulse' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
                                >
                                    {isListening ? (
                                        <><MicOff size={16} /><span>Stop</span></>
                                    ) : (
                                        <><Mic size={16} /><span>Dictate</span></>
                                    )}
                                </button>
                            )}
                        </div>                        <div className="bg-gradient-to-br from-surface-alt to-white rounded-2xl p-2 border border-white/50 shadow-sm">                            <div className="flex items-center justify-between">
                                <button
                                    onClick={handleToggleAIAnalysis}
                                    disabled={analyzingAI || formData.content.trim().length < 20}
                                    className="flex items-center gap-3 group disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    <div className={`w-12 h-7 rounded-full relative transition-colors duration-300 ${showAIAnalysis && formData.content.trim().length >= 20 ? 'bg-secondary' : 'bg-gray-200'}`}>
                                        <div className={`w-5 h-5 bg-white rounded-full absolute top-1 shadow-sm transition-all duration-300 ${showAIAnalysis && formData.content.trim().length >= 20 ? 'left-6' : 'left-1'}`}></div>
                                    </div>
                                    <span className="font-bold text-secondary flex items-center gap-2 group-hover:text-primary transition-colors">
                                        <Sparkles size={18} className={showAIAnalysis && formData.content.trim().length >= 20 ? 'text-accent' : 'text-gray-400'} />
                                        AI Insights
                                    </span>
                                </button>

                                {/* Live character count */}
                                <div className={`text-xs font-semibold transition-colors ${formData.content.trim().length >= 20 ? 'text-green-600' : 'text-gray-400'}`}>
                                    {formData.content.trim().length} / 20 characters
                                </div>
                            </div>

                            {/* Only show analysis result if content is sufficient */}
                            {showAIAnalysis && formData.content.trim().length >= 20 && (
                                <div className="mt-6 bg-white p-6 rounded-xl border border-gray-100 shadow-sm text-sm leading-relaxed animate-fade-in relative overflow-hidden">
                                    <div className="absolute top-0 left-0 w-1 h-full bg-accent"></div>
                                    <strong className="text-secondary mb-2 font-heading text-lg flex items-center gap-2">
                                        <Sparkles size={20} className="text-accent" />
                                        Analysis Result
                                    </strong>
                                    {analyzingAI ? (
                                        <div className="flex items-center gap-3 text-foreground/60">
                                            <div className="w-4 h-4 border-2 border-primary/20 border-t-primary rounded-full animate-spin"></div>
                                            Analyzing your entry...
                                        </div>
                                    ) : (
                                        <div className="text-foreground/70 space-y-3">
                                            {aiAnalysisResult.split('\n').map((line, idx) => (
                                                <p key={idx}>{line}</p>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Entries List Section */}
                <div className="flex-1 glass rounded-3xl md:rounded-[2.5rem] shadow-xl flex flex-col overflow-hidden h-full border border-white/40">
                    <div className="p-6 border-b border-gray-100 bg-white/50 backdrop-blur-sm">
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="font-heading text-xl font-bold text-secondary flex items-center gap-2">
                                Your Journal
                            </h2>
                            <button onClick={handleNewEntry} className="bg-secondary text-white p-2 rounded-xl hover:bg-secondary-hover transition-colors shadow-lg shadow-secondary/20">
                                <Plus size={20} />
                            </button>
                        </div>
                        <div className="relative">
                            <Search size={18} className="absolute left-4 top-3.5 text-gray-400" />
                            <input
                                type="text"
                                placeholder="Search entries..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full pl-11 pr-4 py-3 rounded-xl bg-white border-none shadow-sm focus:ring-2 focus:ring-primary/20 focus:outline-none text-sm font-medium"
                            />
                        </div>
                    </div>

                    <div 
                        ref={scrollContainerRef}
                        className="flex-1 p-4 space-y-3 bg-surface-alt/30 min-h-[400px] md:min-h-[500px] overflow-y-auto"
                    >
                        {filteredEntries.map((entry, i) => (
                            <div
                                key={entry._id}
                                onClick={() => handleSelectEntry(entry)}
                                className={`p-5 rounded-2xl cursor-pointer transition-all duration-300 border hover:-translate-y-1 hover:shadow-md ${selectedEntry?._id === entry._id
                                    ? 'bg-white border-primary shadow-lg shadow-primary/5 ring-1 ring-primary'
                                    : 'bg-white/60 border-transparent hover:bg-white'
                                    } animate-slide-up`}
                                style={{ animationDelay: `${i * 0.05}s` }}
                            >
                                <div className="flex justify-between items-start mb-2">
                                    <h3 className={`font-bold truncate pr-2 text-lg ${selectedEntry?._id === entry._id ? 'text-primary' : 'text-secondary'}`}>
                                        {entry.title || 'Untitled Entry'}
                                    </h3>
                                    <span className="text-2xl filter drop-shadow-sm">{entry.mood || '😐'}</span>
                                </div>
                                <div className="text-xs font-bold text-gray-400 mb-3 uppercase tracking-wider">
                                    {new Date(entry.createdAt).toLocaleDateString()}
                                </div>
                                <p className="text-sm line-clamp-2 text-foreground/60 leading-relaxed">
                                    {entry.content}
                                </p>
                            </div>
                        ))}

                        {loadingMore && (
                            <div className="text-center py-4">
                                <div className="inline-flex items-center gap-2 text-sm text-gray-500">
                                    <div className="w-4 h-4 border-2 border-primary/20 border-t-primary rounded-full animate-spin"></div>
                                    Loading more entries...
                                </div>
                            </div>
                        )}

                        {filteredEntries.length === 0 && entries.length > 0 && !loading && (
                            <div className="text-center py-10 text-gray-400">
                                <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4 text-2xl">🔍</div>
                                <p className="font-medium">No entries found matching "{searchQuery}"</p>
                            </div>
                        )}

                        {entries.length === 0 && !loading && (
                            <div className="text-center py-10 text-gray-400">
                                <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4 text-2xl">📝</div>
                                <p className="font-medium">No entries yet. Start writing!</p>
                            </div>
                        )}

                        {loading && entries.length === 0 && (
                            <div className="text-center py-10 text-gray-400">
                                <div className="w-4 h-4 border-2 border-primary/20 border-t-primary rounded-full animate-spin mx-auto mb-4"></div>
                                <p className="font-medium">Loading entries...</p>
                            </div>
                        )}
                    </div>
                </div>

            </div>
        </div>
    );
}
