"use client";

import { useState, useTransition } from "react";
import { clsx } from "clsx";
import { Heart, MessageCircle } from "lucide-react";
import { toggleLike } from "@/app/compliments/actions";

type Props = {
  recognitionId: string;
  initialLikes: number;
  commentCount: number;
};

export function FeedEngagement({ recognitionId, initialLikes, commentCount }: Props) {
  const [likes, setLikes] = useState(initialLikes);
  const [liked, setLiked] = useState(false);
  const [pending, startTransition] = useTransition();

  function onLike() {
    // Optimistic update, reconciled with the server's authoritative count.
    setLiked((prev) => !prev);
    setLikes((prev) => prev + (liked ? -1 : 1));
    startTransition(async () => {
      const result = await toggleLike(recognitionId);
      if (result.ok) {
        setLiked(result.liked);
        setLikes(result.count);
      }
    });
  }

  return (
    <div className="ml-auto flex items-center gap-3 text-[13px] text-brand-grey">
      <button
        type="button"
        onClick={onLike}
        disabled={pending}
        aria-pressed={liked}
        aria-label={liked ? "Remove like" : "Like this recognition"}
        className={clsx(
          "flex items-center gap-1.5 rounded-element px-1.5 py-1 transition hover:bg-brand-cloudDancer/60",
          liked && "text-value-customerFocus-dark"
        )}
      >
        <Heart className={clsx("h-4 w-4", liked && "fill-current")} />
        {likes}
      </button>
      <span className="flex items-center gap-1.5 px-1.5 py-1">
        <MessageCircle className="h-4 w-4" />
        {commentCount}
      </span>
    </div>
  );
}
