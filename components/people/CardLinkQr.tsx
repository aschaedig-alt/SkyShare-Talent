"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";

// A QR code for the hire's card link, shown in the send dialog so he can point
// his phone's camera at the screen and open the card in the phone's browser —
// asked for Nov 19 2026 as "text it to myself so the link comes in as a text on my
// phone". The app has no texting service, and this gets the same result with
// none: the camera offers the link, the browser opens it, and the Add to contacts
// button there behaves exactly as it will for the people the email goes to.
//
// Drawn HERE, in the browser, on purpose. A free QR-image service would have been
// one line, but it would mean sending every hire's no-login card link — which
// opens their mobile number — to a third party.
//
// Always dark-on-white, in dark mode too: phone cameras read a light background
// most reliably, and an inverted code fails on some of them.

export function CardLinkQr({ url, name }: { url: string; name: string }) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    setSrc(null);
    setFailed(false);
    QRCode.toDataURL(url, { errorCorrectionLevel: "M", margin: 2, width: 320, color: { dark: "#0d2c43", light: "#ffffff" } })
      .then((data) => live && setSrc(data))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [url]);

  return (
    <div className="mt-3 flex flex-col items-center gap-3 rounded border border-brand-lea/12 p-3 sm:flex-row sm:items-center dark:border-white/10">
      <div className="flex h-36 w-36 shrink-0 items-center justify-center rounded bg-white p-1">
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element -- a data: URL drawn in the browser; next/image adds nothing here
          <img src={src} alt={`QR code that opens ${name}'s contact card`} className="h-full w-full" />
        ) : (
          <span className="px-2 text-center text-[11px] text-brand-grey">
            {failed ? "Couldn't draw the code — use the link above." : "Drawing…"}
          </span>
        )}
      </div>
      <div className="text-sm text-brand-grey dark:text-slate-400">
        <p className="font-semibold text-brand-lea dark:text-slate-100">Try it on your phone</p>
        <p className="mt-1">
          Point your phone&apos;s camera at this code and tap the link that appears. It opens {name}&apos;s card in your
          browser &mdash; the same page the email&apos;s button opens &mdash; so you can add them to your contacts or check
          it before you send.
        </p>
      </div>
    </div>
  );
}
