export interface Channel {
  id: string;
  name: string;
  unread?: boolean;
  mentions?: number;
}

export interface ChatMessage {
  id: string;
  userId: string;
  content: string;
  time: string;
  edited?: boolean;
  reactions?: { emoji: string; count: number; reacted?: boolean }[];
}

export interface Member {
  id: string;
  name: string;
  role?: string;
  status: "online" | "idle" | "dnd";
  color: string;
}

export const channels: Channel[] = [
  { id: "general", name: "general", unread: true },
  { id: "introductions", name: "introductions" },
  { id: "design", name: "design", mentions: 2 },
  { id: "development", name: "development", unread: true },
  { id: "showcase", name: "showcase" }
];

export const members: Member[] = [
  { id: "maya", name: "Maya Chen", role: "Admin", status: "online", color: "violet" },
  { id: "alex", name: "Alex Rivera", status: "online", color: "orange" },
  { id: "jules", name: "Jules Park", status: "idle", color: "pink" },
  { id: "sam", name: "Sam Okafor", status: "online", color: "blue" },
  { id: "riley", name: "Riley Morgan", status: "dnd", color: "emerald" },
  { id: "noor", name: "Noor Ali", status: "online", color: "amber" },
  { id: "leo", name: "Leo Kim", status: "idle", color: "cyan" },
  { id: "you", name: "You", status: "online", color: "indigo" }
];

export const initialMessages: ChatMessage[] = [
  { id: "m1", userId: "maya", content: "Morning, team! The new workspace is looking *really good* ✨", time: "9:14 AM", reactions: [{ emoji: "✨", count: 3 }, { emoji: "💜", count: 2 }] },
  { id: "m2", userId: "alex", content: "Agreed! I pushed the first pass of the dashboard this morning.", time: "9:16 AM" },
  { id: "m3", userId: "jules", content: "The tiny details are what make it feel special. **Love** the new color palette.", time: "9:18 AM", reactions: [{ emoji: "🎨", count: 4 }] },
  { id: "m4", userId: "sam", content: "Here's the new spacing token for reference:\n```css\n--space-section: 2rem;\n```", time: "9:22 AM" },
  { id: "m5", userId: "noor", content: "> Make it simple, but significant.\n\nThis has been my mood for the whole redesign.", time: "9:25 AM" },
  { id: "m6", userId: "riley", content: "I can take a look at the responsive states after standup.", time: "9:31 AM" },
  { id: "m7", userId: "maya", content: "That'd be great, Riley. **Mobile first** is the plan for this sprint.", time: "9:33 AM", reactions: [{ emoji: "🙌", count: 2 }] },
  { id: "m8", userId: "leo", content: "Just added the empty states to the prototype. Curious what everyone thinks.", time: "9:41 AM" },
  { id: "m9", userId: "alex", content: "These are excellent. The illustration on the inbox screen is a nice touch.", time: "9:44 AM", reactions: [{ emoji: "❤️", count: 3 }] },
  { id: "m10", userId: "jules", content: "Quick question: are we keeping the sidebar fixed on tablet?", time: "9:48 AM" },
  { id: "m11", userId: "maya", content: "Let's collapse it below 1024px and keep the channel switcher one tap away.", time: "9:52 AM" },
  { id: "m12", userId: "sam", content: "Makes sense. I can wire that up today.", time: "10:02 AM" },
  { id: "m13", userId: "noor", content: "Dropped a few notes in the **design** channel about the type scale.", time: "10:08 AM", reactions: [{ emoji: "👀", count: 1 }] },
  { id: "m14", userId: "riley", content: "The contrast on the muted text passes AA now ✅", time: "10:15 AM" },
  { id: "m15", userId: "leo", content: "Nice catch on the focus ring too. Keyboard flow feels much better.", time: "10:21 AM" },
  { id: "m16", userId: "alex", content: "Preview is up if anyone wants to try it: `localhost:5173`", time: "10:28 AM" },
  { id: "m17", userId: "maya", content: "I'll do a final pass before lunch. Thanks everyone!", time: "10:31 AM", reactions: [{ emoji: "☕", count: 2 }, { emoji: "💜", count: 4 }] },
  { id: "m18", userId: "you", content: "This is coming together so nicely. The new composer feels great.", time: "10:36 AM" },
  { id: "m19", userId: "sam", content: "Small reminder: design sync is at 11:30 today.", time: "10:39 AM" },
  { id: "m20", userId: "maya", content: "See you there! Bring your favorite tiny UI detail 🪄", time: "10:42 AM", reactions: [{ emoji: "🪄", count: 3 }] }
];
