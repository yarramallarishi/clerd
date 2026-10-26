import type { ChatMessage } from "../data";

export interface ApiChannel {
  id: string;
  server_id: string;
  parent_id: string | null;
  type: string;
  name: string;
  topic: string | null;
  position: number;
}

export interface ApiMember {
  id: string;
  uid: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  status: string;
  role_name: string | null;
  role_color: string | null;
}

export interface BootstrapResponse {
  user: {
    id: string;
    username: string;
    display_name: string | null;
    avatar_url: string | null;
  } | null;
  servers: Array<{ id: string; name: string; invite_code: string }>;
  channels: ApiChannel[];
  members: ApiMember[];
}

interface ApiMessage {
  id: string;
  author_id: string;
  username: string;
  display_name: string | null;
  content: string;
  created_at: number;
  edited_at: number | null;
  is_pinned: number;
}

export class ApiClient {
  constructor(private readonly getAccessToken: () => Promise<string>) {}

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const token = await this.getAccessToken();
    const response = await fetch(path, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
        ...init?.headers
      }
    });
    if (!response.ok) {
      const body = await response.json().catch(() => null) as { error?: string } | null;
      throw new Error(body?.error ?? `Request failed (${response.status})`);
    }
    return response.json() as Promise<T>;
  }

  bootstrap() {
    return this.request<BootstrapResponse>("/api/bootstrap");
  }

  createServer(name: string) {
    return this.request<{ id: string; name: string; invite_code: string }>("/api/servers", {
      method: "POST",
      body: JSON.stringify({ name })
    });
  }

  createChannel(serverId: string, name: string) {
    return this.request<ApiChannel>(`/api/servers/${encodeURIComponent(serverId)}/channels`, {
      method: "POST",
      body: JSON.stringify({ name })
    });
  }

  async messages(channelId: string): Promise<ChatMessage[]> {
    const result = await this.request<{ messages: ApiMessage[] }>(
      `/api/channels/${encodeURIComponent(channelId)}/messages?limit=50`
    );
    return result.messages.map((message) => ({
      id: message.id,
      userId: message.author_id,
      content: message.content,
      time: new Intl.DateTimeFormat([], { hour: "numeric", minute: "2-digit" }).format(message.created_at),
      edited: message.edited_at !== null
    }));
  }

  async websocketUrl(channelId: string): Promise<string> {
    const token = await this.getAccessToken();
    const url = new URL(`/api/channels/${encodeURIComponent(channelId)}/ws`, window.location.origin);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    url.searchParams.set("token", token);
    return url.toString();
  }
}
