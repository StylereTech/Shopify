import React, { useState, useRef, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { AppShell } from '../components/layout/AppShell';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import type { ChatMessage } from '../types';

// Mock messages for demo
const getMockMessages = (orderId: string): ChatMessage[] => [
  {
    id: '1',
    orderId,
    sender: 'system',
    message: 'You are now connected with your Style.re courier.',
    timestamp: new Date(Date.now() - 10 * 60000).toISOString(),
  },
  {
    id: '2',
    orderId,
    sender: 'driver',
    message: "Hi! I'm on my way to pick up your items. Should be there in about 5 minutes.",
    timestamp: new Date(Date.now() - 8 * 60000).toISOString(),
  },
];

export const Chat: React.FC = () => {
  const { orderId } = useParams<{ orderId: string }>();
  const queryClient = useQueryClient();
  const [input, setInput] = useState('');
  const [useMock, setUseMock] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { data: messages, isLoading, error } = useQuery({
    queryKey: ['chat', orderId],
    queryFn: () => api.getChat(orderId!),
    refetchInterval: 5000,
    retry: 1,
    enabled: !!orderId && !useMock,
  });

  const [mockMessages, setMockMessages] = useState<ChatMessage[]>([]);

  useEffect(() => {
    if (error) {
      setUseMock(true);
      setMockMessages(getMockMessages(orderId ?? 'ORDER'));
    }
  }, [error, orderId]);

  const allMessages = useMock ? mockMessages : (messages ?? []);

  const sendMutation = useMutation({
    mutationFn: (msg: string) =>
      useMock
        ? Promise.resolve<ChatMessage>({
            id: Date.now().toString(),
            orderId: orderId ?? '',
            sender: 'customer',
            message: msg,
            timestamp: new Date().toISOString(),
          })
        : api.sendMessage(orderId!, msg),
    onSuccess: (newMsg) => {
      if (useMock) {
        setMockMessages((prev) => [...prev, newMsg]);
      } else {
        queryClient.invalidateQueries({ queryKey: ['chat', orderId] });
      }
    },
  });

  const handleSend = () => {
    const trimmed = input.trim();
    if (!trimmed) return;
    setInput('');
    sendMutation.mutate(trimmed);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [allMessages]);

  return (
    <AppShell title="Chat with Courier" showBack showNav={false}>
      <div className="flex flex-col h-[calc(100vh-120px)]">
        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-3">
          {isLoading && !useMock ? (
            <div className="flex justify-center py-12">
              <LoadingSpinner />
            </div>
          ) : (
            <>
              {allMessages.length === 0 && (
                <div className="text-center py-12 text-[#78716C] text-sm">
                  <p className="text-3xl mb-2">💬</p>
                  <p>No messages yet. Say hello to your courier!</p>
                </div>
              )}

              {allMessages.map((msg) => {
                const isCustomer = msg.sender === 'customer';
                const isSystem = msg.sender === 'system';

                if (isSystem) {
                  return (
                    <div key={msg.id} className="flex justify-center">
                      <span className="bg-[#E7E5E4] text-[#78716C] text-xs px-3 py-1 rounded-full">
                        {msg.message}
                      </span>
                    </div>
                  );
                }

                return (
                  <div
                    key={msg.id}
                    className={`flex ${isCustomer ? 'justify-end' : 'justify-start'} gap-2`}
                  >
                    {!isCustomer && (
                      <div className="w-8 h-8 rounded-full bg-[#FED7AA]/40 flex items-center justify-center text-sm flex-shrink-0 mt-auto">
                        🧑‍💼
                      </div>
                    )}
                    <div
                      className={`max-w-[75%] rounded-2xl px-4 py-2.5 ${
                        isCustomer
                          ? 'bg-[#F97316] text-white rounded-br-sm'
                          : 'bg-white border border-[#E7E5E4] text-[#1C1917] rounded-bl-sm'
                      }`}
                    >
                      <p className="text-sm leading-relaxed">{msg.message}</p>
                      <p className={`text-xs mt-1 ${isCustomer ? 'text-white/70' : 'text-[#78716C]'}`}>
                        {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>
                );
              })}

              {sendMutation.isPending && (
                <div className="flex justify-end">
                  <div className="bg-[#F97316]/70 text-white rounded-2xl rounded-br-sm px-4 py-2.5 max-w-[75%]">
                    <div className="flex gap-1 items-center py-1">
                      <div className="w-1.5 h-1.5 bg-white/70 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                      <div className="w-1.5 h-1.5 bg-white/70 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                      <div className="w-1.5 h-1.5 bg-white/70 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </>
          )}
        </div>

        {/* Error */}
        {sendMutation.isError && (
          <div className="px-4 py-2">
            <p className="text-xs text-red-500 text-center">Failed to send. Try again.</p>
          </div>
        )}

        {/* Input */}
        <div className="bg-white border-t border-[#E7E5E4] px-4 py-3 flex items-end gap-3">
          <div className="flex-1 bg-[#FAFAF9] border border-[#E7E5E4] rounded-2xl px-4 py-2.5 focus-within:ring-2 focus-within:ring-[#F97316] focus-within:border-transparent transition-all">
            <textarea
              className="w-full bg-transparent text-sm text-[#1C1917] placeholder:text-[#A8A29E] resize-none focus:outline-none max-h-24"
              placeholder="Message your courier…"
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
            />
          </div>
          <button
            onClick={handleSend}
            disabled={!input.trim() || sendMutation.isPending}
            className="w-10 h-10 rounded-full bg-[#F97316] flex items-center justify-center text-white disabled:opacity-50 disabled:cursor-not-allowed transition-all hover:bg-[#EA6B0E] flex-shrink-0"
          >
            <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          </button>
        </div>
      </div>
    </AppShell>
  );
};
