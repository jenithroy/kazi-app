import { useState, useEffect, useRef, useMemo } from "react";
import { useAuth } from "../context/AuthContext";
import { Icons, Avatar } from "../components/ui";
import { fetchAll, insertRow, subscribe } from "../lib/db";

const MESSENGER_API_URL = import.meta.env.VITE_MESSENGER_API_URL;
const PAGE_ID = import.meta.env.VITE_MESSENGER_PAGE_ID;

// Mock data for Sandbox Demo Mode
const MOCK_THREADS = [
  {
    id: "demo_thread_1",
    name: "John Miller (Next plc)",
    avatarUrl: "",
    unreadCount: 2,
    updatedTime: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
    messages: [
      { id: "m1", text: "Hi, I am checking on our apparel order.", sender: "client", createdTime: new Date(Date.now() - 30 * 60 * 1000).toISOString() },
      { id: "m2", text: "Hello John, let me check that with Wilson at the Kathmandu factory.", sender: "agent", createdTime: new Date(Date.now() - 25 * 60 * 1000).toISOString() },
      { id: "m3", text: "Hey, did you check the cutting progress on order #ORD-082?", sender: "client", createdTime: new Date(Date.now() - 5 * 60 * 1000).toISOString() }
    ],
    botResponses: [
      "Awesome, thanks for the update! Please let me know as soon as the cutting is completed.",
      "Great. I will tell the UK directors we are on track. Keep me updated!",
      "Received, thank you!"
    ]
  },
  {
    id: "demo_thread_2",
    name: "Monika Sen",
    avatarUrl: "",
    unreadCount: 0,
    updatedTime: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    messages: [
      { id: "m4", text: "Hi there, I need the invoice for batch #QC-014.", sender: "client", createdTime: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString() },
      { id: "m5", text: "Sure, let me generate the invoice for you in the Billing module.", sender: "agent", createdTime: new Date(Date.now() - 2.5 * 60 * 60 * 1000).toISOString() },
      { id: "m6", text: "Can you send the PDF invoice for the last batch here?", sender: "client", createdTime: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString() }
    ],
    botResponses: [
      "Perfect, I received the PDF document. Thank you so much for the quick response!",
      "I appreciate your help. Have a great day!"
    ]
  },
  {
    id: "demo_thread_3",
    name: "Wilson (Kathmandu HQ)",
    avatarUrl: "",
    unreadCount: 0,
    updatedTime: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
    messages: [
      { id: "m7", text: "Hi Zen, I registered the daily clock-in records.", sender: "client", createdTime: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString() },
      { id: "m8", text: "Excellent, thank you Wilson.", sender: "agent", createdTime: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString() }
    ],
    botResponses: [
      "I will submit the budget request for sewing threads tomorrow morning.",
      "Understood."
    ]
  }
];

function Messenger() {
  const { user, profile } = useAuth();
  const agentName = profile?.name || "ERP User";

  // Check if live credentials exist
  const isConfigured = !!MESSENGER_API_URL;

  const [useDemo, setUseDemo] = useState(!isConfigured);
  const [threads, setThreads] = useState([]);
  const [activeThreadId, setActiveThreadId] = useState(null);
  const [messages, setMessages] = useState([]);

  // Helper to fetch request headers with ID token
  async function getAuthHeaders() {
    if (!user) return {};
    const token = await user.getIdToken();
    return {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json"
    };
  }
  const [searchQuery, setSearchQuery] = useState("");
  const [inputText, setInputText] = useState("");
  
  // Loading & Action states
  const [loadingThreads, setLoadingThreads] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const messagesEndRef = useRef(null);

  // Load threads and listen to messages in real-time via Firestore
  useEffect(() => {
    if (useDemo) {
      // Initialize with demo threads
      setThreads(MOCK_THREADS);
      setActiveThreadId(MOCK_THREADS[0].id);
      setMessages(MOCK_THREADS[0].messages);
      return;
    }

    if (!MESSENGER_API_URL) {
      setErrorMsg("Meta Proxy API URL not configured in environment variables.");
      return;
    }

    // Reload on any change, so a reply typed elsewhere shows up here too.
    const loadMessages = async () => {
      const allMsgs = await fetchAll("messages", { orderBy: "timestamp", orderDir: "asc" });

      // Group messages by threadId (which represents the customer's PSID)
      const threadGroups = {};
      allMsgs.forEach((msg) => {
        const threadId = msg.threadId || msg.senderId;
        if (!threadId || threadId === "page" || threadId === "agent") return;

        if (!threadGroups[threadId]) {
          threadGroups[threadId] = {
            id: threadId,
            name: `User ${threadId.slice(-4) || threadId}`,
            avatarUrl: "",
            unreadCount: 0,
            updatedTime: msg.timestamp,
            messages: [],
            lastMessage: ""
          };
        }

        // Add to this conversation's list
        threadGroups[threadId].messages.push({
          id: msg.id,
          text: msg.text,
          sender: msg.senderId === "page" || msg.senderId === "agent" ? "agent" : "client",
          createdTime: msg.timestamp
        });

        // Update last message preview
        threadGroups[threadId].lastMessage = msg.text;
        threadGroups[threadId].updatedTime = msg.timestamp;
      });

      // Convert to array and sort by latest updated message timestamp
      const sortedThreads = Object.values(threadGroups).sort((a, b) => {
        return new Date(b.updatedTime) - new Date(a.updatedTime);
      });

      setThreads(sortedThreads);

      // Auto-select first thread if none is selected
      if (sortedThreads.length > 0) {
        setActiveThreadId(prev => {
          if (prev && sortedThreads.find(t => t.id === prev)) {
            return prev;
          }
          return sortedThreads[0].id;
        });
      }
    };

    const run = () => loadMessages().catch((err) => {
      console.error("Failed to load messages:", err);
      setErrorMsg("Failed to read messages from the database.");
    });

    run();
    const unsubscribe = subscribe("messages", run);
    return () => unsubscribe();
  }, [useDemo]);

  // Sync active thread messages to screen
  useEffect(() => {
    if (!activeThreadId) return;

    if (useDemo) {
      const activeTh = threads.find(t => t.id === activeThreadId);
      if (activeTh) {
        setMessages(activeTh.messages);
        setThreads(prev => prev.map(t => t.id === activeThreadId ? { ...t, unreadCount: 0 } : t));
      }
    } else {
      const activeTh = threads.find(t => t.id === activeThreadId);
      if (activeTh) {
        setMessages(activeTh.messages);
      }
    }
  }, [activeThreadId, threads, useDemo]);

  // Scroll to bottom on message updates
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Fetch Live Threads (No-op as Firestore syncs in real-time)
  async function fetchLiveThreads() {
    console.log("Firestore real-time sync is active. No manual refresh needed.");
  }

  // Fetch Live Messages (No-op as Firestore syncs in real-time)
  async function fetchLiveMessages(conversationId) {
    console.log("Firestore real-time sync is active. Messages loaded from memory.");
  }

  // Send Message
  async function handleSendMessage(e) {
    e.preventDefault();
    if (!inputText.trim() || !activeThreadId) return;

    const messageText = inputText.trim();
    setInputText("");
    setSending(true);

    if (useDemo) {
      // Demo Mode simulated sending
      setTimeout(() => {
        const newMsg = {
          id: `m_sent_${Date.now()}`,
          text: messageText,
          sender: "agent",
          createdTime: new Date().toISOString()
        };

        // Append sent message
        setMessages(prev => [...prev, newMsg]);

        // Update thread preview
        setThreads(prev => prev.map(t => {
          if (t.id === activeThreadId) {
            return {
              ...t,
              lastMessage: messageText,
              updatedTime: new Date().toISOString(),
              messages: [...t.messages, newMsg]
            };
          }
          return t;
        }));

        setSending(false);

        // Simulated Customer Bot response after 1.5s
        setTimeout(() => {
          const activeTh = threads.find(t => t.id === activeThreadId);
          if (!activeTh) return;

          const responseText = activeTh.botResponses?.[activeTh.messages.filter(m => m.sender === "agent").length % activeTh.botResponses.length] 
            || "Thanks for writing back!";
            
          const clientMsg = {
            id: `m_reply_${Date.now()}`,
            text: responseText,
            sender: "client",
            createdTime: new Date().toISOString()
          };

          setMessages(prev => [...prev, clientMsg]);
          setThreads(prev => prev.map(t => {
            if (t.id === activeThreadId) {
              return {
                ...t,
                lastMessage: responseText,
                unreadCount: t.unreadCount + 1,
                updatedTime: new Date().toISOString(),
                messages: [...t.messages, clientMsg]
              };
            }
            return t;
          }));
        }, 1500);

      }, 500);

    } else {
      // Live Mode API request via secure proxy
      try {
        const activeTh = threads.find(t => t.id === activeThreadId);
        if (!activeTh) throw new Error("Thread not found");

        const targetPsid = activeTh.id; // Thread ID is the customer's PSID
        
        // POST to our secure Cloud Function proxy
        const headers = await getAuthHeaders();
        const response = await fetch(MESSENGER_API_URL, {
          method: "POST",
          headers,
          body: JSON.stringify({
            action: "sendMessage",
            recipientPsid: targetPsid,
            messageText: messageText
          })
        });

        if (!response.ok) {
          const errData = await response.json();
          throw new Error(errData.error || "Failed to send message via Meta Graph API proxy");
        }

        // Save the sent message to Firestore messages collection
        await insertRow("messages", {
          threadId: targetPsid,
          senderId: "page",
          text: messageText,
          timestamp: new Date().toISOString(),
        });

      } catch (err) {
        console.error(err);
        alert("Failed to send message: " + err.message);
      } finally {
        setSending(false);
      }
    }
  }

  // Helper: Format relative timestamp
  function formatRelativeTime(isoString) {
    if (!isoString) return "";
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    
    return date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  }

  // Filter threads by search query
  const filteredThreads = useMemo(() => {
    return threads.filter(t => t.name.toLowerCase().includes(searchQuery.toLowerCase()));
  }, [threads, searchQuery]);

  const activeThread = useMemo(() => {
    return threads.find(t => t.id === activeThreadId);
  }, [threads, activeThreadId]);

  return (
    <>
      <div className="kscr fade-in kmsg-shell" style={{ padding: "0", display: "flex", flexDirection: "column" }}>

        {/* Credentials Warning Banner */}
        {!isConfigured && !useDemo && (
          <div style={{ background: "oklch(95% .04 35)", borderLeft: "4px solid var(--terra)", padding: "12px 20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <strong style={{ color: "oklch(40% .18 35)", fontSize: 13 }}>Meta Proxy API URL Not Found</strong>
              <p style={{ margin: "2px 0 0", fontSize: 12, color: "var(--ink-3)" }}>
                `VITE_MESSENGER_API_URL` is missing in your `.env`.
              </p>
            </div>
            <button className="primary-button" onClick={() => setUseDemo(true)} style={{ fontSize: 12, padding: "5px 12px" }}>
              Launch Sandbox Demo
            </button>
          </div>
        )}

        {/* Sandbox Status Header */}
        {useDemo && (
          <div style={{ background: "oklch(96% .04 145)", borderBottom: "1px solid var(--line-strong)", padding: "8px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", zIndex: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: "var(--mint-deep)", animation: "pulse 2s infinite" }} />
              <span style={{ fontSize: 12, fontWeight: 700, color: "oklch(35% .12 145)" }}>SANDBOX DEMO MODE ACTIVE</span>
              <span style={{ fontSize: 11, color: "var(--ink-4)" }}>· Chat with simulated client bots</span>
            </div>
            {isConfigured && (
              <button 
                onClick={() => setUseDemo(false)} 
                style={{ background: "none", border: "1px solid var(--line)", padding: "3px 8px", borderRadius: 5, fontSize: 11, cursor: "pointer", color: "var(--ink-2)" }}
              >
                Switch to Live Meta API
              </button>
            )}
          </div>
        )}

        {/* Error Banner */}
        {errorMsg && (
          <div style={{ background: "oklch(95% .04 35)", color: "oklch(40% .18 35)", padding: "10px 20px", fontSize: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span>{errorMsg}</span>
            <button onClick={() => setUseDemo(true)} style={{ background: "none", border: "1px solid oklch(40% .18 35)", padding: "2px 6px", borderRadius: 4, color: "inherit", cursor: "pointer", fontSize: 11 }}>
              Use Sandbox Demo
            </button>
          </div>
        )}

        {/* Main Messenger Container */}
        <div className="kmsg-panes" style={{ display: "flex", flex: 1, overflow: "hidden", background: "var(--bg-2)" }}>

          {/* 1. Left Side: Thread List */}
          <div className="kmsg-threads" style={{ borderRight: "1px solid var(--line)", display: "flex", flexDirection: "column", background: "var(--bg-2)" }}>
            
            {/* Thread List Header */}
            <div style={{ padding: "16px 20px 12px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: "var(--ink)" }}>Conversations</h3>
              <button 
                onClick={useDemo ? () => setThreads(MOCK_THREADS) : fetchLiveThreads}
                disabled={loadingThreads}
                style={{ background: "none", border: "none", color: "var(--mint-deep)", cursor: "pointer", display: "flex", alignItems: "center", padding: 4 }}
                title="Refresh messages"
              >
                <Icons.Wifi size={14} style={{ animation: loadingThreads ? "spin 1s linear infinite" : "none" }} />
              </button>
            </div>

            {/* Thread Search Box */}
            <div style={{ padding: "0 20px 14px" }}>
              <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                <Icons.Search size={13} style={{ position: "absolute", left: 10, color: "var(--ink-4)" }} />
                <input 
                  type="text" 
                  placeholder="Filter conversations..." 
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  style={{
                    width: "100%",
                    border: "1px solid var(--line-strong)",
                    borderRadius: 8,
                    padding: "7px 10px 7px 30px",
                    fontSize: 12,
                    fontFamily: "var(--font)",
                    outline: "none",
                    background: "var(--bg)"
                  }}
                />
              </div>
            </div>

            {/* Scrollable Threads List */}
            <div style={{ flex: 1, overflowY: "auto", borderTop: "1px solid var(--line)" }}>
              {loadingThreads ? (
                <div style={{ padding: 24, textAlign: "center", color: "var(--ink-4)", fontSize: 13 }}>Loading threads...</div>
              ) : filteredThreads.length === 0 ? (
                <div style={{ padding: 32, textAlign: "center", color: "var(--ink-4)", fontSize: 13 }}>
                  <div style={{ fontSize: 24, marginBottom: 8 }}>💬</div>
                  No conversations found
                </div>
              ) : (
                filteredThreads.map(th => {
                  const isActive = th.id === activeThreadId;
                  return (
                    <div 
                      key={th.id}
                      onClick={() => setActiveThreadId(th.id)}
                      style={{
                        padding: "14px 20px",
                        borderBottom: "1px solid var(--line)",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                        background: isActive ? "oklch(96% .02 145)" : "transparent",
                        transition: "background 0.2s"
                      }}
                      className="messenger-thread-item"
                    >
                      {/* Avatar picture/initials */}
                      {th.avatarUrl ? (
                        <img 
                          src={th.avatarUrl} 
                          alt={th.name} 
                          style={{ width: 38, height: 38, borderRadius: "50%", background: "var(--bg-3)", flexShrink: 0 }}
                          onError={(e) => { e.target.src = ""; }} // Fallback to initials if blocked by browser / auth
                        />
                      ) : (
                        <Avatar name={th.name} hue={145} size={38} />
                      )}

                      {/* Thread details preview */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 2 }}>
                          <span style={{ fontWeight: isActive ? 700 : 600, fontSize: 13, color: "var(--ink)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", marginRight: 4 }}>
                            {th.name}
                          </span>
                          <span style={{ fontSize: 10, color: "var(--ink-4)", flexShrink: 0 }}>
                            {formatRelativeTime(th.updatedTime)}
                          </span>
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span style={{ 
                            fontSize: 11, 
                            color: th.unreadCount > 0 ? "var(--ink)" : "var(--ink-4)", 
                            fontWeight: th.unreadCount > 0 ? 600 : 400,
                            whiteSpace: "nowrap", 
                            overflow: "hidden", 
                            textOverflow: "ellipsis"
                          }}>
                            {th.lastMessage}
                          </span>
                          {th.unreadCount > 0 && (
                            <span style={{ 
                              background: "var(--mint-deep)", 
                              color: "#fff", 
                              fontSize: 9, 
                              fontWeight: 800,
                              minWidth: 16, 
                              height: 16, 
                              borderRadius: 8, 
                              display: "flex", 
                              alignItems: "center", 
                              justifyContent: "center", 
                              padding: "0 4px",
                              flexShrink: 0
                            }}>
                              {th.unreadCount}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* 2. Right Side: Chat Message Pane */}
          <div className="kmsg-chat" style={{ flex: 1, display: "flex", flexDirection: "column", background: "var(--bg)" }}>
            {activeThread ? (
              <>
                {/* Chat Panel Header */}
                <div style={{ padding: "14px 24px", borderBottom: "1px solid var(--line)", display: "flex", justifyContent: "space-between", alignItems: "center", background: "var(--bg)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    {activeThread.avatarUrl ? (
                      <img 
                        src={activeThread.avatarUrl} 
                        alt={activeThread.name} 
                        style={{ width: 36, height: 36, borderRadius: "50%", background: "var(--bg-3)" }} 
                      />
                    ) : (
                      <Avatar name={activeThread.name} hue={145} size={36} />
                    )}
                    <div>
                      <h4 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "var(--ink)" }}>{activeThread.name}</h4>
                      <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 2 }}>
                        <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: "var(--mint-deep)" }} />
                        <span style={{ fontSize: 10, color: "var(--ink-4)", fontWeight: 500 }}>Messenger Live</span>
                      </div>
                    </div>
                  </div>

                  {/* Header Actions */}
                  <span style={{ fontSize: 11, color: "var(--ink-4)", background: "var(--bg-3)", padding: "4px 8px", borderRadius: 6, fontWeight: 600 }}>
                    Thread ID: {activeThread.id}
                  </span>
                </div>

                {/* Message Log scrollable pane */}
                <div style={{ flex: 1, padding: "20px 24px", overflowY: "auto", background: "var(--bg)", display: "flex", flexDirection: "column", gap: 14 }}>
                  {loadingMessages ? (
                    <div style={{ padding: 48, textAlign: "center", color: "var(--ink-4)", fontSize: 13 }}>Loading thread history...</div>
                  ) : messages.length === 0 ? (
                    <div style={{ padding: 48, textAlign: "center", color: "var(--ink-4)", fontSize: 13 }}>No messages in this conversation. Write a response below.</div>
                  ) : (
                    messages.map((msg, index) => {
                      const isAgent = msg.sender === "agent";
                      return (
                        <div
                          key={msg.id || index}
                          className="kmsg-bubble-wrap"
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            alignItems: isAgent ? "flex-end" : "flex-start",
                            alignSelf: isAgent ? "flex-end" : "flex-start"
                          }}
                        >
                          {/* Message bubble */}
                          <div 
                            style={{
                              background: isAgent ? "var(--mint-deep)" : "var(--bg-3)",
                              color: isAgent ? "#ffffff" : "var(--ink)",
                              padding: "10px 14px",
                              borderRadius: isAgent ? "14px 14px 2px 14px" : "14px 14px 14px 2px",
                              fontSize: 13,
                              lineHeight: 1.5,
                              wordBreak: "break-word",
                              boxShadow: "0 1px 2px rgba(0,0,0,0.05)"
                            }}
                          >
                            {msg.text}
                          </div>

                          {/* Message metadata */}
                          <div style={{ display: "flex", gap: 6, marginTop: 4, padding: "0 4px", fontSize: 9, color: "var(--ink-4)" }}>
                            {isAgent && (
                              <span style={{ fontWeight: 600, color: "var(--mint-deep)" }}>
                                {agentName}
                              </span>
                            )}
                            <span>
                              {new Date(msg.createdTime).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                            </span>
                          </div>
                        </div>
                      );
                    })
                  )}
                  <div ref={messagesEndRef} />
                </div>

                {/* Composer Footer */}
                <form 
                  onSubmit={handleSendMessage}
                  style={{
                    padding: "16px 24px",
                    background: "var(--bg)",
                    borderTop: "1px solid var(--line)"
                  }}
                >
                  <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    <input 
                      type="text"
                      placeholder={`Write a reply as ${agentName}...`}
                      value={inputText}
                      onChange={e => setInputText(e.target.value)}
                      disabled={sending}
                      style={{
                        flex: 1,
                        border: "1px solid var(--line-strong)",
                        borderRadius: 10,
                        padding: "10px 16px",
                        fontSize: 13,
                        fontFamily: "var(--font)",
                        outline: "none",
                        background: "var(--bg)",
                        transition: "border-color 0.2s"
                      }}
                      onFocus={(e) => e.target.style.borderColor = "var(--mint-deep)"}
                      onBlur={(e) => e.target.style.borderColor = "var(--line-strong)"}
                    />
                    <button 
                      type="submit"
                      disabled={sending || !inputText.trim()}
                      style={{
                        background: "var(--mint-deep)",
                        color: "#ffffff",
                        border: "none",
                        width: 38,
                        height: 38,
                        borderRadius: 10,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        cursor: "pointer",
                        opacity: (sending || !inputText.trim()) ? 0.6 : 1,
                        transition: "opacity 0.2s"
                      }}
                      title="Send message"
                    >
                      {sending ? (
                        <div 
                          style={{
                            width: 14,
                            height: 14,
                            border: "2px solid #ffffff",
                            borderTopColor: "transparent",
                            borderRadius: "50%",
                            animation: "spin 0.6s linear infinite"
                          }}
                        />
                      ) : (
                        <Icons.Send size={15} />
                      )}
                    </button>
                  </div>
                </form>
              </>
            ) : (
              // Empty State (no conversation selected)
              <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 32, background: "var(--bg)" }}>
                <div style={{ 
                  width: 64, 
                  height: 64, 
                  borderRadius: "50%", 
                  background: "rgba(31,110,76,0.08)", 
                  display: "flex", 
                  alignItems: "center", 
                  justifyContent: "center",
                  color: "var(--mint-deep)",
                  marginBottom: 16
                }}>
                  <Icons.Message size={28} sw={1.5} />
                </div>
                <h3 style={{ margin: "0 0 6px", fontSize: 16, fontWeight: 700, color: "var(--ink)" }}>Messenger Inbox</h3>
                <p style={{ margin: 0, fontSize: 13, color: "var(--ink-4)", textAlign: "center", maxWidth: 300, lineHeight: 1.5 }}>
                  Select a conversation from the sidebar list to view threads and send replies.
                </p>
              </div>
            )}
          </div>

        </div>

      </div>

      {/* Embedded Spinner CSS inside React */}
      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        @keyframes pulse {
          0% { opacity: 0.6; box-shadow: 0 0 0 0 rgba(31,110,76,0.4); }
          70% { opacity: 1; box-shadow: 0 0 0 6px rgba(31,110,76,0); }
          100% { opacity: 0.6; box-shadow: 0 0 0 0 rgba(31,110,76,0); }
        }
      `}</style>
    </>
  );
}

export default Messenger;
