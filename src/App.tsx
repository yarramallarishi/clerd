import { useAuth0 } from "@auth0/auth0-react";
import {
  ArrowDown,
  Bell,
  ChevronDown,
  ChevronRight,
  Hash,
  Headphones,
  HelpCircle,
  Inbox,
  Menu,
  MessageCircle,
  MoreHorizontal,
  Paperclip,
  Plus,
  Search,
  Send,
  Settings,
  Smile,
  Sparkles,
  Users,
  X
} from "lucide-react";
import {
  useCallback,
  FormEvent,
  KeyboardEvent,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { channels as initialChannels, ChatMessage, initialMessages, Member, members } from "./data";
import { ApiClient, ApiMember } from "./api/client";
import { useChannelSocket } from "./hooks/useChannelSocket";

const avatarStyles: Record<string, string> = {
  violet: "bg-violet-500",
  orange: "bg-orange-500",
  pink: "bg-pink-500",
  blue: "bg-sky-500",
  emerald: "bg-emerald-500",
  amber: "bg-amber-500",
  cyan: "bg-cyan-600",
  indigo: "bg-indigo-500"
};

function Avatar({ member, size = "normal" }: { member: Member; size?: "normal" | "small" }) {
  const initials = member.name.split(" ").map((part) => part[0]).join("").slice(0, 2);
  return (
    <span
      aria-label={member.name}
      className={`avatar__image ${avatarStyles[member.color] ?? "bg-slate-500"} ${size === "small" ? "h-8 w-8 text-[10px]" : "h-10 w-10 text-xs"}`}
    >
      {initials}
    </span>
  );
}

function renderInline(text: string) {
  const pieces = text.split(/(\*\*.*?\*\*|\*.*?\*|`[^`]+`)/g);
  return pieces.map((piece, index) => {
    if (piece.startsWith("**") && piece.endsWith("**")) {
      return <strong key={index} className="font-semibold text-slate-100">{piece.slice(2, -2)}</strong>;
    }
    if (piece.startsWith("*") && piece.endsWith("*")) {
      return <em key={index}>{piece.slice(1, -1)}</em>;
    }
    if (piece.startsWith("`") && piece.endsWith("`")) {
      return <code key={index} className="rounded bg-slate-950/70 px-1.5 py-0.5 font-mono text-[0.9em] text-violet-200">{piece.slice(1, -1)}</code>;
    }
    return piece;
  });
}

function MessageContent({ content }: { content: string }) {
  const blocks = content.split(/(```[\s\S]*?```)/g).filter(Boolean);
  return (
    <div className="message__content">
      {blocks.map((block, index) => {
        if (block.startsWith("```") && block.endsWith("```")) {
          const code = block.slice(3, -3).replace(/^[a-zA-Z]+\n/, "");
          return <pre key={index} className="message__code"><code>{code.trim()}</code></pre>;
        }
        return block.split("\n").map((line, lineIndex) => {
          const quoted = line.startsWith("> ");
          return quoted ? (
            <blockquote key={`${index}-${lineIndex}`} className="message__quote">{renderInline(line.slice(2))}</blockquote>
          ) : (
            <span key={`${index}-${lineIndex}`}>{renderInline(line)}{lineIndex < block.split("\n").length - 1 && <br />}</span>
          );
        });
      })}
    </div>
  );
}

function MessageItem({
  message,
  member,
  onReact
}: {
  message: ChatMessage;
  member: Member;
  onReact: (messageId: string, emoji: string) => void;
}) {
  return (
    <article className="message group" aria-label={`Message from ${member.name} at ${message.time}`}>
      <Avatar member={member} />
      <div className="message__body min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="message__username">{member.name}</span>
          {member.role === "Admin" && <span className="rounded bg-indigo-500/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-indigo-300">Admin</span>}
          <time className="message__time">{message.time}</time>
          {message.edited && <span className="message__time">(edited)</span>}
        </div>
        <MessageContent content={message.content} />
        {message.reactions && message.reactions.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {message.reactions.map((reaction) => (
              <button
                key={reaction.emoji}
                type="button"
                onClick={() => onReact(message.id, reaction.emoji)}
                aria-label={`${reaction.emoji}, ${reaction.count} reactions`}
                className={`message__reaction ${reaction.reacted ? "border-violet-400/60 bg-violet-500/20" : ""}`}
              >
                <span>{reaction.emoji}</span><span>{reaction.count}</span>
              </button>
            ))}
            <button type="button" className="message__reaction-add" aria-label="Add a reaction" onClick={() => onReact(message.id, "✨")}>+</button>
          </div>
        )}
        {!message.reactions && (
          <div className="message__toolbar" aria-label="Message actions">
            <button type="button" title="Add reaction" aria-label="Add reaction" onClick={() => onReact(message.id, "✨")}><Smile size={15} /></button>
            <button type="button" title="Reply" aria-label="Reply to message"><MessageCircle size={15} /></button>
            <button type="button" title="More options" aria-label="More message options"><MoreHorizontal size={16} /></button>
          </div>
        )}
      </div>
    </article>
  );
}

function MemberList({ memberList, onClose }: { memberList: Member[]; onClose?: () => void }) {
  const [query, setQuery] = useState("");
  const filteredMembers = useMemo(
    () => memberList.filter((member) => member.name.toLowerCase().includes(query.trim().toLowerCase())),
    [memberList, query]
  );
  return (
    <aside className="members__panel" aria-label="Server members">
      <div className="members__heading">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Members</p>
          <p className="mt-1 text-xs text-slate-500">{memberList.length} people here</p>
        </div>
        {onClose && <button type="button" className="icon-button lg:hidden" aria-label="Close member list" onClick={onClose}><X size={18} /></button>}
      </div>
      <label className="members__search">
        <Search size={15} aria-hidden="true" />
        <span className="sr-only">Search members</span>
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find a member" />
        {query && <button type="button" aria-label="Clear member search" onClick={() => setQuery("")}><X size={14} /></button>}
      </label>
      <div className="members__list">
        <p className="members__group-label">MEMBERS — {filteredMembers.length}</p>
        {filteredMembers.map((member) => (
          <button key={member.id} type="button" className="members__member">
            <span className="relative"><Avatar member={member} size="small" /><span className={`members__status members__status--${member.status}`} /></span>
            <span className="min-w-0 flex-1 truncate text-left">
              <span className="block truncate text-sm font-medium text-slate-200">{member.name}</span>
              {member.role && <span className="block text-[11px] text-slate-500">{member.role}</span>}
            </span>
            <span className="sr-only">{member.status}</span>
          </button>
        ))}
        {filteredMembers.length === 0 && <p className="px-3 py-4 text-sm text-slate-500">No members found.</p>}
      </div>
    </aside>
  );
}

export default function App() {
  const { getAccessTokenSilently, isAuthenticated, isLoading, loginWithRedirect, logout, user } = useAuth0();
  const api = useMemo(() => new ApiClient(async () => {
    const token = await getAccessTokenSilently();
    if (!token) throw new Error("Auth0 did not return an access token.");
    return token;
  }), [getAccessTokenSilently]);
  const [activeChannel, setActiveChannel] = useState(initialChannels[0]);
  const [messages, setMessages] = useState(initialMessages);
  const [draft, setDraft] = useState("");
  const [visibleCount, setVisibleCount] = useState(8);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [membersOpen, setMembersOpen] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [channelList, setChannelList] = useState(initialChannels);
  const [memberList, setMemberList] = useState(members);
  const [serverId, setServerId] = useState("");
  const [serverName, setServerName] = useState("The Cozy Corner");
  const [inviteCode, setInviteCode] = useState("");
  const [bootstrapReady, setBootstrapReady] = useState(false);
  const [apiError, setApiError] = useState("");
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const [showCreateChannel, setShowCreateChannel] = useState(false);
  const [channelName, setChannelName] = useState("");
  const messageEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const memberById = useMemo(() => new Map(memberList.map((member) => [member.id, member])), [memberList]);
  const visibleMessages = messages.slice(-visibleCount);

  const appendIncomingMessage = useCallback((message: ChatMessage) => {
    setMessages((current) => current.some((item) => item.id === message.id) ? current : [...current, message]);
  }, []);

  const handleSocketEvent = useCallback((event: { type: string; senderId?: string; username?: string }) => {
    if (event.type !== "TYPING_START" || !event.senderId || event.senderId === user?.sub) return;
    const name = event.username ?? memberById.get(event.senderId)?.name ?? "Someone";
    setTypingUsers((current) => current.includes(name) ? current : [...current, name]);
    window.setTimeout(() => setTypingUsers((current) => current.filter((item) => item !== name)), 2500);
  }, [memberById, user?.sub]);

  useEffect(() => {
    if (!isAuthenticated) {
      setBootstrapReady(false);
      setApiError("");
      setMessages(initialMessages);
      setChannelList(initialChannels);
      setActiveChannel(initialChannels[0]);
      setMemberList(members);
      return;
    }

    let cancelled = false;
    const loadWorkspace = async () => {
      setApiError("");
      setBootstrapReady(false);
      setMessages([]);
      try {
        let workspace = await api.bootstrap();
        if (workspace.servers.length === 0) {
          await api.createServer("The Cozy Corner");
          workspace = await api.bootstrap();
        }
        if (cancelled) return;

        const server = workspace.servers[0];
        const textChannels = workspace.channels
          .filter((channel) => channel.type === "text")
          .map((channel) => ({ id: channel.id, name: channel.name }));
        if (server) {
          setServerId(server.id);
          setServerName(server.name);
          setInviteCode(server.invite_code);
        }
        if (textChannels.length > 0) {
          setChannelList(textChannels);
          setActiveChannel((selected) => textChannels.find((channel) => channel.id === selected.id) ?? textChannels[0]);
        } else {
          setChannelList([]);
          setApiError("This server has no text channels yet.");
        }
        if (workspace.members.length > 0) {
          const palette = ["violet", "orange", "pink", "blue", "emerald", "amber", "cyan", "indigo"];
          setMemberList(workspace.members.map((member: ApiMember, index) => ({
            id: member.id,
            name: member.display_name || member.username,
            role: member.role_name ?? undefined,
            status: member.status === "idle" || member.status === "dnd" ? member.status : "online",
            color: palette[index % palette.length]
          })));
        }
        setMessages([]);
        setBootstrapReady(true);
      } catch (error) {
        if (!cancelled) setApiError(error instanceof Error ? error.message : "Could not load your workspace.");
      }
    };
    void loadWorkspace();
    return () => { cancelled = true; };
  }, [api, isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated || !bootstrapReady || !channelList.some((channel) => channel.id === activeChannel.id)) return;
    let cancelled = false;
    setMessages([]);
    setApiError("");
    api.messages(activeChannel.id)
      .then((history) => {
        if (cancelled) return;
        setMessages((current) => {
          const historyIds = new Set(history.map((message) => message.id));
          return [...history, ...current.filter((message) => !historyIds.has(message.id))];
        });
      })
      .catch((error: unknown) => {
        if (!cancelled) setApiError(error instanceof Error ? error.message : "Could not load channel messages.");
      });
    return () => { cancelled = true; };
  }, [activeChannel.id, api, bootstrapReady, channelList, isAuthenticated]);

  const { connected, send: sendSocketEvent } = useChannelSocket({
    channelId: activeChannel.id,
    api,
    enabled: isAuthenticated && bootstrapReady && channelList.some((channel) => channel.id === activeChannel.id),
    onMessage: appendIncomingMessage,
    onEvent: handleSocketEvent,
    onError: (error) => setApiError(error.message)
  });

  // Keep the newest message in view when opening a channel or sending a message.
  useEffect(() => {
    messageEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [activeChannel.id, messages.length]);

  function sendMessage(event?: FormEvent) {
    event?.preventDefault();
    const content = draft.trim();
    if (!content) return;
    if (isAuthenticated) {
      if (!connected || !sendSocketEvent({ type: "MESSAGE_CREATE", content })) {
        setApiError("Channel is reconnecting. Your message has not been sent.");
        return;
      }
      setApiError("");
      setDraft("");
      if (textareaRef.current) textareaRef.current.style.height = "auto";
      return;
    }
    setMessages((current) => [
      ...current,
      {
        id: `local-${Date.now()}`,
        userId: "you",
        content,
        time: new Intl.DateTimeFormat([], { hour: "numeric", minute: "2-digit" }).format(new Date())
      }
    ]);
    setDraft("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
  }

  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  }

  function handleDraftChange(value: string) {
    setDraft(value);
    if (isAuthenticated && value.trim()) sendSocketEvent({ type: "TYPING_START" });
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`;
  }

  function toggleReaction(messageId: string, emoji: string) {
    setMessages((current) => current.map((message) => {
      if (message.id !== messageId) return message;
      const reactions = message.reactions ?? [];
      const existing = reactions.find((reaction) => reaction.emoji === emoji);
      return {
        ...message,
        reactions: existing
          ? reactions.map((reaction) => reaction.emoji === emoji
            ? { ...reaction, count: reaction.count + (reaction.reacted ? -1 : 1), reacted: !reaction.reacted }
            : reaction)
          : [...reactions, { emoji, count: 1, reacted: true }]
      };
    }));
  }

  async function createChannel(event: FormEvent) {
    event.preventDefault();
    const name = channelName.trim().toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-");
    if (!name || channelList.some((channel) => channel.name === name)) return;
    try {
      const channel = isAuthenticated
        ? await api.createChannel(serverId, name)
        : { id: `local-${Date.now()}`, name };
      setChannelList((current) => [...current, { id: channel.id, name: channel.name }]);
      setActiveChannel({ id: channel.id, name: channel.name });
      setChannelName("");
      setShowCreateChannel(false);
      setSidebarOpen(false);
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "Could not create the channel.");
    }
  }

  const currentMember = isAuthenticated
    ? { id: user?.sub ?? "you", name: user?.name ?? "You", status: "online" as const, color: "indigo" }
    : members.find((member) => member.id === "you") ?? members[members.length - 1];
  const displayMembers = memberList.some((member) => member.id === currentMember.id)
    ? memberList
    : [...memberList, currentMember];

  return (
    <main className="app-shell">
      {sidebarOpen && <button className="drawer__scrim lg:hidden" aria-label="Close channel menu" onClick={() => setSidebarOpen(false)} />}
      <aside className={`sidebar__panel ${sidebarOpen ? "sidebar__panel--open" : ""}`} aria-label="Server channels">
        <button type="button" className="server__header">
          <span className="server__logo"><Sparkles size={21} /></span>
          <span className="min-w-0 flex-1 text-left">
            <span className="block truncate font-bold text-white">{serverName}</span>
            <span className="mt-0.5 block text-xs font-normal text-slate-400">Creative community</span>
          </span>
          <ChevronDown size={17} className="text-slate-400" />
        </button>
        <div className="sidebar__scroll">
          <div className="sidebar__section">
            <div className="sidebar__section-heading">
              <span>YOUR CHANNELS</span>
              <button type="button" className="sidebar__add" aria-label="Add channel" title="Add channel" onClick={() => setShowCreateChannel(true)}><Plus size={17} /></button>
            </div>
            <nav aria-label="Text channels" className="space-y-1">
              {channelList.map((channel) => (
                <button
                  key={channel.id}
                  type="button"
                  onClick={() => { setActiveChannel(channel); setSidebarOpen(false); }}
                  aria-current={activeChannel.id === channel.id ? "page" : undefined}
                  className={`sidebar__channel ${activeChannel.id === channel.id ? "sidebar__channel--active" : ""}`}
                >
                  <Hash size={17} className={activeChannel.id === channel.id ? "text-slate-200" : "text-slate-500"} />
                  <span className="min-w-0 flex-1 truncate">{channel.name}</span>
                  {channel.mentions && <span className="sidebar__mention">{channel.mentions}</span>}
                  {channel.unread && !channel.mentions && <span className="h-1.5 w-1.5 rounded-full bg-slate-200" />}
                </button>
              ))}
            </nav>
          </div>
          <div className="sidebar__section">
            <div className="sidebar__section-heading"><span>VOICE CHANNELS</span><button type="button" className="sidebar__add" aria-label="Add voice channel"><Plus size={17} /></button></div>
            <button type="button" className="sidebar__channel"><span className="text-lg leading-none text-slate-500">◖</span><span>Chill lounge</span></button>
            <div className="sidebar__voice-status"><span className="h-2 w-2 rounded-full bg-emerald-400" /><span>2 people hanging out</span></div>
            <div className="sidebar__voice-avatars"><Avatar member={displayMembers[0] ?? currentMember} size="small" /><Avatar member={displayMembers[1] ?? currentMember} size="small" /></div>
          </div>
          <div className="sidebar__promo">
            <span className="sidebar__promo-icon"><Sparkles size={17} /></span>
            <p className="text-sm font-semibold text-white">Make yourself at home</p>
            <p className="mt-1 text-xs leading-5 text-slate-400">A little space for big ideas and good conversations.</p>
          </div>
        </div>
        <div className="sidebar__user">
          <Avatar member={currentMember} size="small" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold text-white">{isAuthenticated ? user?.name ?? "You" : "Guest"}</span>
            <span className="block truncate text-[11px] text-slate-400">{isAuthenticated ? "Online" : "Preview mode"}</span>
          </span>
          {!isLoading && (isAuthenticated
            ? <button type="button" onClick={() => logout({ logoutParams: { returnTo: window.location.origin } })} className="user__action" aria-label="Log out" title="Log out"><Settings size={17} /></button>
            : <button type="button" onClick={() => loginWithRedirect()} className="user__login">Log in</button>)}
          <button type="button" className="user__action" aria-label="Deafen"><Headphones size={17} /></button>
        </div>
      </aside>

      <section className="chat__panel" aria-label={`#${activeChannel.name} channel`}>
        <header className="chat__header">
          <button type="button" className="icon-button -ml-2 lg:hidden" aria-label="Open channel menu" onClick={() => setSidebarOpen(true)}><Menu size={20} /></button>
          <Hash size={21} className="text-slate-500" />
          <h1 className="min-w-0 flex-1 truncate text-base font-bold text-white">{activeChannel.name}</h1>
          <span className="chat__header-divider" />
          <p className="chat__topic hidden truncate md:block">A little space for big ideas and good conversations.</p>
          <div className="ml-auto flex items-center gap-1">
            <button type="button" className="chat__header-action hidden sm:inline-flex" aria-label="Notifications" title="Notifications"><Bell size={18} /></button>
            <button type="button" className="chat__header-action hidden sm:inline-flex" aria-label="Inbox" title="Inbox"><Inbox size={18} /></button>
            <button type="button" className="chat__header-action" aria-label="Toggle member list" aria-pressed={membersOpen} title="Toggle members" onClick={() => setMembersOpen((open) => !open)}><Users size={18} /></button>
            <button type="button" className="chat__invite" onClick={() => {
              if (inviteCode) void navigator.clipboard?.writeText(`${window.location.origin}/invite/${inviteCode}`);
            }}><Plus size={15} /><span>Invite</span></button>
          </div>
        </header>
        <div className="chat__body">
          {apiError && <p className="mx-5 mt-3 rounded-lg border border-rose-400/20 bg-rose-500/10 px-3 py-2 text-xs text-rose-200" role="alert">{apiError}</p>}
          {isAuthenticated && bootstrapReady && <p className="sr-only" aria-live="polite">{connected ? "Live channel connected" : "Reconnecting to channel"}</p>}
          <section className="messages__scroll" aria-label="Messages">
            <div className="messages__welcome">
              <div className="messages__welcome-icon"><Hash size={26} /></div>
              <h2>Welcome to #{activeChannel.name}</h2>
              <p>This is the beginning of the <strong>#{activeChannel.name}</strong> channel. Say hello 👋</p>
            </div>
            {visibleCount < messages.length && (
              <div className="messages__load">
                <button type="button" onClick={() => setVisibleCount((count) => Math.min(count + 8, messages.length))}>Load earlier messages</button>
              </div>
            )}
            <div className="messages__day"><span>Today</span></div>
            <div className="space-y-0.5">
              {visibleMessages.map((message) => (
                <MessageItem
                  key={message.id}
                  message={message}
                  member={memberById.get(message.userId) ?? currentMember}
                  onReact={toggleReaction}
                />
              ))}
            </div>
            {typingUsers.length > 0 && <p className="px-3 py-2 text-xs text-slate-500" aria-live="polite">{typingUsers.join(", ")} {typingUsers.length === 1 ? "is" : "are"} typing...</p>}
            <div ref={messageEndRef} />
          </section>
          {membersOpen && <div className="members__mobile-overlay lg:hidden"><MemberList memberList={displayMembers} onClose={() => setMembersOpen(false)} /></div>}
          <div className="composer__wrap">
            <form className="composer" onSubmit={sendMessage}>
              <button type="button" className="composer__attach" aria-label="Attach a file"><Paperclip size={19} /></button>
              <textarea
                ref={textareaRef}
                value={draft}
                onChange={(event) => handleDraftChange(event.target.value)}
                onKeyDown={handleComposerKeyDown}
                placeholder={`Message #${activeChannel.name}`}
                rows={1}
                aria-label={`Message #${activeChannel.name}`}
              />
              <div className="composer__tools">
                <button type="button" className="composer__emoji" aria-label="Open emoji picker" aria-expanded={emojiOpen} onClick={() => setEmojiOpen((open) => !open)}><Smile size={20} /></button>
                <button type="submit" className="composer__send" aria-label="Send message" disabled={!draft.trim()}><Send size={17} /></button>
              </div>
              {emojiOpen && (
                <div className="composer__emoji-popover" role="group" aria-label="Choose an emoji">
                  {["😀", "🎉", "💜", "✨", "👋", "🔥", "🙌", "☕"].map((emoji) => (
                    <button key={emoji} type="button" onClick={() => { handleDraftChange(`${draft}${emoji}`); setEmojiOpen(false); textareaRef.current?.focus(); }} aria-label={`Insert ${emoji}`}>{emoji}</button>
                  ))}
                </div>
              )}
            </form>
            <p className="composer__hint"><kbd>Enter</kbd> to send <span>·</span> <kbd>Shift + Enter</kbd> for a new line</p>
          </div>
        </div>
      </section>

      <aside className="members__desktop"><MemberList memberList={displayMembers} /></aside>

      {showCreateChannel && (
        <div className="modal__backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowCreateChannel(false); }}>
          <section className="modal" role="dialog" aria-modal="true" aria-labelledby="create-channel-title">
            <button type="button" className="modal__close" onClick={() => setShowCreateChannel(false)} aria-label="Close dialog"><X size={19} /></button>
            <div className="modal__icon"><Hash size={22} /></div>
            <h2 id="create-channel-title">Create a channel</h2>
            <p>Give your next conversation a place to live.</p>
            <form onSubmit={createChannel}>
              <label htmlFor="channel-name">CHANNEL NAME</label>
              <div className="modal__input"><Hash size={17} /><input id="channel-name" value={channelName} onChange={(event) => setChannelName(event.target.value)} placeholder="new-channel" maxLength={50} autoFocus /></div>
              {channelName.trim() && channelList.some((channel) => channel.name === channelName.trim().toLowerCase()) && <span className="mt-2 block text-xs text-rose-300">A channel with that name already exists.</span>}
              <div className="mt-6 flex justify-end gap-3">
                <button type="button" className="modal__cancel" onClick={() => setShowCreateChannel(false)}>Cancel</button>
                <button type="submit" className="modal__submit" disabled={!channelName.trim()}>Create channel</button>
              </div>
            </form>
          </section>
        </div>
      )}

      <div className="sr-only" aria-live="polite">{visibleMessages.length} messages displayed</div>
      <button type="button" className="scroll-bottom" aria-label="Scroll to latest message" onClick={() => messageEndRef.current?.scrollIntoView({ behavior: "smooth" })}><ArrowDown size={16} /></button>
      <button type="button" className="help-button" aria-label="Help"><HelpCircle size={17} /><ChevronRight size={12} /></button>
    </main>
  );
}
