import React, { useState, useEffect } from 'react';
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged, 
  User, 
  signOut 
} from 'firebase/auth';
import { 
  collection, 
  addDoc, 
  query, 
  where, 
  orderBy, 
  onSnapshot, 
  Timestamp,
  doc,
  setDoc,
  getDoc,
  deleteDoc,
  getDocFromServer
} from 'firebase/firestore';
import { auth, db } from './firebase';
import { 
  structureNote, 
  StructuredNote, 
  getEmbedding, 
  cosineSimilarity,
  suggestMerge,
  MergeSuggestion,
  askNotes,
  detectPattern,
  PatternInsight,
  generateWeeklyReport,
  WeeklyReport,
  generateTopicInsight,
  generateEvolutionInsight,
  EvolutionInsight
} from './services/gemini';
import { 
  Plus, 
  LogOut, 
  BookOpen, 
  Tag, 
  ChevronRight, 
  ChevronDown,
  ChevronUp,
  Loader2, 
  Search,
  Hash,
  Clock,
  Sparkles,
  Copy,
  Check,
  Edit2,
  Save,
  X,
  Link as LinkIcon,
  Wand2,
  Layers,
  MessageSquare,
  ArrowRight,
  Merge,
  BrainCircuit,
  Moon,
  Sun,
  Share2,
  Calendar,
  FileText,
  History,
  TrendingUp,
  Menu,
  MoreVertical,
  Trash2
} from 'lucide-react';
import { format } from 'date-fns';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import Markdown from 'react-markdown';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean, error: Error | null }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      let message = "Something went wrong.";
      try {
        const parsed = JSON.parse(this.state.error?.message || "");
        if (parsed.error) message = `Firestore Error: ${parsed.error}`;
      } catch {
        message = this.state.error?.message || message;
      }

      return (
        <div className="min-h-screen bg-lumina-bg flex items-center justify-center p-6">
          <div className="bg-lumina-surface p-8 rounded-[32px] shadow-xl border border-lumina-border max-w-md w-full text-center space-y-4">
            <div className="w-16 h-16 bg-rose-500/10 rounded-full flex items-center justify-center mx-auto">
              <X className="w-8 h-8 text-rose-500" />
            </div>
            <h2 className="text-xl font-serif text-lumina-text">Unexpected Error</h2>
            <p className="text-sm text-lumina-text/60 leading-relaxed">
              {message}
            </p>
            <button 
              onClick={() => window.location.reload()}
              className="w-full bg-lumina-accent text-white rounded-full py-3 font-medium hover:opacity-90 transition-all"
            >
              Reload Application
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

interface Note {
  id: string;
  content: string;
  structuredData?: StructuredNote;
  userId: string;
  createdAt: Timestamp;
  source?: string;
  embedding?: number[];
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState<Note[]>([]);
  const [newNote, setNewNote] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedNote, setSelectedNote] = useState<Note | null>(null);
  const [copied, setCopied] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState('');
  const [relatedNotes, setRelatedNotes] = useState<Note[]>([]);
  const [activeTab, setActiveTab] = useState<'recent' | 'topics'>('recent');
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);
  const [mergeSuggestion, setMergeSuggestion] = useState<MergeSuggestion | null>(null);
  const [isMerging, setIsMerging] = useState(false);
  const [chatQuery, setChatQuery] = useState('');
  const [chatResponse, setChatResponse] = useState<string | null>(null);
  const [isChatting, setIsChatting] = useState(false);
  const [patternInsight, setPatternInsight] = useState<PatternInsight | null>(null);
  const [isDetectingPattern, setIsDetectingPattern] = useState(false);
  const [isChatMode, setIsChatMode] = useState(false);
  const [shareStatus, setShareStatus] = useState<'idle' | 'copied' | 'shared'>('idle');
  const [weeklyReport, setWeeklyReport] = useState<WeeklyReport | null>(null);
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [showMoreInsights, setShowMoreInsights] = useState(false);
  const [topicInsight, setTopicInsight] = useState<string | null>(null);
  const [isGeneratingTopicInsight, setIsGeneratingTopicInsight] = useState(false);
  const [evolutionInsight, setEvolutionInsight] = useState<EvolutionInsight | null>(null);
  const [isGeneratingEvolution, setIsGeneratingEvolution] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [showMoreActions, setShowMoreActions] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    if (typeof window !== 'undefined') {
      return (localStorage.getItem('theme') as 'light' | 'dark') || 'light';
    }
    return 'light';
  });

  useEffect(() => {
    const root = window.document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    localStorage.setItem('theme', theme);
  }, [theme]);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  useEffect(() => {
    async function testConnection() {
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
      } catch (error) {
        if (error instanceof Error && error.message.includes('the client is offline')) {
          console.error("Please check your Firebase configuration.");
        }
      }
    }
    testConnection();

    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      setLoading(false);
      if (u) {
        // Sync user profile
        const userRef = doc(db, 'users', u.uid);
        try {
          const userSnap = await getDoc(userRef);
          if (!userSnap.exists()) {
            await setDoc(userRef, {
              email: u.email,
              displayName: u.displayName,
              role: 'user'
            });
          }
        } catch (error) {
          handleFirestoreError(error, OperationType.WRITE, 'users');
        }
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) {
      setNotes([]);
      return;
    }

    const q = query(
      collection(db, 'notes'),
      where('userId', '==', user.uid),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedNotes = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Note[];
      setNotes(fetchedNotes);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'notes');
    });

    return () => unsubscribe();
  }, [user]);

  useEffect(() => {
    if (!selectedNote || !selectedNote.embedding || notes.length < 2) {
      setRelatedNotes([]);
      setEvolutionInsight(null);
      return;
    }

    const similarities = notes
      .filter(n => n.id !== selectedNote.id && n.embedding)
      .map(n => ({
        note: n,
        similarity: cosineSimilarity(selectedNote.embedding!, n.embedding!)
      }))
      .filter(s => s.similarity > 0.7) // Threshold for "related"
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, 3)
      .map(s => s.note);

    setRelatedNotes(similarities);

    // Generate Evolution Insight
    if (similarities.length >= 2) {
      const handleEvolution = async () => {
        setIsGeneratingEvolution(true);
        try {
          const timelineNotes = [selectedNote, ...similarities]
            .sort((a, b) => a.createdAt.toMillis() - b.createdAt.toMillis())
            .map(n => ({
              content: n.content,
              date: format(n.createdAt.toDate(), 'MMM dd, yyyy')
            }));
          
          const insight = await generateEvolutionInsight(timelineNotes);
          setEvolutionInsight(insight);
        } catch (error) {
          console.error("Error generating evolution insight:", error);
        } finally {
          setIsGeneratingEvolution(false);
        }
      };
      handleEvolution();
    } else {
      setEvolutionInsight(null);
    }

    // Check for merge suggestion if similarity is very high
    const topSimilarity = similarities[0];
    if (topSimilarity && cosineSimilarity(selectedNote.embedding!, topSimilarity.embedding!) > 0.92) {
      handleSuggestMerge(selectedNote, topSimilarity);
    } else {
      setMergeSuggestion(null);
    }

    // Detect pattern with the most related note
    if (topSimilarity) {
      handleDetectPattern(selectedNote, topSimilarity);
    } else {
      setPatternInsight(null);
    }
  }, [selectedNote, notes]);

  const handleSuggestMerge = async (noteA: Note, noteB: Note) => {
    try {
      const suggestion = await suggestMerge(noteA.content, noteB.content);
      setMergeSuggestion(suggestion);
    } catch (error) {
      console.error("Error suggesting merge:", error);
    }
  };

  const handleDetectPattern = async (noteA: Note, noteB: Note) => {
    setIsDetectingPattern(true);
    try {
      const insight = await detectPattern(noteA.content, noteB.content);
      setPatternInsight(insight);
    } catch (error) {
      console.error("Error detecting pattern:", error);
    } finally {
      setIsDetectingPattern(false);
    }
  };

  const handleExecuteMerge = async (noteToKeep: Note, noteToDelete: Note, mergedContent: string) => {
    setIsMerging(true);
    try {
      const structured = await structureNote(mergedContent);
      const embedding = await getEmbedding(mergedContent);
      
      const noteRef = doc(db, 'notes', noteToKeep.id);
      try {
        await setDoc(noteRef, {
          content: mergedContent,
          structuredData: structured,
          embedding: embedding,
          createdAt: Timestamp.now() // Update timestamp to reflect merge
        }, { merge: true });

        await deleteDoc(doc(db, 'notes', noteToDelete.id));
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, 'notes');
      }
      
      setSelectedNote({
        ...noteToKeep,
        content: mergedContent,
        structuredData: structured,
        embedding: embedding
      });
      setMergeSuggestion(null);
    } catch (error) {
      console.error("Error executing merge:", error);
    } finally {
      setIsMerging(false);
    }
  };

  const handleAskNotes = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatQuery.trim() || notes.length === 0) return;

    setIsChatting(true);
    setChatResponse(null);
    try {
      const context = notes.map(n => n.content);
      const response = await askNotes(chatQuery, context);
      setChatResponse(response);
    } catch (error) {
      console.error("Error chatting with notes:", error);
      setChatResponse("Sorry, I encountered an error while searching your notes.");
    } finally {
      setIsChatting(false);
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Quick capture shortcut: "/"
      if (e.key === '/' && document.activeElement?.tagName !== 'TEXTAREA' && document.activeElement?.tagName !== 'INPUT') {
        e.preventDefault();
        const textarea = document.querySelector('textarea');
        textarea?.focus();
      }
      
      // Save note shortcut: Ctrl + Enter
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && document.activeElement?.tagName === 'TEXTAREA') {
        e.preventDefault();
        const form = document.querySelector('form');
        form?.requestSubmit();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    if (selectedTopic && user) {
      const fetchTopicInsight = async () => {
        setIsGeneratingTopicInsight(true);
        setTopicInsight(null);
        try {
          const topicNotes = notes.filter(n => n.structuredData?.category === selectedTopic);
          if (topicNotes.length >= 2) {
            const insight = await generateTopicInsight(selectedTopic, topicNotes.map(n => n.content));
            setTopicInsight(insight);
          }
        } catch (error) {
          console.error("Error generating topic insight:", error);
        } finally {
          setIsGeneratingTopicInsight(false);
        }
      };
      fetchTopicInsight();
    } else {
      setTopicInsight(null);
    }
  }, [selectedTopic, user, notes]);

  const handleShareApp = async () => {
    const isDev = window.location.hostname.includes('-dev-');
    const shareUrl = process.env.APP_URL || window.location.origin;

    const shareData = {
      title: 'Your Knowledge Base',
      text: 'Capture ideas. AI turns them into organized knowledge.',
      url: shareUrl,
    };

    try {
      if (isDev) {
        // If in dev, we should warn that this link might be private
        // and suggest using the AI Studio share button for a public link
        await navigator.clipboard.writeText(shareUrl);
        setShareStatus('copied');
        setLoginError("Note: You're sharing a private development link. For a public link, use the 'Share' button in the AI Studio top bar.");
      } else if (navigator.share) {
        await navigator.share(shareData);
        setShareStatus('shared');
      } else {
        await navigator.clipboard.writeText(shareUrl);
        setShareStatus('copied');
      }
      setTimeout(() => setShareStatus('idle'), 3000);
    } catch (err) {
      console.error('Error sharing:', err);
    }
  };

  const handleShareNote = async (note: Note) => {
    const shareData = {
      title: 'From your notes',
      text: note.content,
      url: window.location.origin,
    };

    try {
      if (navigator.share) {
        await navigator.share(shareData);
      } else {
        await navigator.clipboard.writeText(note.content);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch (err) {
      console.error('Error sharing note:', err);
    }
  };

  const handleGenerateWeeklyReport = async () => {
    if (!user) return;
    setIsGeneratingReport(true);
    setShowReportModal(true);
    
    try {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      
      const recentNotes = notes.filter(n => n.createdAt.toDate() > sevenDaysAgo);
      
      if (recentNotes.length === 0) {
        setWeeklyReport({
          topics: [],
          patterns: [],
          summary: "You haven't captured any notes in the last 7 days. Start capturing to see your weekly insights!"
        });
        return;
      }
      
      const report = await generateWeeklyReport(recentNotes.map(n => n.content));
      setWeeklyReport(report);
    } catch (error) {
      console.error("Error generating weekly report:", error);
    } finally {
      setIsGeneratingReport(false);
    }
  };

  const handleLogin = async () => {
    setLoginError(null);
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (error: any) {
      if (error.code === 'auth/popup-closed-by-user') {
        return;
      }
      
      if (error.code === 'auth/popup-blocked') {
        setLoginError("Popup blocked! Please allow popups or open this link in your phone's default browser (Chrome/Safari) instead of inside WhatsApp.");
      } else if (error.code === 'auth/unauthorized-domain') {
        setLoginError("This domain is not authorized in Firebase. Please add this URL to your Firebase Authorized Domains.");
      } else {
        setLoginError("Login failed. If you're on mobile, try opening this in an external browser (Chrome/Safari) instead of inside WhatsApp.");
      }
      console.error("Login error:", error);
    }
  };

  const handleLogout = () => signOut(auth);
  
  const handleDeleteNote = async (id: string) => {
    if (!window.confirm("Are you sure you want to delete this insight?")) return;
    try {
      await deleteDoc(doc(db, 'notes', id));
      setSelectedNote(null);
      setShowMoreActions(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'notes');
    }
  };

  const handleUpdateNote = async () => {
    if (!selectedNote || !editContent.trim() || !user) return;

    setIsProcessing(true);
    try {
      let structured = selectedNote.structuredData;
      let embedding = selectedNote.embedding;
      
      // Re-generate if content changed significantly (more than 10 characters or 10%)
      const contentChanged = editContent !== selectedNote.content;
      const significantChange = Math.abs(editContent.length - selectedNote.content.length) > 10 || 
                               Math.abs(editContent.length - selectedNote.content.length) / selectedNote.content.length > 0.1;

      if (contentChanged && significantChange) {
        structured = await structureNote(editContent);
        embedding = await getEmbedding(editContent);
      }

      const noteRef = doc(db, 'notes', selectedNote.id);
      try {
        await setDoc(noteRef, {
          content: editContent,
          structuredData: structured,
          embedding: embedding
        }, { merge: true });
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, 'notes');
      }

      setIsEditing(false);
      setSelectedNote({
        ...selectedNote,
        content: editContent,
        structuredData: structured,
        embedding: embedding
      });
    } catch (error) {
      console.error("Error updating note:", error);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNote.trim() || !user) return;

    setIsProcessing(true);
    setCaptureError(null);
    setIsChatMode(false);
    try {
      const structured = await structureNote(newNote);
      const embedding = await getEmbedding(newNote);
      await addDoc(collection(db, 'notes'), {
        content: newNote,
        structuredData: structured,
        embedding: embedding,
        userId: user.uid,
        createdAt: Timestamp.now()
      });
      setNewNote('');
    } catch (error: any) {
      console.error("Error adding note:", error);
      let message = error.message || "Failed to capture note. Please try again.";
      if (message.includes("API key not valid") || message.includes("INVALID_ARGUMENT")) {
        message = "Gemini API Key is invalid. Please check your Secrets in Settings.";
      }
      setCaptureError(message);
      handleFirestoreError(error, OperationType.CREATE, 'notes');
    } finally {
      setIsProcessing(false);
    }
  };

  const filteredNotes = notes.filter(note => {
    const matchesSearch = note.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
      note.structuredData?.tags.some(t => t.toLowerCase().includes(searchQuery.toLowerCase())) ||
      note.structuredData?.category.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesTopic = !selectedTopic || note.structuredData?.category === selectedTopic;
    
    return matchesSearch && matchesTopic;
  });

  const topics = Array.from(new Set(notes.map(n => n.structuredData?.category).filter(Boolean))) as string[];
  const topicCounts = topics.reduce((acc, topic) => {
    acc[topic] = notes.filter(n => n.structuredData?.category === topic).length;
    return acc;
  }, {} as Record<string, number>);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F5F5F0] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[#5A5A40]" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-lumina-bg flex items-center justify-center p-6 relative overflow-hidden bg-grid-pattern">
        {/* Background Sparkle Blobs */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-indigo-500/10 rounded-full blur-[120px] animate-blob" />
          <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-pink-500/10 rounded-full blur-[120px] animate-blob [animation-delay:2s]" />
        </div>

        <div className="max-w-4xl w-full grid grid-cols-1 lg:grid-cols-2 gap-12 items-center relative z-10">
          <div className="space-y-8">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 bg-gradient-to-br from-indigo-500 to-pink-500 rounded-[24px] flex items-center justify-center shadow-2xl shadow-indigo-500/20">
                <Sparkles className="w-10 h-10 text-white" />
              </div>
              <div>
                <h1 className="text-4xl font-serif tracking-tight text-lumina-text">Lumina</h1>
                <p className="text-xs uppercase tracking-[0.3em] font-bold text-indigo-500">Knowledge Engine</p>
              </div>
            </div>
            
            <div className="space-y-4">
              <h2 className="text-5xl font-serif leading-[1.1] text-lumina-text">
                Your personal <br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-500 to-pink-500">knowledge engine.</span>
              </h2>
              <p className="text-lg text-lumina-text/60 leading-relaxed max-w-md">
                Capture ideas. AI organizes them. <br />
                Discover patterns in your thinking.
              </p>
            </div>

            <div className="flex flex-col gap-4">
              <div className="flex flex-col sm:flex-row gap-4">
                <button 
                  onClick={handleLogin}
                  className="bg-lumina-text text-lumina-bg rounded-full py-4 px-10 font-medium hover:opacity-90 transition-all flex items-center justify-center gap-3 shadow-xl shadow-black/10 group"
                >
                  <BookOpen className="w-5 h-5 group-hover:scale-110 transition-transform" />
                  Start Your Engine
                </button>
              </div>

              {loginError && (
                <div className="max-w-md p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-500 text-xs leading-relaxed animate-in fade-in slide-in-from-top-2">
                  <p className="font-bold mb-1">Login Issue:</p>
                  {loginError}
                  {loginError.includes("AI Studio top bar") && (
                    <p className="mt-2 text-[10px] opacity-80">
                      Development links (ending in -dev-) are private and only work inside the AI Studio editor.
                    </p>
                  )}
                </div>
              )}
            </div>

            <div className="flex items-center gap-8 pt-4">
              <div className="space-y-1">
                <p className="text-2xl font-serif text-lumina-text">100%</p>
                <p className="text-[10px] uppercase tracking-widest text-lumina-text/40 font-bold">Private</p>
              </div>
              <div className="w-px h-8 bg-lumina-border" />
              <div className="space-y-1">
                <p className="text-2xl font-serif text-lumina-text">AI</p>
                <p className="text-[10px] uppercase tracking-widest text-lumina-text/40 font-bold">Powered</p>
              </div>
              <div className="w-px h-8 bg-lumina-border" />
              <div className="space-y-1">
                <p className="text-2xl font-serif text-lumina-text">Instant</p>
                <p className="text-[10px] uppercase tracking-widest text-lumina-text/40 font-bold">Search</p>
              </div>
            </div>
          </div>

          <div className="relative hidden lg:block">
            <div className="absolute -inset-4 bg-gradient-to-r from-indigo-500/20 to-pink-500/20 rounded-[40px] blur-2xl" />
            <div className="relative bg-lumina-surface/80 backdrop-blur-xl border border-lumina-border rounded-[40px] p-8 shadow-2xl space-y-6">
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 rounded-full bg-rose-500" />
                <div className="w-3 h-3 rounded-full bg-amber-500" />
                <div className="w-3 h-3 rounded-full bg-emerald-500" />
              </div>
              <div className="space-y-4">
                <div className="h-4 w-3/4 bg-lumina-text/5 rounded-full" />
                <div className="h-4 w-1/2 bg-lumina-text/5 rounded-full" />
                <div className="h-24 w-full bg-lumina-text/5 rounded-[24px]" />
                <div className="flex gap-2">
                  <div className="h-6 w-16 bg-indigo-500/10 rounded-full" />
                  <div className="h-6 w-20 bg-pink-500/10 rounded-full" />
                </div>
              </div>
              <div className="pt-4 border-t border-lumina-border">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-lumina-text/10" />
                  <div className="space-y-1">
                    <div className="h-3 w-24 bg-lumina-text/10 rounded-full" />
                    <div className="h-2 w-16 bg-lumina-text/5 rounded-full" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-lumina-bg text-lumina-text font-sans flex transition-colors duration-300 relative overflow-hidden bg-grid-pattern">
      {/* Background Sparkle Blobs */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-indigo-500/10 dark:bg-indigo-500/5 rounded-full blur-[120px] animate-blob" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-pink-500/10 dark:bg-pink-500/5 rounded-full blur-[120px] animate-blob [animation-delay:2s]" />
        <div className="absolute top-[40%] left-[60%] w-[30%] h-[30%] bg-emerald-500/10 dark:bg-emerald-500/5 rounded-full blur-[100px] animate-blob [animation-delay:4s]" />
      </div>

      {/* Mobile Header */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-40 bg-lumina-bg/80 backdrop-blur-xl border-b border-lumina-border p-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-gradient-to-br from-indigo-500 to-pink-500 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <h1 className="text-lg font-serif tracking-tight text-lumina-text">Lumina</h1>
        </div>
        <button 
          onClick={() => setIsSidebarOpen(!isSidebarOpen)}
          className="p-2 hover:bg-lumina-text/5 rounded-full transition-colors"
        >
          {isSidebarOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      {/* Sidebar Overlay */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 md:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={cn(
        "fixed inset-y-0 left-0 z-50 w-80 bg-lumina-bg/95 backdrop-blur-2xl border-r border-lumina-border flex flex-col h-screen transition-transform duration-300 transform md:relative md:translate-x-0",
        isSidebarOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="absolute top-0 left-0 w-full h-64 bg-gradient-to-b from-lumina-accent/5 to-transparent pointer-events-none" />
        <div className="p-6 flex items-center justify-between border-b border-lumina-border relative z-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-pink-500 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <Sparkles className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-serif tracking-tight text-lumina-text">Lumina</h1>
              <p className="text-[10px] uppercase tracking-widest font-bold text-indigo-500 dark:text-indigo-400">Capture ideas.</p>
              <p className="text-[8px] text-lumina-text/40 leading-tight">AI turns them into organized knowledge.</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button 
              onClick={handleShareApp}
              className="p-2 hover:bg-black/5 dark:hover:bg-white/5 rounded-full transition-colors relative"
              title="Share your knowledge base"
            >
              {shareStatus === 'copied' ? <Check className="w-4 h-4 text-emerald-500" /> : <Share2 className="w-4 h-4 text-gray-400" />}
            </button>
            <button 
              onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
              className="p-2 hover:bg-black/5 dark:hover:bg-white/5 rounded-full transition-colors"
              title={theme === 'light' ? 'Switch to Dark Mode' : 'Switch to Light Mode'}
            >
              {theme === 'light' ? <Moon className="w-4 h-4 text-gray-400" /> : <Sun className="w-4 h-4 text-gray-400" />}
            </button>
            <button onClick={handleLogout} className="p-2 hover:bg-black/5 dark:hover:bg-white/5 rounded-full transition-colors">
              <LogOut className="w-4 h-4 text-gray-400" />
            </button>
            <button 
              onClick={() => setIsSidebarOpen(false)}
              className="md:hidden p-2 hover:bg-black/5 dark:hover:bg-white/5 rounded-full transition-colors"
            >
              <X className="w-4 h-4 text-gray-400" />
            </button>
          </div>
        </div>

        <div className="p-4 space-y-4 flex-1 overflow-y-auto relative z-10">
          <button 
            onClick={() => {
              setSelectedNote(null);
              setIsChatMode(false);
              setIsSidebarOpen(false);
              // Focus the main textarea if possible, or just scroll to top
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            className="w-full flex items-center gap-3 px-4 py-3 bg-lumina-accent text-white rounded-2xl shadow-lg shadow-lumina-accent/20 hover:opacity-90 transition-all group"
          >
            <Plus className="w-5 h-5 group-hover:rotate-90 transition-transform duration-300" />
            <span className="text-sm font-bold tracking-tight">New Insight</span>
          </button>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input 
              type="text"
              placeholder="Search insights..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-lumina-surface border border-lumina-border rounded-xl py-2 pl-10 pr-4 text-sm focus:outline-none focus:ring-1 focus:ring-lumina-accent/30 transition-all"
            />
          </div>

          <div className="flex p-1 bg-lumina-text/5 rounded-xl">
            <button 
              onClick={() => { setActiveTab('recent'); setSelectedTopic(null); }}
              className={cn(
                "flex-1 py-1.5 text-[10px] uppercase tracking-widest font-bold rounded-lg transition-all",
                activeTab === 'recent' ? "bg-lumina-surface shadow-sm text-lumina-accent" : "text-lumina-text/40 hover:text-lumina-text/60"
              )}
            >
              Recent
            </button>
            <button 
              onClick={() => setActiveTab('topics')}
              className={cn(
                "flex-1 py-1.5 text-[10px] uppercase tracking-widest font-bold rounded-lg transition-all",
                activeTab === 'topics' ? "bg-lumina-surface shadow-sm text-lumina-accent" : "text-lumina-text/40 hover:text-lumina-text/60"
              )}
            >
              Topics
            </button>
          </div>

          <div className="space-y-1">
            {activeTab === 'recent' ? (
              <>
                <p className="text-[10px] uppercase tracking-widest text-gray-400 font-bold px-2 mb-2">Recent Snippets</p>
                {filteredNotes.map(note => (
                  <button
                    key={note.id}
                    onClick={() => { 
                      setSelectedNote(note); 
                      setChatResponse(null); 
                      setIsChatMode(false);
                      setIsSidebarOpen(false);
                    }}
                    className={cn(
                      "w-full text-left p-3 rounded-xl transition-all group relative overflow-hidden",
                      selectedNote?.id === note.id ? "bg-lumina-surface shadow-md border border-lumina-border" : "hover:bg-lumina-surface/40"
                    )}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[10px] font-mono text-lumina-accent opacity-60">
                        {format(note.createdAt.toDate(), 'MMM d')}
                      </span>
                      {note.structuredData && (
                        <span className={cn(
                          "text-[9px] px-1.5 py-0.5 rounded uppercase tracking-tighter font-bold",
                          note.structuredData.category.toLowerCase().includes('health') ? "bg-emerald-500/10 text-emerald-500" :
                          note.structuredData.category.toLowerCase().includes('tech') ? "bg-blue-500/10 text-blue-500" :
                          note.structuredData.category.toLowerCase().includes('philosophy') ? "bg-amber-500/10 text-amber-500" :
                          note.structuredData.category.toLowerCase().includes('personal') ? "bg-rose-500/10 text-rose-500" :
                          note.structuredData.category.toLowerCase().includes('finance') ? "bg-violet-500/10 text-violet-500" :
                          "bg-lumina-accent/10 text-lumina-accent"
                        )}>
                          {note.structuredData.category}
                        </span>
                      )}
                    </div>
                    <p className="text-sm line-clamp-2 text-lumina-text/80 leading-snug">
                      {note.content}
                    </p>
                  </button>
                ))}
              </>
            ) : (
              <>
                <p className="text-[10px] uppercase tracking-widest text-gray-400 font-bold px-2 mb-2">Topics</p>
                
                {selectedTopic && (
                  <div className="px-2 mb-4 animate-in slide-in-from-top-2 duration-500">
                    <div className="p-4 rounded-2xl bg-gradient-to-br from-indigo-500/10 to-pink-500/10 border border-indigo-500/20 space-y-2 relative overflow-hidden group">
                      <div className="absolute top-0 right-0 p-2 opacity-20 group-hover:opacity-40 transition-opacity">
                        <BrainCircuit className="w-4 h-4 text-indigo-500" />
                      </div>
                      <h4 className="text-[10px] uppercase tracking-widest font-bold text-indigo-500">Theme Detected</h4>
                      {isGeneratingTopicInsight ? (
                        <div className="flex items-center gap-2 py-1">
                          <Loader2 className="w-3 h-3 animate-spin text-indigo-500" />
                          <span className="text-[10px] text-lumina-text/40 italic">Synthesizing...</span>
                        </div>
                      ) : (
                        <p className="text-[11px] text-lumina-text/70 leading-relaxed font-medium">
                          {topicInsight || "Capture more notes in this topic to see recurring themes."}
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {topics.map(topic => (
                  <button
                    key={topic}
                    onClick={() => {
                      setSelectedTopic(topic === selectedTopic ? null : topic);
                      setSelectedNote(null);
                      setIsChatMode(false);
                      setIsSidebarOpen(false);
                    }}
                    className={cn(
                      "w-full flex items-center justify-between p-3 rounded-xl transition-all",
                      selectedTopic === topic ? "bg-lumina-surface shadow-md border border-lumina-border text-lumina-accent" : "hover:bg-lumina-surface/40 text-lumina-text/60"
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "w-2 h-2 rounded-full",
                        topic.toLowerCase().includes('health') ? "bg-emerald-500" :
                        topic.toLowerCase().includes('tech') ? "bg-blue-500" :
                        topic.toLowerCase().includes('philosophy') ? "bg-amber-500" :
                        topic.toLowerCase().includes('personal') ? "bg-rose-500" :
                        topic.toLowerCase().includes('finance') ? "bg-violet-500" :
                        "bg-lumina-accent/30"
                      )} />
                      <span className="text-sm font-medium">{topic}</span>
                    </div>
                    <span className="text-[10px] font-bold opacity-40">{topicCounts[topic]}</span>
                  </button>
                ))}
                
                {selectedTopic && (
                  <div className="mt-4 space-y-1 animate-in fade-in duration-300">
                    <p className="text-[10px] uppercase tracking-widest text-gray-400 font-bold px-2 mb-2">Notes in {selectedTopic}</p>
                    {filteredNotes.map(note => (
                      <button
                        key={note.id}
                        onClick={() => { setSelectedNote(note); setChatResponse(null); }}
                        className={cn(
                          "w-full text-left p-3 rounded-xl transition-all group relative overflow-hidden",
                          selectedNote?.id === note.id ? "bg-white shadow-sm border border-black/5" : "hover:bg-white/40"
                        )}
                      >
                        <p className="text-sm line-clamp-2 text-gray-700 leading-snug">
                          {note.content}
                        </p>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        <div className="p-4 border-t border-black/5 space-y-3 relative z-10">
          <button 
            onClick={() => { 
              setChatResponse(null); 
              setSelectedNote(null); 
              setIsChatMode(true);
              setIsSidebarOpen(false);
            }}
            className={cn(
              "w-full flex items-center gap-3 px-4 py-3 rounded-2xl transition-all relative group overflow-hidden",
              isChatMode && !selectedNote 
                ? "bg-gradient-to-r from-indigo-600 to-pink-600 text-white shadow-lg shadow-indigo-500/30" 
                : "text-lumina-text/60 hover:bg-lumina-text/5"
            )}
          >
            <MessageSquare className="w-4 h-4" />
            <span className="text-xs font-medium">Ask My Notes</span>
            {isChatMode && !selectedNote && <Sparkles className="w-3 h-3 ml-auto animate-pulse" />}
          </button>
          <button 
            onClick={handleGenerateWeeklyReport}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl transition-all text-lumina-text/60 hover:bg-lumina-text/5"
          >
            <Calendar className="w-4 h-4" />
            <span className="text-xs font-medium">Your weekly knowledge report</span>
          </button>
          <div className="flex items-center gap-3 px-2 py-3 rounded-2xl bg-lumina-surface/30">
            <img src={user.photoURL || ''} alt="" className="w-8 h-8 rounded-full border border-lumina-border" referrerPolicy="no-referrer" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium truncate text-lumina-text">{user.displayName}</p>
              <p className="text-[10px] text-lumina-text/40 truncate">{user.email}</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden pt-[72px] md:pt-0">
        {/* Header / Input */}
        <div className="p-4 md:p-8 border-b border-lumina-border bg-lumina-surface/20 backdrop-blur-md relative overflow-hidden z-10">
          <div className="max-w-3xl mx-auto w-full relative z-10">
            <form onSubmit={handleAddNote} className="relative group">
              <div className="absolute -inset-1 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 rounded-[28px] blur opacity-20 group-hover:opacity-40 transition duration-1000 group-hover:duration-200" />
              <textarea
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    if (newNote.trim() && !isProcessing) {
                      const form = e.currentTarget.form;
                      if (form) form.requestSubmit();
                    }
                  }
                }}
                placeholder="Capture an idea, quote, or insight..."
                className="relative w-full bg-lumina-surface/80 backdrop-blur-sm border border-lumina-border rounded-[24px] p-6 pr-16 text-lg font-serif resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500/20 shadow-sm min-h-[120px] transition-all text-lumina-text"
              />
              <button
                type="submit"
                disabled={isProcessing || !newNote.trim()}
                className="absolute bottom-4 right-4 bg-gradient-to-br from-indigo-600 to-pink-600 text-white p-3 rounded-2xl hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg hover:shadow-indigo-500/40 active:scale-95"
              >
                {isProcessing ? <Loader2 className="w-6 h-6 animate-spin" /> : <Plus className="w-6 h-6" />}
              </button>
            </form>
            {captureError && (
              <div className="mt-3 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-500 text-[10px] font-bold uppercase tracking-widest animate-in fade-in slide-in-from-top-2">
                {captureError}
              </div>
            )}
            {isProcessing && (
              <div className="mt-3 flex items-center gap-2 text-xs text-lumina-accent italic animate-pulse">
                <Sparkles className="w-3 h-3" />
                AI is structuring your insight...
              </div>
            )}
          </div>
        </div>

        {/* Note Detail or Chat */}
        <section className="flex-1 overflow-y-auto p-4 md:p-8 relative z-10">
          <div className="max-w-3xl mx-auto w-full">
            {isChatMode && !selectedNote ? (
              <div className="space-y-8">
                <div className="bg-lumina-surface/80 backdrop-blur-xl rounded-[32px] p-8 border border-lumina-border shadow-2xl shadow-indigo-500/5 space-y-6 relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-48 h-48 bg-gradient-to-br from-indigo-500/20 to-pink-500/20 rounded-full -mr-24 -mt-24 blur-3xl" />
                  <div className="flex items-center gap-3 text-indigo-500 relative z-10">
                    <div className="p-3 bg-indigo-500/10 rounded-2xl">
                      <MessageSquare className="w-6 h-6" />
                    </div>
                    <div>
                      <h2 className="text-xl font-serif">Ask My Notes</h2>
                      <p className="text-[10px] text-indigo-500/60 uppercase tracking-widest font-bold">Semantic Knowledge Search</p>
                    </div>
                  </div>
                  <p className="text-sm text-lumina-text/60 leading-relaxed relative z-10">
                    Query your personal knowledge base. Your knowledge engine will search through your snippets to find answers and connections.
                  </p>
                  <form onSubmit={handleAskNotes} className="relative z-10">
                    <input 
                      type="text"
                      value={chatQuery}
                      onChange={(e) => setChatQuery(e.target.value)}
                      placeholder="What do I know about health?"
                      className="w-full bg-lumina-bg/50 border border-lumina-border rounded-2xl py-5 pl-6 pr-16 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all shadow-inner text-lumina-text"
                    />
                    <button 
                      type="submit"
                      disabled={isChatting || !chatQuery.trim()}
                      className="absolute right-2 top-1/2 -translate-y-1/2 bg-gradient-to-r from-indigo-600 to-pink-600 text-white p-3 rounded-xl hover:opacity-90 transition-all disabled:opacity-50 shadow-lg"
                    >
                      {isChatting ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                    </button>
                  </form>
                  {notes.length === 0 && (
                    <p className="text-[10px] text-rose-500 font-bold uppercase tracking-widest text-center">
                      You need to add some notes first!
                    </p>
                  )}
                </div>

                {isChatting && (
                  <div className="flex flex-col items-center justify-center py-12 space-y-4">
                    <div className="relative">
                      <div className="absolute inset-0 bg-lumina-accent blur-xl opacity-20 animate-pulse" />
                      <Loader2 className="w-8 h-8 animate-spin text-lumina-accent relative z-10" />
                    </div>
                    <p className="text-xs text-lumina-text/40 font-bold uppercase tracking-widest animate-pulse">Consulting your knowledge...</p>
                  </div>
                )}

                {chatResponse && (
                  <div className="bg-lumina-surface/90 backdrop-blur-2xl rounded-[32px] p-8 border border-lumina-border shadow-2xl shadow-indigo-500/10 space-y-6 animate-in fade-in slide-in-from-top-4 duration-500 relative overflow-hidden group">
                    <div className="absolute bottom-0 left-0 w-48 h-48 bg-gradient-to-tr from-emerald-500/10 via-indigo-500/5 to-transparent rounded-full -ml-24 -mb-24 blur-3xl" />
                    <div className="absolute top-0 right-0 w-48 h-48 bg-gradient-to-bl from-pink-500/10 via-purple-500/5 to-transparent rounded-full -mr-24 -mt-24 blur-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-1000" />
                    
                    <div className="flex items-center justify-between relative z-10">
                      <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest font-bold bg-gradient-to-r from-indigo-500 to-pink-500 bg-clip-text text-transparent">
                        <Sparkles className="w-3 h-3 text-indigo-500" />
                        Your knowledge says
                      </div>
                      <button 
                        onClick={() => { setChatResponse(null); setChatQuery(''); }}
                        className="text-[10px] font-bold text-lumina-text/20 hover:text-rose-500 uppercase tracking-widest transition-colors"
                      >
                        Clear
                      </button>
                    </div>
                    <div className="markdown-body text-lumina-text/90 leading-relaxed relative z-10 prose-p:my-2 prose-headings:font-serif prose-headings:text-indigo-500">
                      <Markdown>{chatResponse}</Markdown>
                    </div>
                  </div>
                )}
              </div>
            ) : selectedNote ? (
              <div className="space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4 text-xs text-lumina-text/40 font-mono">
                      <div className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {format(selectedNote.createdAt.toDate(), 'MMMM d, yyyy • HH:mm')}
                      </div>
                      {selectedNote.structuredData && (
                        <div className={cn(
                          "flex items-center gap-1 font-bold uppercase tracking-widest px-2 py-0.5 rounded-md",
                          selectedNote.structuredData.category.toLowerCase().includes('health') ? "text-emerald-500 bg-emerald-500/10" :
                          selectedNote.structuredData.category.toLowerCase().includes('tech') ? "text-blue-500 bg-blue-500/10" :
                          selectedNote.structuredData.category.toLowerCase().includes('philosophy') ? "text-amber-500 bg-amber-500/10" :
                          selectedNote.structuredData.category.toLowerCase().includes('personal') ? "text-rose-500 bg-rose-500/10" :
                          selectedNote.structuredData.category.toLowerCase().includes('finance') ? "text-violet-500 bg-violet-500/10" :
                          "text-lumina-accent bg-lumina-accent/10"
                        )}>
                          <Tag className="w-3 h-3" />
                          {selectedNote.structuredData.category}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 relative">
                      <button 
                        onClick={() => setShowMoreActions(!showMoreActions)}
                        className="p-2 hover:bg-lumina-text/5 rounded-full transition-colors"
                        title="More actions"
                      >
                        <MoreVertical className="w-4 h-4 text-lumina-text/40" />
                      </button>

                      {showMoreActions && (
                        <div className="absolute right-0 top-full mt-2 w-48 bg-lumina-surface border border-lumina-border rounded-2xl shadow-xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                          <button 
                            onClick={() => {
                              setIsEditing(true);
                              setEditContent(selectedNote.content);
                              setShowMoreActions(false);
                            }}
                            className="w-full flex items-center gap-3 px-4 py-3 text-xs font-medium text-lumina-text/60 hover:bg-lumina-text/5 transition-colors"
                          >
                            <Edit2 className="w-3 h-3" />
                            Edit Insight
                          </button>
                          <button 
                            onClick={() => {
                              handleShareNote(selectedNote);
                              setShowMoreActions(false);
                            }}
                            className="w-full flex items-center gap-3 px-4 py-3 text-xs font-medium text-lumina-text/60 hover:bg-lumina-text/5 transition-colors"
                          >
                            <Share2 className="w-3 h-3" />
                            Share Insight
                          </button>
                          <button 
                            onClick={() => {
                              copyToClipboard(selectedNote.content);
                              setShowMoreActions(false);
                            }}
                            className="w-full flex items-center gap-3 px-4 py-3 text-xs font-medium text-lumina-text/60 hover:bg-lumina-text/5 transition-colors"
                          >
                            {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                            {copied ? 'Copied' : 'Copy Snippet'}
                          </button>
                          <div className="h-px bg-lumina-border" />
                          <button 
                            onClick={() => handleDeleteNote(selectedNote.id)}
                            className="w-full flex items-center gap-3 px-4 py-3 text-xs font-medium text-rose-500 hover:bg-rose-500/5 transition-colors"
                          >
                            <Trash2 className="w-3 h-3" />
                            Delete Insight
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                  
                  {isEditing ? (
                    <div className="space-y-4">
                      <textarea
                        value={editContent}
                        onChange={(e) => setEditContent(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            if (editContent.trim() && !isProcessing) {
                              handleUpdateNote();
                            }
                          }
                        }}
                        className="w-full bg-lumina-surface border border-lumina-border rounded-[24px] p-6 text-2xl font-serif resize-none focus:outline-none focus:ring-1 focus:ring-lumina-accent/20 shadow-sm min-h-[200px] text-lumina-text"
                        autoFocus
                      />
                      <div className="flex gap-3">
                        <button
                          onClick={handleUpdateNote}
                          disabled={isProcessing}
                          className="bg-lumina-accent text-white px-6 py-2 rounded-full text-sm font-medium hover:opacity-90 transition-all flex items-center gap-2"
                        >
                          {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                          Save Changes
                        </button>
                        <button
                          onClick={() => setIsEditing(false)}
                          className="px-6 py-2 rounded-full text-sm font-medium border border-lumina-border hover:bg-lumina-text/5 transition-all flex items-center gap-2 text-lumina-text"
                        >
                          <X className="w-4 h-4" />
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      {mergeSuggestion && relatedNotes[0] && (
                        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-6 space-y-4 animate-in fade-in slide-in-from-top-4 duration-500">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3 text-emerald-500">
                              <Merge className="w-5 h-5" />
                              <h4 className="text-sm font-bold uppercase tracking-widest">Possible Merge</h4>
                            </div>
                            <span className="text-[10px] font-bold text-emerald-500 bg-emerald-500/20 px-2 py-1 rounded-full">92% Similarity</span>
                          </div>
                          <p className="text-xs text-emerald-500/70 leading-relaxed">
                            {mergeSuggestion.reason}
                          </p>
                          <div className="bg-lumina-surface/50 p-4 rounded-xl border border-emerald-500/20 italic text-sm text-emerald-500">
                            "{mergeSuggestion.mergedContent}"
                          </div>
                          <button 
                            onClick={() => handleExecuteMerge(selectedNote, relatedNotes[0], mergeSuggestion.mergedContent)}
                            disabled={isMerging}
                            className="w-full bg-emerald-600 text-white rounded-xl py-3 text-xs font-bold hover:bg-emerald-700 transition-all flex items-center justify-center gap-2"
                          >
                            {isMerging ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                            Merge into one idea
                          </button>
                        </div>
                      )}

                      {patternInsight && (
                        <div className="bg-lumina-accent/5 border border-lumina-accent/10 rounded-2xl p-6 space-y-3 animate-in fade-in duration-700">
                          <div className="flex items-center gap-3 text-lumina-accent">
                            <BrainCircuit className="w-5 h-5" />
                            <h4 className="text-sm font-bold uppercase tracking-widest">Pattern Detected</h4>
                          </div>
                          <div className="space-y-1">
                            <p className="text-sm font-serif font-bold text-lumina-text">{patternInsight.title}</p>
                            <p className="text-xs text-lumina-text/60 leading-relaxed">{patternInsight.description}</p>
                          </div>
                        </div>
                      )}

                      {selectedNote.structuredData?.cleanedContent && selectedNote.structuredData.cleanedContent !== selectedNote.content && (
                        <div className="bg-gradient-to-r from-lumina-accent/5 to-emerald-500/5 border border-lumina-accent/10 rounded-2xl p-6 flex items-start gap-4 relative overflow-hidden group">
                          <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/10 rounded-full -mr-12 -mt-12 blur-2xl opacity-0 group-hover:opacity-100 transition-opacity" />
                          <div className="p-2 bg-lumina-surface rounded-xl shadow-sm">
                            <Wand2 className="w-5 h-5 text-lumina-accent" />
                          </div>
                          <div className="space-y-2 relative z-10">
                            <p className="text-[10px] uppercase tracking-widest font-bold text-lumina-accent">AI Refinement</p>
                            <p className="text-sm text-lumina-text/60 italic leading-relaxed">"{selectedNote.structuredData.cleanedContent}"</p>
                            <button 
                              onClick={() => {
                                setEditContent(selectedNote.structuredData!.cleanedContent);
                                handleUpdateNote();
                              }}
                              className="flex items-center gap-2 text-[10px] font-bold text-lumina-accent hover:opacity-80 transition-colors"
                            >
                              <Check className="w-3 h-3" />
                              Apply AI Cleanup
                            </button>
                          </div>
                        </div>
                      )}
                      <div className="markdown-body text-3xl font-serif leading-tight text-lumina-text">
                        <Markdown>
                          {selectedNote.content}
                        </Markdown>
                      </div>

                      {/* Thinking Timeline Section */}
                      {(isGeneratingEvolution || evolutionInsight) && (
                        <div className="pt-8 border-t border-lumina-border animate-in fade-in slide-in-from-bottom-4 duration-700">
                          <div className="flex items-center gap-3 mb-6">
                            <div className="p-2 bg-indigo-500/10 rounded-xl">
                              <History className="w-5 h-5 text-indigo-500" />
                            </div>
                            <div>
                              <h3 className="text-sm font-serif font-bold text-lumina-text">Thinking Timeline</h3>
                              <p className="text-[10px] text-lumina-text/40 uppercase tracking-widest font-bold">Idea Evolution</p>
                            </div>
                            {isGeneratingEvolution && <Loader2 className="w-4 h-4 animate-spin text-indigo-500 ml-auto" />}
                          </div>

                          {evolutionInsight && (
                            <div className="space-y-8">
                              <div className="p-6 rounded-3xl bg-gradient-to-br from-indigo-500/5 to-pink-500/5 border border-indigo-500/10">
                                <div className="flex items-center gap-2 mb-2">
                                  <TrendingUp className="w-4 h-4 text-indigo-500" />
                                  <span className="text-[10px] uppercase tracking-widest font-bold text-indigo-500">Theme: {evolutionInsight.theme}</span>
                                </div>
                                <p className="text-sm text-lumina-text/80 leading-relaxed italic">
                                  "{evolutionInsight.evolution}"
                                </p>
                              </div>

                              <div className="relative pl-8 space-y-8 before:absolute before:left-[11px] before:top-2 before:bottom-2 before:w-px before:bg-lumina-border">
                                {evolutionInsight.milestones.map((milestone, i) => (
                                  <div key={i} className="relative">
                                    <div className="absolute -left-[27px] top-1.5 w-2 h-2 rounded-full bg-indigo-500 ring-4 ring-lumina-bg" />
                                    <div className="space-y-1">
                                      <p className="text-[10px] font-bold text-lumina-text/40">{milestone.date}</p>
                                      <p className="text-sm text-lumina-text/70 leading-relaxed">{milestone.summary}</p>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                  <div className="md:col-span-2 space-y-12">
                    {selectedNote.structuredData && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div className="space-y-8">
                          <section className="space-y-3">
                            <h3 className="text-[10px] uppercase tracking-[0.2em] text-lumina-text/40 font-bold">Summary</h3>
                            <p className="text-sm text-lumina-text/60 leading-relaxed italic">
                              "{selectedNote.structuredData.summary}"
                            </p>
                          </section>

                          <div className="pt-4">
                            <button 
                              onClick={() => setShowMoreInsights(!showMoreInsights)}
                              className="flex items-center gap-2 text-[10px] uppercase tracking-widest font-bold text-indigo-500 hover:opacity-80 transition-all"
                            >
                              {showMoreInsights ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                              {showMoreInsights ? 'Show deeper insights' : 'Show more insights'}
                            </button>
                          </div>

                          {showMoreInsights && (
                            <div className="space-y-8 pt-4 animate-in slide-in-from-top-2 duration-300">
                              <section className="space-y-3">
                                <h3 className="text-[10px] uppercase tracking-[0.2em] text-lumina-text/40 font-bold">Key Takeaways</h3>
                                <ul className="space-y-2">
                                  {selectedNote.structuredData.keyPoints.map((point, i) => (
                                    <li key={i} className="flex gap-3 text-sm text-lumina-text/80">
                                      <ChevronRight className="w-4 h-4 text-lumina-accent shrink-0 mt-0.5" />
                                      {point}
                                    </li>
                                  ))}
                                </ul>
                              </section>
                            </div>
                          )}
                        </div>

                        <div className="space-y-8">
                          {showMoreInsights && (
                            <div className="space-y-8 animate-in slide-in-from-top-2 duration-300">
                              <section className="space-y-3">
                                <h3 className="text-[10px] uppercase tracking-[0.2em] text-lumina-text/40 font-bold">Action Items</h3>
                                <div className="space-y-2">
                                  {selectedNote.structuredData.actionItems.map((item, i) => (
                                    <div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-lumina-surface border border-lumina-border text-xs text-lumina-text/60">
                                      <div className="w-1.5 h-1.5 rounded-full bg-lumina-accent" />
                                      {item}
                                    </div>
                                  ))}
                                </div>
                              </section>
                            </div>
                          )}

                          <section className="space-y-3">
                            <h3 className="text-[10px] uppercase tracking-[0.2em] text-lumina-text/40 font-bold">Tags</h3>
                            <div className="flex flex-wrap gap-2">
                              {selectedNote.structuredData.tags.map((tag, i) => (
                                <span key={i} className="px-3 py-1 rounded-full bg-lumina-text/5 text-[10px] font-medium text-lumina-text/40">
                                  #{tag}
                                </span>
                              ))}
                            </div>
                          </section>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="space-y-8">
                    <section className="space-y-4">
                      <h3 className="text-[10px] uppercase tracking-[0.2em] text-lumina-text/40 font-bold flex items-center gap-2">
                        <LinkIcon className="w-3 h-3 text-indigo-500" />
                        Related Insights
                      </h3>
                      {relatedNotes.length > 0 ? (
                        <div className="space-y-3">
                          {relatedNotes.map(note => (
                            <button
                              key={note.id}
                              onClick={() => { setSelectedNote(note); setChatResponse(null); }}
                              className="w-full text-left p-4 rounded-2xl bg-lumina-surface/50 backdrop-blur-sm border border-lumina-border hover:border-indigo-500/30 hover:shadow-lg hover:shadow-indigo-500/5 transition-all group relative overflow-hidden"
                            >
                              <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/5 to-pink-500/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                              <p className="text-xs text-lumina-text/60 line-clamp-3 leading-relaxed mb-2 relative z-10">
                                {note.content}
                              </p>
                              <div className="flex items-center justify-between relative z-10">
                                <span className={cn(
                                  "text-[9px] font-bold uppercase tracking-tighter flex items-center gap-2 px-1.5 py-0.5 rounded",
                                  note.structuredData?.category.toLowerCase().includes('health') ? "text-emerald-500 bg-emerald-500/10" :
                                  note.structuredData?.category.toLowerCase().includes('tech') ? "text-blue-500 bg-blue-500/10" :
                                  note.structuredData?.category.toLowerCase().includes('philosophy') ? "text-amber-500 bg-amber-500/10" :
                                  note.structuredData?.category.toLowerCase().includes('personal') ? "text-rose-500 bg-rose-500/10" :
                                  note.structuredData?.category.toLowerCase().includes('finance') ? "text-violet-500 bg-violet-500/10" :
                                  "text-indigo-500 bg-indigo-500/10"
                                )}>
                                  {note.structuredData?.category}
                                  {(note as any).similarity > 0.9 && (
                                    <span className="bg-emerald-500 text-white px-1 rounded-sm text-[8px] animate-pulse">
                                      Highly Related
                                    </span>
                                  )}
                                </span>
                                <ChevronRight className="w-3 h-3 text-lumina-text/20 group-hover:text-indigo-500 transition-colors" />
                              </div>
                            </button>
                          ))}
                          <p className="text-[10px] text-lumina-text/40 italic px-1">
                            AI suggested these ideas are related.
                          </p>
                        </div>
                      ) : (
                        <p className="text-xs text-lumina-text/40 italic">
                          No related insights found yet. Keep capturing to see connections.
                        </p>
                      )}
                    </section>
                  </div>
                </div>
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-center space-y-4 opacity-40 py-20">
                <div className="w-16 h-16 rounded-full bg-lumina-text/5 flex items-center justify-center">
                  <BookOpen className="w-8 h-8 text-lumina-text" />
                </div>
                <div className="space-y-1">
                  <p className="text-lg font-serif text-lumina-text">Select a snippet to expand</p>
                  <p className="text-sm text-lumina-text">Your structured knowledge will appear here</p>
                </div>
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
      {/* Weekly Report Modal */}
      {showReportModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/40 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-lumina-bg w-full max-w-2xl rounded-[40px] shadow-2xl border border-lumina-border overflow-hidden animate-in zoom-in-95 duration-300">
            <div className="p-8 border-b border-lumina-border flex items-center justify-between bg-gradient-to-r from-indigo-500/5 to-pink-500/5">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-indigo-500/10 rounded-2xl">
                  <FileText className="w-6 h-6 text-indigo-500" />
                </div>
                <div>
                  <h2 className="text-2xl font-serif text-lumina-text">Your Thinking This Week</h2>
                  <p className="text-[10px] text-lumina-text/40 uppercase tracking-widest font-bold">Your knowledge report</p>
                </div>
              </div>
              <button 
                onClick={() => setShowReportModal(false)}
                className="p-2 hover:bg-black/5 dark:hover:bg-white/5 rounded-full transition-colors"
              >
                <X className="w-5 h-5 text-lumina-text/40" />
              </button>
            </div>
            
            <div className="p-8 max-h-[70vh] overflow-y-auto space-y-8">
              {isGeneratingReport ? (
                <div className="py-20 flex flex-col items-center justify-center space-y-4">
                  <Loader2 className="w-10 h-10 text-indigo-500 animate-spin" />
                  <p className="text-sm text-lumina-text/60 italic animate-pulse">Synthesizing your week...</p>
                </div>
              ) : weeklyReport ? (
                <>
                  <section className="space-y-4">
                    <h3 className="text-[10px] uppercase tracking-[0.2em] text-lumina-text/40 font-bold">Topics Explored</h3>
                    <div className="flex flex-wrap gap-2">
                      {weeklyReport.topics.map((topic, i) => (
                        <span key={i} className="px-4 py-2 rounded-2xl bg-indigo-500/5 text-indigo-600 dark:text-indigo-400 text-xs font-medium border border-indigo-500/10">
                          {topic}
                        </span>
                      ))}
                    </div>
                  </section>

                  <section className="space-y-4">
                    <h3 className="text-[10px] uppercase tracking-[0.2em] text-lumina-text/40 font-bold">Key Patterns</h3>
                    <div className="grid grid-cols-1 gap-4">
                      {weeklyReport.patterns.map((pattern, i) => (
                        <div key={i} className="p-6 rounded-3xl bg-lumina-surface border border-lumina-border group hover:border-indigo-500/30 transition-all">
                          <h4 className="text-sm font-serif font-bold text-lumina-text mb-2 group-hover:text-indigo-500 transition-colors">{pattern.title}</h4>
                          <p className="text-xs text-lumina-text/60 leading-relaxed">{pattern.description}</p>
                        </div>
                      ))}
                    </div>
                  </section>

                  <section className="p-6 rounded-3xl bg-gradient-to-br from-indigo-500/5 to-pink-500/5 border border-indigo-500/10 italic text-sm text-lumina-text/80 leading-relaxed">
                    "{weeklyReport.summary}"
                  </section>
                </>
              ) : null}
            </div>
            
            <div className="p-6 border-t border-lumina-border bg-lumina-surface/50 flex justify-end">
              <button 
                onClick={() => setShowReportModal(false)}
                className="px-8 py-3 bg-lumina-text text-lumina-bg rounded-full text-sm font-medium hover:opacity-90 transition-all"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </ErrorBoundary>
  );
}
