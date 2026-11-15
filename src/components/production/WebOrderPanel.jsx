import { useCallback, useEffect, useState } from "react";
import { supabase } from "../../supabase";
import { cn } from "../ui";
import { WebGlobe } from "./WebMark";
import { fmtField } from "../../lib/calendar";
import { FILE_KIND_LABEL, mailtoHref, telHref, urlLabel, webInfo } from "../../lib/webOrders";

/**
 * "From the website": what a customer sent with an order they placed on the website, in the order card's Details pane.
 *
 * Everything here was typed by a stranger (lib/webOrders.js `webInfo` makes it safe to draw): it is shown as text, and the only links are an
 * e-mail address, a phone number, an Instagram name and a website that passed their checks, opened with rel="noopener noreferrer". The card's
 * Details pane scrolls inside itself for a website order (production-dialogs.css, `.pr-oc.is-web`), so a long message or a few files never make
 * the card taller than an order's card is.
 *
 * The files (the customer's logo, a picture of the design on the garment, the embroidery file for the machine) are in the private
 * storage bucket `website-orders`. Their links are made when the card opens (signed for 15 minutes) and made again if one is pressed after
 * ten, so a card left open on a desk still downloads. A link that could not be made says so beside the file instead of showing a broken picture.
 */

const BUCKET = "website-orders";
const SIGNED_SECONDS = 900;
const STALE_MS = 10 * 60 * 1000;

const SOURCE_WORDS = { instagram: "Instagram", website: "their website", upload: "an upload" };
const KIND_WORDS = { design: "Create by design", quote: "Quote request" };

const sizeText = (bytes) => {
  if (bytes == null) return "";
  if (bytes < 1024) return `${bytes} B`;
  return bytes < 1048576 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1048576).toFixed(1)} MB`;
};

const stampText = (iso) => {
  if (!iso) return "";
  return new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
};

const num = (n) => Number(n).toLocaleString("en-GB");

/** The signed links of the files, made when they first show and made again on request. { [path]: { url, at } | { error: true } } */
function useSignedLinks(files) {
  const [links, setLinks] = useState({});
  const key = files.map((f) => `${f.path}|${f.image ? "i" : f.name}`).join("\n");

  const sign = useCallback(async (file) => {
    try {
      // a picture is drawn in place; anything else is a download (the file's own name goes with it)
      const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(file.path, SIGNED_SECONDS, file.image ? undefined : { download: file.name });
      if (error || !data?.signedUrl) return { error: true };
      return { url: data.signedUrl, at: Date.now() };
    } catch {
      return { error: true };
    }
  }, []);

  useEffect(() => {
    let gone = false;
    files.forEach(async (file) => {
      const link = await sign(file);
      if (!gone) setLinks((cur) => ({ ...cur, [file.path]: link }));
    });
    return () => { gone = true; };
    // `files` is rebuilt on every render; `key` says when it really changed
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, sign]);

  const refresh = useCallback(async (file) => {
    const link = await sign(file);
    setLinks((cur) => ({ ...cur, [file.path]: link }));
    return link;
  }, [sign]);

  return { links, refresh };
}

/** A link to a file of the order. A link that has been waiting too long is made again first, then opened. */
function FileLink({ file, link, refresh, className, children }) {
  if (!link?.url) return null;
  const onClick = async (e) => {
    if (Date.now() - link.at < STALE_MS) return;
    e.preventDefault();
    const fresh = await refresh(file);
    if (fresh?.url) window.open(fresh.url, "_blank", "noopener,noreferrer");
  };
  return (
    <a className={className} href={link.url} target="_blank" rel="noopener noreferrer" onClick={onClick} {...(file.image ? {} : { download: file.name })}>
      {children}
    </a>
  );
}

function Row({ label, wide, children }) {
  return (
    <div className={cn("pr-fact", wide && "is-wide")}>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

export default function WebOrderPanel({ order }) {
  const info = webInfo(order);
  const { links, refresh } = useSignedLinks(info.files);
  const pictures = info.files.filter((f) => f.image && (f.kind === "preview" || f.kind === "logo"));
  const others = info.files.filter((f) => !pictures.includes(f));
  const mail = mailtoHref(info.contact.email);
  const tel = telHref(info.contact.phone);
  const hasBrand = info.brand.handleRaw || info.brand.websiteRaw || info.brand.logoFrom;
  const d = info.design;
  const designText = d ? [
    d.stitches != null && `${num(d.stitches)} stitches`,
    d.colours != null && `${num(d.colours)} ${d.colours === 1 ? "colour" : "colours"}`,
    d.widthMm != null && d.heightMm != null && `${num(Math.round(d.widthMm))} × ${num(Math.round(d.heightMm))} mm`,
    d.placement,
  ].filter(Boolean).join(" · ") : "";

  return (
    <section className="pr-web-sec" aria-label="From the website">
      <header className="pr-web-hd">
        <h3 className="pr-h"><WebGlobe size={13} /> From the website</h3>
        {info.kind && <span className="pr-tag pr-tag--info">{KIND_WORDS[info.kind]}</span>}
      </header>
      {info.receivedAt && <p className="pr-hint">Received {stampText(info.receivedAt)}</p>}

      {info.needsRightsCheck ? (
        <p className="pr-web-warn" role="note">
          <b>Check the logo is theirs before anything is made.</b> The customer did not say it is theirs, or that they may use it.
        </p>
      ) : info.brand.rightsConfirmed ? (
        <p className="pr-hint">The customer says the logo is theirs, or that they may use it.</p>
      ) : null}

      {/* the files come first: what the customer sees of their design, and what the machine reads */}
      {info.files.length > 0 && (
        <div className="pr-web-files">
          <h4 className="pr-h">Files</h4>
          {pictures.length > 0 && (
            <ul className="pr-web-pics">
              {pictures.map((f) => {
                const link = links[f.path];
                return (
                  <li key={f.path}>
                    {link?.url ? (
                      <FileLink file={f} link={link} refresh={refresh} className="pr-web-pic">
                        <img src={link.url} alt={f.kind === "logo" ? "The logo the customer sent" : "The design on the garment, as the customer saw it"} loading="lazy" referrerPolicy="no-referrer" />
                      </FileLink>
                    ) : (
                      <span className="pr-web-pic is-off">{link?.error ? "Could not load" : "Loading…"}</span>
                    )}
                    <span className="pr-web-cap">{FILE_KIND_LABEL[f.kind]}</span>
                  </li>
                );
              })}
            </ul>
          )}
          {others.length > 0 && (
            <ul className="pr-web-list">
              {others.map((f) => {
                const link = links[f.path];
                return (
                  <li key={f.path}>
                    <span className="pr-web-fn" title={f.name}>{f.name}</span>
                    <span className="pr-web-dim">{[FILE_KIND_LABEL[f.kind], sizeText(f.bytes)].filter(Boolean).join(" · ")}</span>
                    {link?.url
                      ? <FileLink file={f} link={link} refresh={refresh} className="pr-link">Download</FileLink>
                      : <span className="pr-web-dim">{link?.error ? "Could not load" : "Loading…"}</span>}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      <dl className="pr-facts pr-web-facts">
        {(info.contact.name || info.contact.email || info.contact.phone) && (
          <Row label="Contact" wide>
            {info.contact.name && <span>{info.contact.name}</span>}
            {info.contact.email && (mail ? <a className="pr-web-a" href={mail}>{info.contact.email}</a> : <span>{info.contact.email}</span>)}
            {info.contact.phone && (tel ? <a className="pr-web-a" href={tel}>{info.contact.phone}</a> : <span>{info.contact.phone}</span>)}
          </Row>
        )}
        {info.contact.company && <Row label="Company">{info.contact.company}</Row>}
        {info.service && <Row label="Service">{info.service}</Row>}
        {info.deadline && <Row label="Wanted by">{fmtField(info.deadline)}</Row>}
        {hasBrand && (
          <Row label="Brand" wide>
            {info.brand.handleRaw && (info.brand.handle
              ? <a className="pr-web-a" href={`https://instagram.com/${info.brand.handle}`} target="_blank" rel="noopener noreferrer">@{info.brand.handle}</a>
              : <span>{info.brand.handleRaw}</span>)}
            {info.brand.websiteRaw && (info.brand.website
              ? <a className="pr-web-a" href={info.brand.website} target="_blank" rel="noopener noreferrer">{urlLabel(info.brand.website)}</a>
              : <span>{info.brand.websiteRaw}</span>)}
            {info.brand.logoFrom && <span className="pr-web-dim">logo from {SOURCE_WORDS[info.brand.logoFrom]}</span>}
          </Row>
        )}
        {info.items.length > 0 && (
          <Row label={info.items.length === 1 ? "Item" : "Items"} wide>
            <ul className="pr-web-items">
              {info.items.map((it, i) => (
                <li key={i}>
                  {it.qty != null && <b>{num(it.qty)} ×</b>} {it.label}
                  {it.colour && (it.colour.label || it.colour.hex) && (
                    <span className="pr-web-colour">
                      {it.colour.hex && <i style={{ background: it.colour.hex }} aria-hidden="true" />}
                      {it.colour.label || it.colour.hex}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </Row>
        )}
        {designText && <Row label="Design" wide>{designText}</Row>}
        {info.message && <Row label="Their message" wide><span className="pr-web-msg">{info.message}</span></Row>}
      </dl>
    </section>
  );
}
