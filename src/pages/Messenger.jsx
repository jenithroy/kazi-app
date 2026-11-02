/**
 * Chat's old address. Chat is a window over the page you are on now (components/chat/ChatProvider.jsx, ChatPopup.jsx), so there is
 * no page here; this is what an old link, a bookmark, or a position whose only section is Chat arrives at. (The file, the /messenger
 * route and the `messenger` permission id keep the old name because links, push notifications and the permission matrix point at it.)
 *
 * It opens the window as it appears, with whatever the address asked for: /messenger?with=<person id> is the conversation with that
 * person, /messenger?thread=<conversation id> is one the person is already in. If the window is put away, what is left is this
 * one-line page with a button to bring it back.
 */
import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Icons } from "../components/ui";
import { BentoPage } from "../components/bento/Bento";
import { useChat } from "../components/chat/ChatProvider";
import "../components/chat/chat.css";

export default function Messenger() {
  const { open } = useChat();
  const [params] = useSearchParams();
  const target = { with: params.get("with"), thread: params.get("thread") };

  // Once, as the page appears. (`open` is stable, and the address is read from the first render, so there is nothing to follow.)
  useEffect(() => {
    open?.(target);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <BentoPage>
      <header className="kb-head">
        <div className="kb-head-l">
          <h1>Chat</h1>
        </div>
      </header>

      <div className="kchat-shim">
        <div className="kchat-empty">
          <span className="kchat-placeholder-ico">
            <Icons.Message size={26} sw={1.4} />
          </span>
          <h3>Chat opens in a window</h3>
          <p>It sits over whichever page you are on, so you can reply without leaving your work.</p>
          {open && (
            <button type="button" className="kb-btn kb-btn--primary" onClick={() => open(target)}>
              Open Chat
            </button>
          )}
        </div>
      </div>
    </BentoPage>
  );
}
