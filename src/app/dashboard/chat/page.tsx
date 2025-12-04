'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Send, User, Bot, Loader2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  toolUsed?: string | null;
  timestamp: Date;
}

export default function ChatPage() {
  const { user, loading, getIdToken } = useAuth();
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      role: 'assistant',
      content: `Hello! I'm your First Dollar Health Wallet Manager assistant. I can help you with organization management, user/member information, benefits administration, claims, and more.

Here are some things you can ask me:
- "List all organizations"
- "Show me the members of organization ACME"
- "List all users"
- "Get details for user abc123"
- "Show me the benefits programs for organization ACME"
- "List all claims"
- "Who am I logged in as?"
- "What partner am I connected to?"

What would you like to do?`,
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!loading && !user) {
      router.push('/');
    }
  }, [user, loading, router]);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
    return () => clearTimeout(timeoutId);
  }, [messages]);

  const addMessage = (message: Omit<Message, 'id' | 'timestamp'>) => {
    const newMessage: Message = {
      ...message,
      id: Math.random().toString(36).substr(2, 9),
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, newMessage]);
    return newMessage;
  };

  const handleSend = async () => {
    if (!input.trim() || isProcessing) return;

    const userMessage = input.trim();
    setInput('');
    addMessage({ role: 'user', content: userMessage });
    setIsProcessing(true);

    try {
      const token = await getIdToken();
      if (!token) {
        addMessage({
          role: 'assistant',
          content: 'Sorry, I could not authenticate. Please try signing out and back in.',
        });
        return;
      }

      // Call the AI chat endpoint
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ message: userMessage }),
      });

      if (!response.ok) {
        throw new Error('Failed to send message');
      }

      const data = await response.json();

      addMessage({
        role: 'assistant',
        content: data.response || 'I received your message but could not generate a response.',
        toolUsed: data.toolUsed,
      });
    } catch (error) {
      console.error('Error sending message:', error);
      addMessage({
        role: 'assistant',
        content: `Sorry, I encountered an error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      <div className="flex-none pb-4">
        <h1 className="text-3xl font-bold">Chat</h1>
        <p className="text-muted-foreground mt-1">
          AI-powered Partner API assistant
        </p>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-4 pb-4" ref={messagesContainerRef}>
        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex gap-3 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            {message.role !== 'user' && (
              <div className="flex-none">
                <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                  <Bot className="h-4 w-4 text-primary" />
                </div>
              </div>
            )}

            <Card className={`max-w-[85%] ${message.role === 'user' ? 'bg-primary text-primary-foreground' : ''}`}>
              <CardContent className="py-3 px-4">
                {message.toolUsed && (
                  <div className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
                    Used tool: <span className="font-mono bg-muted px-1 rounded">{message.toolUsed}</span>
                  </div>
                )}
                <div className={`prose prose-sm max-w-none ${message.role === 'user' ? 'prose-invert' : 'dark:prose-invert'}`}>
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      p: ({ children }) => <p className="my-1">{children}</p>,
                      pre: ({ children }) => (
                        <pre className="bg-muted/50 p-2 rounded text-xs overflow-auto my-2">{children}</pre>
                      ),
                      code: ({ children, className }) => {
                        const isInline = !className;
                        return isInline ? (
                          <code className="bg-muted/50 px-1 rounded text-xs">{children}</code>
                        ) : (
                          <code className={className}>{children}</code>
                        );
                      },
                      ul: ({ children }) => <ul className="my-2 ml-4 list-disc">{children}</ul>,
                      ol: ({ children }) => <ol className="my-2 ml-4 list-decimal">{children}</ol>,
                      li: ({ children }) => <li className="my-0.5">{children}</li>,
                      table: ({ children }) => (
                        <div className="overflow-x-auto my-2">
                          <table className="border-collapse w-full text-sm">{children}</table>
                        </div>
                      ),
                      thead: ({ children }) => (
                        <thead className="bg-muted/50">{children}</thead>
                      ),
                      th: ({ children }) => (
                        <th className="border border-muted px-2 py-1 text-left font-semibold">{children}</th>
                      ),
                      td: ({ children }) => (
                        <td className="border border-muted px-2 py-1">{children}</td>
                      ),
                      strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
                      h1: ({ children }) => <h1 className="text-lg font-bold mt-3 mb-1">{children}</h1>,
                      h2: ({ children }) => <h2 className="text-base font-bold mt-2 mb-1">{children}</h2>,
                      h3: ({ children }) => <h3 className="text-sm font-bold mt-2 mb-1">{children}</h3>,
                    }}
                  >
                    {message.content}
                  </ReactMarkdown>
                </div>
                <span className="text-xs opacity-50 mt-2 block">
                  {message.timestamp.toLocaleTimeString()}
                </span>
              </CardContent>
            </Card>

            {message.role === 'user' && (
              <div className="flex-none">
                <div className="h-8 w-8 rounded-full bg-primary flex items-center justify-center">
                  <User className="h-4 w-4 text-primary-foreground" />
                </div>
              </div>
            )}
          </div>
        ))}

        {isProcessing && (
          <div className="flex gap-3 justify-start">
            <div className="flex-none">
              <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                <Bot className="h-4 w-4 text-primary" />
              </div>
            </div>
            <Card>
              <CardContent className="py-3 px-4">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Thinking...
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="flex-none pt-4 border-t">
        <div className="flex gap-2">
          <Textarea
            placeholder="Ask about partner API operations, organization setup, employee enrollment..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            className="min-h-[60px] resize-none"
            disabled={isProcessing}
          />
          <Button
            onClick={handleSend}
            disabled={!input.trim() || isProcessing}
            className="h-auto px-4"
          >
            {isProcessing ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Send className="h-5 w-5" />
            )}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          Press Enter to send, Shift+Enter for new line
        </p>
      </div>
    </div>
  );
}
