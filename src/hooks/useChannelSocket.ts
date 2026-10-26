import { useCallback, useEffect, useRef, useState } from "react";
import type { ApiClient } from "../api/client";
import type { ChatMessage } from "../data";

export interface ChannelSocketEvent {
  type: string;
  message?: {
    id: string;
    author_id: string;
    username: string;
    content: string;
    created_at: number;
  };
  senderId?: string;
  username?: string;
  isStreaming?: boolean;
  streamTitle?: string;
  streamQuality?: string;
}

interface UseChannelSocketOptions {
  channelId?: string;
  api: ApiClient;
  enabled: boolean;
  onMessage: (message: ChatMessage) => void;
  onEvent?: (event: ChannelSocketEvent) => void;
  onError?: (error: Error) => void;
}

export function useChannelSocket({
  channelId,
  api,
  enabled,
  onMessage,
  onEvent,
  onError
}: UseChannelSocketOptions) {
  const socketRef = useRef<WebSocket | null>(null);
  const retryTimerRef = useRef<number | undefined>(undefined);
  const callbacksRef = useRef({ onMessage, onEvent, onError });
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    callbacksRef.current = { onMessage, onEvent, onError };
  }, [onError, onEvent, onMessage]);

  useEffect(() => {
    if (!enabled || !channelId) {
      setConnected(false);
      return;
    }

    let disposed = false;
    let retryCount = 0;
    let socket: WebSocket | null = null;
    let stableConnectionTimer: number | undefined;

    const connect = async () => {
      try {
        const url = await api.websocketUrl(channelId);
        if (disposed) return;
        socket = new WebSocket(url);
        socketRef.current = socket;

        socket.addEventListener("open", () => {
          setConnected(true);
          stableConnectionTimer = window.setTimeout(() => { retryCount = 0; }, 10000);
        });
        socket.addEventListener("message", (event) => {
          try {
            const data = JSON.parse(String(event.data)) as ChannelSocketEvent;
            if (data.type === "MESSAGE_CREATED" && data.message) {
              callbacksRef.current.onMessage({
                id: data.message.id,
                userId: data.message.author_id,
                content: data.message.content,
                time: new Intl.DateTimeFormat([], { hour: "numeric", minute: "2-digit" }).format(data.message.created_at)
              });
            }
            callbacksRef.current.onEvent?.(data);
          } catch (error) {
            callbacksRef.current.onError?.(error instanceof Error ? error : new Error("Invalid WebSocket event"));
          }
        });
        socket.addEventListener("error", () => {
          callbacksRef.current.onError?.(new Error("Channel connection encountered an error."));
        });
        socket.addEventListener("close", () => {
          if (socketRef.current === socket) socketRef.current = null;
          if (stableConnectionTimer !== undefined) window.clearTimeout(stableConnectionTimer);
          setConnected(false);
          if (!disposed) {
            const delay = Math.min(1000 * 2 ** retryCount, 30000) + Math.random() * 300;
            retryCount += 1;
            retryTimerRef.current = window.setTimeout(connect, delay);
          }
        });
      } catch (error) {
        callbacksRef.current.onError?.(error instanceof Error ? error : new Error("Could not connect to channel."));
        if (!disposed) {
          const delay = Math.min(1000 * 2 ** retryCount, 30000) + Math.random() * 300;
          retryCount += 1;
          retryTimerRef.current = window.setTimeout(connect, delay);
        }
      }
    };

    void connect();
    return () => {
      disposed = true;
      if (retryTimerRef.current !== undefined) window.clearTimeout(retryTimerRef.current);
      if (stableConnectionTimer !== undefined) window.clearTimeout(stableConnectionTimer);
      socketRef.current = null;
      socket?.close();
      setConnected(false);
    };
  }, [api, channelId, enabled]);

  const send = useCallback((event: Record<string, unknown>) => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return false;
    socket.send(JSON.stringify(event));
    return true;
  }, []);

  return { connected, send };
}
