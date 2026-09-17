import { useEffect, useState } from "react";
import { pushMessageToDb } from "@/utils/MessageUtils";
import useBoundStore from "@/stores/useBoundStore";
import {
  type MessageInsert,
  type MessageRow,
  supabase,
  messageDirection,
} from "@/supabase/client";
import type { MediaLoad } from "@/stores/chatSlice";
import {
  cacheBlob,
  forgetCachedBlob,
  readCachedBlob,
  releaseMedia,
  retainMedia,
} from "@/utils/mediaCache";

/**
 * Why a message cannot be loaded as media, or null when it can. Computed
 * before any hook runs so the hook order never depends on the input, and
 * returned as an error state rather than thrown: a throw here unmounted the
 * whole app for every member opening the conversation (F04).
 */
function invalidMediaReason(message: MessageRow): string | null {
  const direction = messageDirection(message);

  if (direction !== "incoming" && direction !== "outgoing") {
    return `Message with id ${message.id} is not an incoming or outgoing message.`;
  }

  if (message.content.type !== "file") {
    return `Message with id ${message.id} is not a file message.`;
  }

  const mediaId = (message.content.file?.uri ?? "").replace(
    "internal://media/",
    "",
  );

  if (!mediaId) {
    return `Message with id ${message.id} has no valid media URI.`;
  }

  return null;
}

export function useMedia(message: MessageRow) {
  const invalid = invalidMediaReason(message);

  // Extract the storage path from the URI; "" when invalid (guarded below).
  const mediaId =
    message.content.type === "file"
      ? (message.content.file?.uri ?? "").replace("internal://media/", "")
      : "";

  const stored = useBoundStore((store) =>
    store.chat.mediaLoads.get(message.id),
  );
  const load: MediaLoad = invalid
    ? { type: "download", status: "error", error: invalid, handledOnce: false }
    : stored || {
        type: "download",
        status: "pending",
        handledOnce: false,
      };
  const setLoad = useBoundStore((store) => store.chat.setMediaLoad);
  const userId = useBoundStore((store) => store.ui.user?.id);
  const [cancel, setCancel] = useState(false);

  // F21: while the message is mounted its blob is in use — recent, and kept
  // in memory past the budget.
  useEffect(() => {
    retainMedia(message.id);
    return () => {
      releaseMedia(message.id);
    };
  }, [message.id]);

  const keepOnDisk = (blob: Blob) => {
    if (userId) cacheBlob(userId, mediaId, blob).catch(console.error);
  };

  const uploadTask = async () => {
    if (
      invalid ||
      !load.blob ||
      load.type === "download" ||
      load.status === "done" ||
      load.status === "loading"
    ) {
      return;
    }

    setLoad(message.id, { ...load, status: "loading", error: undefined });

    const { error } = await supabase.storage
      .from("media")
      .upload(mediaId, load.blob, {
        upsert: true,
      });

    if (cancel) {
      setCancel(false);
      return;
    }

    if (
      error &&
      error.message !== "new row violates row-level security policy" // weird Supabase bug, it might be related to React loading hooks twice during development - cabra 2024/07/30
    ) {
      setLoad(message.id, { ...load, status: "error", error: error.message });
      return;
    }

    setLoad(message.id, { ...load, status: "done" });
    if (!error) keepOnDisk(load.blob);

    !error && (await pushMessageToDb(message as MessageInsert));
  };

  const downloadTask = async () => {
    if (invalid || load.status === "done" || load.status === "loading") {
      return;
    }

    setLoad(message.id, { ...load, status: "loading", error: undefined });

    // F21: downloaded before, then evicted from memory or lost to a reload.
    const cached =
      userId &&
      (await readCachedBlob(userId, mediaId).catch((error: unknown) => {
        console.error(error);
        return undefined;
      }));
    if (cached) {
      setLoad(message.id, { ...load, status: "done", blob: cached });
      return;
    }

    const { data, error } = await supabase.storage
      .from("media")
      .download(mediaId);

    if (cancel) {
      setCancel(false);
      return;
    }

    if (error) {
      // P8: gone (F18 deleted it) or refused (access ended). Whatever is
      // cached for it is no longer ours to keep.
      const status = Number(
        (error as { statusCode?: string; status?: number }).statusCode ??
          (error as { status?: number }).status,
      );
      if (userId && (status === 404 || status === 403)) {
        forgetCachedBlob(userId, mediaId).catch(console.error);
      }

      setLoad(message.id, { ...load, status: "error", error: error.message });
      return;
    }

    setLoad(message.id, { ...load, status: "done", blob: data });
    keepOnDisk(data);
  };

  const startLoad = () => {
    setTimeout(load.type === "upload" ? uploadTask : downloadTask, 0);
  };

  const cancelLoad = () => {
    setCancel(true);
    setLoad(message.id, { ...load, status: "pending" });
  };

  const handleLoad = (filename?: string) => {
    if (!load.blob) {
      return;
    }

    setLoad(message.id, { ...load, handledOnce: true });

    const url = URL.createObjectURL(load.blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = filename || crypto.randomUUID(); // TODO: improve default filename - cabra 28/05/2024
    a.click();

    URL.revokeObjectURL(url);
    // TODO: do not keep in memory files with size bigger than 10 MB, or... any document after being handled? - cabra 02/06/2024
  };

  return { load, startLoad, cancelLoad, handleLoad };
}
